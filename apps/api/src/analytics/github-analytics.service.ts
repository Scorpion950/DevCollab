import { Injectable } from "@nestjs/common";
import type { GitHubAnalyticsDto } from "@devcollab/shared";
import { DatabaseService } from "../database/database.service";
import type { ParsedAnalyticsFilter } from "./date-range.util";

const STALE_SYNC_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const RECENT_PR_UPDATE_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class GitHubAnalyticsService {
  constructor(private readonly db: DatabaseService) {}

  async getGitHubAnalytics(input: {
    organizationId: string;
    projectIds: string[] | null;
    filter: ParsedAnalyticsFilter;
    now?: Date;
  }): Promise<GitHubAnalyticsDto> {
    const now = input.now ?? new Date();
    const projectScope =
      input.projectIds !== null ? { projectId: { in: input.projectIds } } : {};

    const connectedRepos = await this.db.prisma.projectRepository.findMany({
      where: {
        organizationId: input.organizationId,
        ...projectScope,
        status: "CONNECTED",
      },
      orderBy: [{ lastSyncedAt: "desc" }],
      select: {
        id: true,
        projectId: true,
        fullName: true,
        lastSyncedAt: true,
        lastSyncStatus: true,
        lastSyncError: true,
      },
    });

    const reviewBoundaryNote =
      "GitHub PR review decisions reflect synced GitHub metadata and are tracked separately from internal DevCollab review decisions.";

    if (connectedRepos.length === 0) {
      return {
        state: "NOT_CONNECTED",
        statusMessage: "No GitHub repository is currently connected in this scope.",
        connectedRepoCount: 0,
        repoFullName: null,
        lastSyncedAt: null,
        openPullRequests: 0,
        draftPullRequests: 0,
        mergedInPeriod: 0,
        closedInPeriod: 0,
        updatedRecentlyCount: 0,
        githubAwaitingReviewCount: 0,
        internallyApprovedCount: 0,
        averageMergeTimeHours: null,
        mergeTimeSampleCount: 0,
        reviewBoundaryNote,
      };
    }

    const syncedTimestamps = connectedRepos
      .map((r) => r.lastSyncedAt)
      .filter((d): d is Date => d instanceof Date);
    const latestSync =
      syncedTimestamps.length > 0
        ? new Date(Math.max(...syncedTimestamps.map((d) => d.getTime())))
        : null;
    const errorRepo = connectedRepos.find((r) => r.lastSyncStatus === "ERROR");
    const repoLabel =
      connectedRepos.length === 1
        ? connectedRepos[0]!.fullName
        : `${connectedRepos.length} connected repositories`;

    let state: GitHubAnalyticsDto["state"] = "READY";
    let statusMessage = `Synchronized ${repoLabel} metadata from persisted records.`;

    if (!latestSync && errorRepo) {
      state = "SYNC_ERROR";
      statusMessage =
        errorRepo.lastSyncError ||
        "Latest GitHub synchronization reported an error before initial sync completed.";
    } else if (!latestSync) {
      state = "NOT_YET_SYNCHRONIZED";
      statusMessage =
        "Repository is connected, but no pull request sync snapshot has completed yet.";
    } else if (errorRepo) {
      state = "SYNC_ERROR";
      statusMessage =
        errorRepo.lastSyncError ||
        "Most recent GitHub sync encountered an error; showing last persisted PR snapshot.";
    } else if (now.getTime() - latestSync.getTime() > STALE_SYNC_THRESHOLD_MS) {
      state = "STALE_SYNC";
      statusMessage =
        "Synced GitHub pull request snapshot is more than 24 hours old; run a repository sync to refresh.";
    }

    const sevenDaysAgo = new Date(now.getTime() - RECENT_PR_UPDATE_DAYS_MS);
    const prBaseWhere = {
      organizationId: input.organizationId,
      ...projectScope,
      projectRepository: { status: "CONNECTED" as const },
    };

    const [
      openPullRequests,
      draftPullRequests,
      closedInPeriod,
      updatedRecentlyCount,
      githubAwaitingReviewCount,
      internallyApprovedCount,
      mergedRows,
    ] = await Promise.all([
      this.db.prisma.pullRequest.count({
        where: { ...prBaseWhere, state: "OPEN" },
      }),
      this.db.prisma.pullRequest.count({
        where: { ...prBaseWhere, state: "OPEN", isDraft: true },
      }),
      this.db.prisma.pullRequest.count({
        where: {
          ...prBaseWhere,
          state: "CLOSED",
          closedAt: {
            gte: input.filter.periodStartDate,
            lt: input.filter.periodEndExclusiveDate,
          },
        },
      }),
      this.db.prisma.pullRequest.count({
        where: {
          ...prBaseWhere,
          githubUpdatedAt: { gte: sevenDaysAgo },
        },
      }),
      this.db.prisma.pullRequest.count({
        where: {
          ...prBaseWhere,
          state: "OPEN",
          isDraft: false,
          NOT: { githubReviewDecision: "APPROVED" },
        },
      }),
      this.db.prisma.pullRequestInternalReview.count({
        where: {
          organizationId: input.organizationId,
          ...projectScope,
          decision: "INTERNALLY_APPROVED",
          pullRequest: {
            state: "OPEN",
            projectRepository: { status: "CONNECTED" },
          },
        },
      }),
      this.db.prisma.pullRequest.findMany({
        where: {
          ...prBaseWhere,
          state: "MERGED",
          mergedAt: {
            gte: input.filter.periodStartDate,
            lt: input.filter.periodEndExclusiveDate,
          },
        },
        select: { githubCreatedAt: true, mergedAt: true },
      }),
    ]);

    let mergeHoursSum = 0;
    let mergeTimeSampleCount = 0;
    for (const pr of mergedRows) {
      if (!pr.mergedAt) continue;
      const diffMs = pr.mergedAt.getTime() - pr.githubCreatedAt.getTime();
      if (diffMs >= 0) {
        mergeHoursSum += diffMs / 3_600_000;
        mergeTimeSampleCount += 1;
      }
    }

    return {
      state,
      statusMessage,
      connectedRepoCount: connectedRepos.length,
      repoFullName: connectedRepos.length === 1 ? connectedRepos[0]!.fullName : null,
      lastSyncedAt: latestSync ? latestSync.toISOString() : null,
      openPullRequests,
      draftPullRequests,
      mergedInPeriod: mergedRows.length,
      closedInPeriod,
      updatedRecentlyCount,
      githubAwaitingReviewCount,
      internallyApprovedCount,
      averageMergeTimeHours:
        mergeTimeSampleCount > 0
          ? Math.round((mergeHoursSum / mergeTimeSampleCount) * 10) / 10
          : null,
      mergeTimeSampleCount,
      reviewBoundaryNote,
    };
  }
}
