import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import type {
  GitHubAvailableRepoDto,
  GitHubInstallationDto,
  GitHubInstallationStatus,
  LinkedPullRequestRefDto,
  ProjectRepositoryDto,
  ProjectRepositoryOverviewDto,
  PullRequestChangedFileDto,
  PullRequestDetailDto,
  PullRequestFilesResponseDto,
  PullRequestGitHubReviewDto,
  PullRequestInternalReviewDto,
  PullRequestReviewCommentDto,
  PullRequestState,
  PullRequestsListResponseDto,
} from "@devcollab/shared";
import { AuthorizationService } from "../authorization/authorization.service";
import {
  toGitHubInstallationDto,
  toLinkedPullRequestRefDto,
  toProjectRepositoryDto,
  toPullRequestInternalReviewDto,
  toPullRequestLinkedTaskDto,
  toPullRequestReviewCommentDto,
  toPullRequestSummaryDto,
} from "../common/mappers";
import {
  isPrismaUniqueError,
  optionalDiffAnchor,
  optionalTaskDescription,
  parseInternalReviewDecision,
  parsePullRequestFilter,
  requireCommentBody,
  requireGitHubNumericId,
  requireRequiredId,
} from "../common/validation";
import { DatabaseService } from "../database/database.service";
import {
  GitHubApiError,
  GitHubAppClientService,
  type GitHubPullRequestPayload,
  type GitHubRepoPayload,
  type GitHubReviewPayload,
} from "./github-app-client.service";
import { GitHubConfigService } from "./github-config.service";

const USER_SELECT = { id: true, name: true, email: true, image: true } as const;
const SYNC_COOLDOWN_MS = 15_000;
const INSTALL_SESSION_TTL_MS = 15 * 60_000;
const LARGE_DIFF_LINES = 600;
const LARGE_DIFF_CHANGES = 1500;
const BINARY_EXT_RE = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tar|woff2?|ttf|eot|exe|dll|so|bin|mp4|webm|mp3)$/i;

function sha256Hex(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function mapPullRequestState(pr: {
  state: string;
  merged_at?: string | null;
  merged?: boolean;
}): PullRequestState {
  if (pr.merged_at || pr.merged) return "MERGED";
  if (pr.state.toLowerCase() === "closed") return "CLOSED";
  return "OPEN";
}

function deriveReviewDecision(reviews: GitHubReviewPayload[]): string | null {
  if (!reviews.length) return null;
  const latestByUser = new Map<string, string>();
  for (const r of reviews) {
    const login = r.user?.login;
    if (!login) continue;
    const state = String(r.state || "").toUpperCase();
    if (state === "APPROVED" || state === "CHANGES_REQUESTED" || state === "DISMISSED") {
      latestByUser.set(login, state);
    } else if (!latestByUser.has(login) && state === "COMMENTED") {
      latestByUser.set(login, state);
    }
  }
  const states = [...latestByUser.values()];
  if (states.includes("CHANGES_REQUESTED")) return "CHANGES_REQUESTED";
  if (states.includes("APPROVED")) return "APPROVED";
  if (states.includes("COMMENTED")) return "COMMENTED";
  return null;
}

function classifyChangedFile(file: {
  sha: string | null;
  filename: string;
  previous_filename?: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  blob_url?: string;
}): PullRequestChangedFileDto {
  const patch = typeof file.patch === "string" ? file.patch : null;
  const lineCount = patch ? patch.split(/\r?\n/).length : 0;
  const isBinary =
    patch === null &&
    (BINARY_EXT_RE.test(file.filename) || (file.changes === 0 && file.status !== "renamed"));
  const isTruncated = patch === null && !isBinary && file.changes > 0;
  const isLarge = lineCount > LARGE_DIFF_LINES || file.changes > LARGE_DIFF_CHANGES;
  const normalizedStatus = (
    ["added", "removed", "modified", "renamed", "copied", "changed", "unchanged"].includes(
      file.status,
    )
      ? file.status
      : "modified"
  ) as PullRequestChangedFileDto["status"];

  return {
    sha: file.sha ?? null,
    filename: file.filename,
    previousFilename: file.previous_filename ?? null,
    status: normalizedStatus,
    additions: file.additions,
    deletions: file.deletions,
    changes: file.changes,
    patch,
    isBinary,
    isTruncated,
    isLarge,
    lineCount,
    blobUrl: file.blob_url ?? null,
  };
}

@Injectable()
export class GitHubService {
  constructor(
    private readonly db: DatabaseService,
    private readonly authz: AuthorizationService,
    private readonly config: GitHubConfigService,
    private readonly client: GitHubAppClientService,
  ) {}

  private async requireActiveProject(orgId: string, projectId: string) {
    const project = await this.db.prisma.project.findFirst({
      where: { id: projectId, organizationId: orgId },
      select: { id: true, name: true, key: true, status: true },
    });
    if (!project) throw new NotFoundException("Project not found in this organization.");
    if (project.status === "ARCHIVED") {
      throw new ConflictException("This project is archived. Restore it before modifying integrations or reviews.");
    }
    return project;
  }

  private async getCurrentProjectRepoRow(orgId: string, projectId: string) {
    return this.db.prisma.projectRepository.findFirst({
      where: {
        organizationId: orgId,
        projectId,
        status: { not: "DISCONNECTED" },
      },
      include: { installation: true },
      orderBy: [{ connectedAt: "desc" }],
    });
  }

  private async requireConnectedProjectRepo(orgId: string, projectId: string) {
    const repo = await this.getCurrentProjectRepoRow(orgId, projectId);
    if (!repo) {
      throw new NotFoundException("No GitHub repository is connected to this project.");
    }
    return repo;
  }

  async startInstallSession(
    actorUserId: string,
    orgId: string,
    projectId: string,
  ): Promise<{ installUrl: string; expiresAt: string }> {
    const creds = this.config.requireAppCredentials();
    await this.requireActiveProject(orgId, projectId);

    const rawState = randomBytes(32).toString("base64url");
    const stateHash = sha256Hex(rawState);
    const expiresAt = new Date(Date.now() + INSTALL_SESSION_TTL_MS);

    await this.db.prisma.gitHubInstallSession.create({
      data: {
        stateHash,
        userId: actorUserId,
        organizationId: orgId,
        projectId,
        expiresAt,
      },
    });

    const installUrl = `https://github.com/apps/${encodeURIComponent(creds.appSlug)}/installations/new?state=${encodeURIComponent(rawState)}`;
    return { installUrl, expiresAt: expiresAt.toISOString() };
  }

  async completeInstallCallback(
    actorUserId: string,
    body: { state?: unknown; installationId?: unknown; setupAction?: unknown },
  ): Promise<{
    status: "ready" | "cancelled";
    organizationId: string;
    projectId: string;
    installation?: GitHubInstallationDto;
  }> {
    const rawState = requireRequiredId(body?.state, "GitHub installation state");
    const stateHash = sha256Hex(rawState);
    const now = new Date();

    const session = await this.db.prisma.gitHubInstallSession.findUnique({
      where: { stateHash },
    });
    if (!session || session.consumedAt !== null || session.expiresAt <= now) {
      throw new BadRequestException("This GitHub setup session is invalid or has expired. Please start again.");
    }
    if (session.userId !== actorUserId) {
      throw new ForbiddenException("This GitHub setup session belongs to another user.");
    }

    await this.authz.requireProjectAccess(
      actorUserId,
      session.organizationId,
      session.projectId,
      "manage",
    );

    const consumed = await this.db.prisma.gitHubInstallSession.updateMany({
      where: { id: session.id, consumedAt: null },
      data: { consumedAt: now },
    });
    if (consumed.count === 0) {
      throw new BadRequestException("This GitHub setup session has already been used.");
    }

    if (body?.setupAction === "cancel") {
      return {
        status: "cancelled",
        organizationId: session.organizationId,
        projectId: session.projectId,
      };
    }

    const githubInstallationId = requireGitHubNumericId(body?.installationId, "installation ID");
    const ghInst = await this.client.getInstallation(githubInstallationId).catch((err) => {
      if (err instanceof GitHubApiError) {
        throw new HttpException(err.message, err.status);
      }
      throw new ServiceUnavailableException("Could not verify GitHub installation.");
    });

    const accountLogin = ghInst.account?.login ?? `installation-${githubInstallationId}`;
    const accountType = ghInst.account?.type ?? "Organization";
    const instStatus: GitHubInstallationStatus = ghInst.suspended_at ? "SUSPENDED" : "ACTIVE";

    const installation = await this.db.prisma.$transaction(async (tx) => {
      const saved = await tx.gitHubAppInstallation.upsert({
        where: { githubInstallationId },
        create: {
          githubInstallationId,
          accountLogin,
          accountType,
          accountAvatarUrl: ghInst.account?.avatar_url ?? null,
          status: instStatus,
          permissions: (ghInst.permissions ?? undefined) as never,
          suspendedAt: ghInst.suspended_at ? new Date(ghInst.suspended_at) : null,
          deletedAt: null,
        },
        update: {
          accountLogin,
          accountType,
          accountAvatarUrl: ghInst.account?.avatar_url ?? null,
          status: instStatus,
          permissions: (ghInst.permissions ?? undefined) as never,
          suspendedAt: ghInst.suspended_at ? new Date(ghInst.suspended_at) : null,
          deletedAt: null,
        },
      });

      await tx.organizationGitHubInstallation.upsert({
        where: {
          organizationId_installationId: {
            organizationId: session.organizationId,
            installationId: saved.id,
          },
        },
        create: {
          organizationId: session.organizationId,
          installationId: saved.id,
          connectedById: actorUserId,
        },
        update: {
          connectedById: actorUserId,
        },
      });

      return saved;
    });

    return {
      status: "ready",
      organizationId: session.organizationId,
      projectId: session.projectId,
      installation: toGitHubInstallationDto(installation),
    };
  }

  async listOrgInstallations(orgId: string): Promise<GitHubInstallationDto[]> {
    const links = await this.db.prisma.organizationGitHubInstallation.findMany({
      where: {
        organizationId: orgId,
        installation: { status: { not: "REVOKED" } },
      },
      include: { installation: true },
      orderBy: [{ createdAt: "desc" }],
    });
    return links.map((l) => toGitHubInstallationDto(l.installation));
  }

  private async requireOrgInstallation(orgId: string, githubInstallationId: string) {
    const normalizedId = requireGitHubNumericId(githubInstallationId, "installation ID");
    const link = await this.db.prisma.organizationGitHubInstallation.findFirst({
      where: {
        organizationId: orgId,
        installation: { githubInstallationId: normalizedId },
      },
      include: { installation: true },
    });
    if (!link) {
      throw new ForbiddenException(
        "This GitHub App installation is not authorized for the active organization.",
      );
    }
    if (link.installation.status === "REVOKED") {
      throw new ConflictException("This GitHub App installation was uninstalled or revoked.");
    }
    if (link.installation.status === "SUSPENDED") {
      throw new ConflictException("This GitHub App installation is currently suspended on GitHub.");
    }
    return link.installation;
  }

  async listInstallationRepositories(
    orgId: string,
    githubInstallationId: string,
  ): Promise<GitHubAvailableRepoDto[]> {
    const installation = await this.requireOrgInstallation(orgId, githubInstallationId);
    try {
      const res = await this.client.listInstallationRepositories(
        installation.githubInstallationId,
        1,
        100,
      );
      return (res.repositories ?? []).map((repo) => ({
        githubRepoId: String(repo.id),
        owner: repo.owner.login,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description ?? null,
        defaultBranch: repo.default_branch,
        isPrivate: Boolean(repo.private),
        htmlUrl: repo.html_url,
      }));
    } catch (error) {
      if (error instanceof GitHubApiError) {
        if (error.revokedOrNotFound) {
          await this.markInstallationStatus(installation.id, "REVOKED");
        }
        throw new HttpException(error.message, error.status);
      }
      throw new ServiceUnavailableException("Could not fetch repositories from GitHub.");
    }
  }

  private async markInstallationStatus(
    installationId: string,
    status: GitHubInstallationStatus,
  ) {
    await this.db.prisma.$transaction(async (tx) => {
      await tx.gitHubAppInstallation.update({
        where: { id: installationId },
        data: {
          status,
          suspendedAt: status === "SUSPENDED" ? new Date() : null,
          deletedAt: status === "REVOKED" ? new Date() : null,
        },
      });
      if (status !== "ACTIVE") {
        await tx.projectRepository.updateMany({
          where: { installationId, status: { in: ["CONNECTED", "ERROR"] } },
          data: {
            status: "ACCESS_REVOKED",
            lastSyncStatus: "FAILED",
            lastSyncError:
              status === "SUSPENDED"
                ? "GitHub App installation was suspended."
                : "GitHub App installation was uninstalled or revoked.",
          },
        });
      }
    });
  }

  async connectRepository(
    actorUserId: string,
    orgId: string,
    projectId: string,
    body: { githubInstallationId?: unknown; githubRepoId?: unknown },
  ): Promise<ProjectRepositoryDto> {
    await this.requireActiveProject(orgId, projectId);
    const githubInstallationId = requireGitHubNumericId(body?.githubInstallationId, "installation ID");
    const githubRepoId = requireGitHubNumericId(body?.githubRepoId, "repository ID");

    const installation = await this.requireOrgInstallation(orgId, githubInstallationId);

    const existingActive = await this.getCurrentProjectRepoRow(orgId, projectId);
    if (existingActive) {
      throw new ConflictException(
        "A repository is already associated with this project. Disconnect it before connecting another.",
      );
    }

    let matchedRepo: GitHubRepoPayload | undefined;
    try {
      for (let page = 1; page <= 3; page++) {
        const res = await this.client.listInstallationRepositories(
          installation.githubInstallationId,
          page,
          100,
        );
        matchedRepo = res.repositories.find((r) => String(r.id) === githubRepoId);
        if (matchedRepo || res.repositories.length < 100) break;
      }
    } catch (error) {
      if (error instanceof GitHubApiError) {
        if (error.revokedOrNotFound) {
          await this.markInstallationStatus(installation.id, "REVOKED");
        }
        throw new HttpException(error.message, error.status);
      }
      throw new ServiceUnavailableException("Could not verify repository access with GitHub.");
    }

    if (!matchedRepo) {
      throw new ForbiddenException(
        "The selected repository is not accessible through this GitHub App installation.",
      );
    }

    const saved = await this.db.prisma.$transaction(async (tx) => {
      const repoRow = await tx.projectRepository.create({
        data: {
          organizationId: orgId,
          projectId,
          installationId: installation.id,
          githubRepoId: String(matchedRepo.id),
          owner: matchedRepo.owner.login,
          name: matchedRepo.name,
          fullName: matchedRepo.full_name,
          defaultBranch: matchedRepo.default_branch,
          description: matchedRepo.description ?? null,
          htmlUrl: matchedRepo.html_url,
          isPrivate: Boolean(matchedRepo.private),
          status: "CONNECTED",
          activeLock: "ACTIVE",
          connectedById: actorUserId,
          lastSyncStatus: "SYNCING",
          lastSyncError: null,
        },
        include: { installation: true },
      });

      await tx.organizationAuditLog.create({
        data: {
          organizationId: orgId,
          projectId,
          actorId: actorUserId,
          action: "GITHUB_REPO_CONNECTED",
          summary: `Connected GitHub repository ${matchedRepo.full_name}`,
        },
      });

      return repoRow;
    });

    try {
      await this.syncConnectedRepoInternal(saved);
    } catch {
      // Initial sync error is already captured cleanly on the ProjectRepository record.
    }

    const refreshed = await this.requireConnectedProjectRepo(orgId, projectId);
    return toProjectRepositoryDto(refreshed, true);
  }

  async disconnectRepository(
    actorUserId: string,
    orgId: string,
    projectId: string,
  ): Promise<{ disconnected: true }> {
    const existing = await this.requireConnectedProjectRepo(orgId, projectId);
    await this.db.prisma.$transaction(async (tx) => {
      await tx.projectRepository.update({
        where: { id: existing.id },
        data: {
          status: "DISCONNECTED",
          activeLock: null,
          disconnectedAt: new Date(),
        },
      });
      await tx.organizationAuditLog.create({
        data: {
          organizationId: orgId,
          projectId,
          actorId: actorUserId,
          action: "GITHUB_REPO_DISCONNECTED",
          summary: `Disconnected GitHub repository ${existing.fullName}`,
        },
      });
    });

    return { disconnected: true };
  }

  async getRepositoryOverview(
    orgId: string,
    projectId: string,
    canManageRepository: boolean,
  ): Promise<ProjectRepositoryOverviewDto> {
    const [githubApp, repo, installations] = await Promise.all([
      Promise.resolve(this.config.getStatus()),
      this.getCurrentProjectRepoRow(orgId, projectId),
      canManageRepository ? this.listOrgInstallations(orgId) : Promise.resolve([]),
    ]);

    if (!repo) {
      return {
        githubApp,
        repository: null,
        installations,
        recentPullRequests: [],
        counts: { open: 0, draft: 0, merged: 0, closed: 0 },
        canManageRepository,
      };
    }

    const [recentPrs, openCount, draftCount, mergedCount, closedCount] = await Promise.all([
      this.db.prisma.pullRequest.findMany({
        where: { projectRepositoryId: repo.id },
        orderBy: [{ githubUpdatedAt: "desc" }],
        take: 6,
        include: { _count: { select: { reviewComments: true, taskLinks: true } } },
      }),
      this.db.prisma.pullRequest.count({
        where: { projectRepositoryId: repo.id, state: "OPEN", isDraft: false },
      }),
      this.db.prisma.pullRequest.count({
        where: { projectRepositoryId: repo.id, state: "OPEN", isDraft: true },
      }),
      this.db.prisma.pullRequest.count({
        where: { projectRepositoryId: repo.id, state: "MERGED" },
      }),
      this.db.prisma.pullRequest.count({
        where: { projectRepositoryId: repo.id, state: "CLOSED" },
      }),
    ]);

    return {
      githubApp,
      repository: toProjectRepositoryDto(repo, canManageRepository),
      installations,
      recentPullRequests: recentPrs.map(toPullRequestSummaryDto),
      counts: {
        open: openCount + draftCount,
        draft: draftCount,
        merged: mergedCount,
        closed: closedCount,
      },
      canManageRepository,
    };
  }

  private async upsertPullRequestPayload(
    repo: { id: string; organizationId: string; projectId: string },
    pr: GitHubPullRequestPayload,
    reviewDecision?: string | null,
  ) {
    const prState = mapPullRequestState(pr);
    const now = new Date();
    return this.db.prisma.pullRequest.upsert({
      where: {
        projectRepositoryId_number: {
          projectRepositoryId: repo.id,
          number: pr.number,
        },
      },
      create: {
        organizationId: repo.organizationId,
        projectId: repo.projectId,
        projectRepositoryId: repo.id,
        githubPrId: String(pr.id),
        number: pr.number,
        title: pr.title,
        body: pr.body ?? null,
        state: prState,
        isDraft: Boolean(pr.draft),
        authorLogin: pr.user?.login ?? "unknown",
        authorAvatarUrl: pr.user?.avatar_url ?? null,
        headRef: pr.head.ref,
        baseRef: pr.base.ref,
        headSha: pr.head.sha,
        mergeableState: pr.mergeable_state ?? null,
        githubReviewDecision: reviewDecision ?? null,
        additions: pr.additions ?? 0,
        deletions: pr.deletions ?? 0,
        changedFilesCount: pr.changed_files ?? 0,
        htmlUrl: pr.html_url,
        githubCreatedAt: new Date(pr.created_at),
        githubUpdatedAt: new Date(pr.updated_at),
        mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
        closedAt: pr.closed_at ? new Date(pr.closed_at) : null,
        lastSyncedAt: now,
      },
      update: {
        title: pr.title,
        body: pr.body ?? null,
        state: prState,
        isDraft: Boolean(pr.draft),
        authorLogin: pr.user?.login ?? "unknown",
        authorAvatarUrl: pr.user?.avatar_url ?? null,
        headRef: pr.head.ref,
        baseRef: pr.base.ref,
        headSha: pr.head.sha,
        ...(pr.mergeable_state !== undefined ? { mergeableState: pr.mergeable_state } : {}),
        ...(reviewDecision !== undefined ? { githubReviewDecision: reviewDecision } : {}),
        ...(pr.additions !== undefined ? { additions: pr.additions } : {}),
        ...(pr.deletions !== undefined ? { deletions: pr.deletions } : {}),
        ...(pr.changed_files !== undefined ? { changedFilesCount: pr.changed_files } : {}),
        htmlUrl: pr.html_url,
        githubUpdatedAt: new Date(pr.updated_at),
        mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
        closedAt: pr.closed_at ? new Date(pr.closed_at) : null,
        lastSyncedAt: now,
      },
    });
  }

  private async syncConnectedRepoInternal(repo: {
    id: string;
    organizationId: string;
    projectId: string;
    owner: string;
    name: string;
    installation: { id: string; githubInstallationId: string; status: GitHubInstallationStatus };
  }) {
    if (repo.installation.status !== "ACTIVE") {
      await this.db.prisma.projectRepository.update({
        where: { id: repo.id },
        data: {
          status: "ACCESS_REVOKED",
          lastSyncStatus: "FAILED",
          lastSyncError: `GitHub App installation is ${repo.installation.status.toLowerCase()}.`,
        },
      });
      throw new ConflictException("GitHub App installation access is suspended or revoked.");
    }

    await this.db.prisma.projectRepository.update({
      where: { id: repo.id },
      data: { lastSyncStatus: "SYNCING", lastSyncError: null },
    });

    try {
      const [ghRepo, prs] = await Promise.all([
        this.client.getRepository(repo.installation.githubInstallationId, repo.owner, repo.name),
        this.client.listPullRequests(repo.installation.githubInstallationId, repo.owner, repo.name, 1, 30),
      ]);

      // Hydrate additions/deletions/changed_files and GitHub review status on the most recent 8 PRs safely.
      const detailMap = new Map<number, { detail: GitHubPullRequestPayload; decision: string | null }>();
      for (let i = 0; i < Math.min(prs.length, 8); i += 4) {
        const chunk = prs.slice(i, i + 4);
        const settled = await Promise.all(
          chunk.map(async (item) => {
            const [detail, reviews] = await Promise.all([
              this.client
                .getPullRequest(
                  repo.installation.githubInstallationId,
                  ghRepo.owner.login,
                  ghRepo.name,
                  item.number,
                )
                .catch(() => item),
              this.client
                .listPullRequestReviews(
                  repo.installation.githubInstallationId,
                  ghRepo.owner.login,
                  ghRepo.name,
                  item.number,
                )
                .catch(() => []),
            ]);
            return { number: item.number, detail, decision: deriveReviewDecision(reviews) };
          }),
        );
        for (const entry of settled) {
          detailMap.set(entry.number, { detail: entry.detail, decision: entry.decision });
        }
      }

      for (const item of prs) {
        const enriched = detailMap.get(item.number);
        await this.upsertPullRequestPayload(
          repo,
          enriched?.detail ?? item,
          enriched?.decision,
        );
      }

      const openCount = await this.db.prisma.pullRequest.count({
        where: { projectRepositoryId: repo.id, state: "OPEN" },
      });

      await this.db.prisma.projectRepository.update({
        where: { id: repo.id },
        data: {
          owner: ghRepo.owner.login,
          name: ghRepo.name,
          fullName: ghRepo.full_name,
          defaultBranch: ghRepo.default_branch,
          description: ghRepo.description ?? null,
          htmlUrl: ghRepo.html_url,
          isPrivate: Boolean(ghRepo.private),
          status: "CONNECTED",
          openPrCount: openCount,
          lastSyncedAt: new Date(),
          lastSyncStatus: "SUCCEEDED",
          lastSyncError: null,
        },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Repository sync failed.";
      if (error instanceof GitHubApiError) {
        await this.db.prisma.projectRepository.update({
          where: { id: repo.id },
          data: {
            status: error.revokedOrNotFound ? "ACCESS_REVOKED" : "ERROR",
            lastSyncStatus: "FAILED",
            lastSyncError: msg,
          },
        });
        if (error.revokedOrNotFound) {
          this.client.invalidateInstallationToken(repo.installation.githubInstallationId);
        }
        throw new HttpException(msg, error.status);
      }
      await this.db.prisma.projectRepository.update({
        where: { id: repo.id },
        data: {
          status: "ERROR",
          lastSyncStatus: "FAILED",
          lastSyncError: msg,
        },
      });
      throw new ServiceUnavailableException(msg);
    }
  }

  async syncProjectRepository(
    orgId: string,
    projectId: string,
    canManageRepository: boolean,
    bypassCooldown = false,
  ): Promise<ProjectRepositoryDto> {
    this.config.requireAppCredentials();
    const repo = await this.requireConnectedProjectRepo(orgId, projectId);
    if (
      !bypassCooldown &&
      repo.lastSyncedAt &&
      Date.now() - repo.lastSyncedAt.getTime() < SYNC_COOLDOWN_MS
    ) {
      throw new HttpException(
        "Repository synced recently. Please wait 15 seconds between manual sync requests.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.syncConnectedRepoInternal(repo);
    const updated = await this.requireConnectedProjectRepo(orgId, projectId);
    return toProjectRepositoryDto(updated, canManageRepository);
  }

  async listPullRequests(
    orgId: string,
    projectId: string,
    canManageRepository: boolean,
    query: {
      state?: string;
      search?: string;
      sort?: string;
      page?: string;
      limit?: string;
    },
  ): Promise<PullRequestsListResponseDto> {
    const githubApp = this.config.getStatus();
    const repo = await this.getCurrentProjectRepoRow(orgId, projectId);
    if (!repo) {
      return {
        githubApp,
        repository: null,
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
        counts: { all: 0, open: 0, draft: 0, merged: 0, closed: 0 },
      };
    }

    const filter = parsePullRequestFilter(query.state);
    const where: Record<string, unknown> = {
      projectRepositoryId: repo.id,
    };
    if (filter === "OPEN") {
      where.state = "OPEN";
      where.isDraft = false;
    } else if (filter === "DRAFT") {
      where.state = "OPEN";
      where.isDraft = true;
    } else if (filter === "MERGED") {
      where.state = "MERGED";
    } else if (filter === "CLOSED") {
      where.state = "CLOSED";
    }

    const rawSearch = query.search?.trim() ?? "";
    if (rawSearch) {
      const numCandidate = Number.parseInt(rawSearch.replace(/^#/, ""), 10);
      const orClauses: Record<string, unknown>[] = [
        { title: { contains: rawSearch, mode: "insensitive" } },
        { headRef: { contains: rawSearch, mode: "insensitive" } },
        { baseRef: { contains: rawSearch, mode: "insensitive" } },
        { authorLogin: { contains: rawSearch, mode: "insensitive" } },
      ];
      if (/^#?\d+$/.test(rawSearch) && Number.isInteger(numCandidate) && numCandidate > 0) {
        orClauses.push({ number: numCandidate });
      }
      where.OR = orClauses;
    }

    const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.limit ?? "20", 10) || 20));
    const skip = (page - 1) * pageSize;

    const orderBy =
      query.sort === "newest"
        ? [{ githubCreatedAt: "desc" as const }]
        : query.sort === "oldest"
          ? [{ githubCreatedAt: "asc" as const }]
          : [{ githubUpdatedAt: "desc" as const }];

    const [total, rows, allCount, openCount, draftCount, mergedCount, closedCount] =
      await Promise.all([
        this.db.prisma.pullRequest.count({ where: where as never }),
        this.db.prisma.pullRequest.findMany({
          where: where as never,
          orderBy,
          skip,
          take: pageSize,
          include: { _count: { select: { reviewComments: true, taskLinks: true } } },
        }),
        this.db.prisma.pullRequest.count({ where: { projectRepositoryId: repo.id } }),
        this.db.prisma.pullRequest.count({
          where: { projectRepositoryId: repo.id, state: "OPEN", isDraft: false },
        }),
        this.db.prisma.pullRequest.count({
          where: { projectRepositoryId: repo.id, state: "OPEN", isDraft: true },
        }),
        this.db.prisma.pullRequest.count({
          where: { projectRepositoryId: repo.id, state: "MERGED" },
        }),
        this.db.prisma.pullRequest.count({
          where: { projectRepositoryId: repo.id, state: "CLOSED" },
        }),
      ]);

    return {
      githubApp,
      repository: toProjectRepositoryDto(repo, canManageRepository),
      items: rows.map(toPullRequestSummaryDto),
      total,
      page,
      pageSize,
      counts: {
        all: allCount,
        open: openCount + draftCount,
        draft: draftCount,
        merged: mergedCount,
        closed: closedCount,
      },
    };
  }

  private async requirePullRequestForRepo(orgId: string, projectId: string, prNumber: number) {
    const repo = await this.requireConnectedProjectRepo(orgId, projectId);
    const pr = await this.db.prisma.pullRequest.findFirst({
      where: {
        projectRepositoryId: repo.id,
        organizationId: orgId,
        projectId,
        number: prNumber,
      },
      include: {
        project: { select: { status: true } },
        _count: { select: { reviewComments: true, taskLinks: true } },
      },
    });
    if (!pr) {
      throw new NotFoundException(`Pull request #${prNumber} was not found in this project.`);
    }
    return { repo, pr };
  }

  async getPullRequestDetail(
    orgId: string,
    projectId: string,
    prNumber: number,
    actorUserId: string,
    canManageRepository: boolean,
  ): Promise<PullRequestDetailDto> {
    const { repo, pr } = await this.requirePullRequestForRepo(orgId, projectId, prNumber);

    let githubReviews: PullRequestGitHubReviewDto[] = [];
    let githubReviewsUnavailable = false;
    let currentPr = pr;

    if (
      this.config.getStatus().configured &&
      repo.status === "CONNECTED" &&
      repo.installation.status === "ACTIVE"
    ) {
      try {
        const [freshPr, rawReviews] = await Promise.all([
          this.client.getPullRequest(
            repo.installation.githubInstallationId,
            repo.owner,
            repo.name,
            prNumber,
          ),
          this.client.listPullRequestReviews(
            repo.installation.githubInstallationId,
            repo.owner,
            repo.name,
            prNumber,
          ),
        ]);
        const decision = deriveReviewDecision(rawReviews);
        await this.upsertPullRequestPayload(repo, freshPr, decision);
        githubReviews = rawReviews.map((r) => ({
          id: String(r.id),
          authorLogin: r.user?.login ?? "github-user",
          authorAvatarUrl: r.user?.avatar_url ?? null,
          state: String(r.state || "COMMENTED").toUpperCase(),
          submittedAt: r.submitted_at ?? null,
        }));
        const reloaded = await this.requirePullRequestForRepo(orgId, projectId, prNumber);
        currentPr = reloaded.pr;
      } catch {
        githubReviewsUnavailable = true;
      }
    } else {
      githubReviewsUnavailable = true;
    }

    const [comments, internalReviews, taskLinks] = await Promise.all([
      this.db.prisma.pullRequestReviewComment.findMany({
        where: { pullRequestId: currentPr.id },
        orderBy: [{ createdAt: "asc" }],
        include: {
          author: { select: USER_SELECT },
          resolvedBy: { select: USER_SELECT },
        },
      }),
      this.db.prisma.pullRequestInternalReview.findMany({
        where: { pullRequestId: currentPr.id },
        orderBy: [{ updatedAt: "desc" }],
        include: { reviewer: { select: USER_SELECT } },
      }),
      this.db.prisma.taskPullRequestLink.findMany({
        where: { pullRequestId: currentPr.id, projectId, organizationId: orgId },
        orderBy: [{ createdAt: "desc" }],
        include: {
          task: {
            select: {
              id: true,
              identifier: true,
              title: true,
              status: true,
              priority: true,
              assignee: { select: USER_SELECT },
            },
          },
        },
      }),
    ]);

    const projectActive = currentPr.project.status === "ACTIVE";
    const summaryDto = toPullRequestSummaryDto(currentPr);

    return {
      repository: toProjectRepositoryDto(repo, canManageRepository),
      pullRequest: {
        ...summaryDto,
        body: currentPr.body,
      },
      githubReviews,
      githubReviewsUnavailable,
      internalReviews: internalReviews.map((r) =>
        toPullRequestInternalReviewDto(r, currentPr.headSha),
      ),
      comments: comments.map((c) =>
        toPullRequestReviewCommentDto(c, currentPr.headSha, actorUserId, canManageRepository),
      ),
      linkedTasks: taskLinks.map(toPullRequestLinkedTaskDto),
      canReview: projectActive && repo.status !== "DISCONNECTED",
      canLinkTasks: projectActive && repo.status === "CONNECTED",
      canManageRepository,
      canSync: projectActive && this.config.getStatus().configured && repo.status !== "DISCONNECTED",
    };
  }

  async getPullRequestFiles(
    orgId: string,
    projectId: string,
    prNumber: number,
  ): Promise<PullRequestFilesResponseDto> {
    const { repo, pr } = await this.requirePullRequestForRepo(orgId, projectId, prNumber);

    if (!this.config.getStatus().configured) {
      return {
        files: [],
        truncated: false,
        headSha: pr.headSha,
        rateLimited: false,
        unavailableReason: "GitHub App credentials are not configured on the server.",
      };
    }

    if (repo.status !== "CONNECTED" || repo.installation.status !== "ACTIVE") {
      return {
        files: [],
        truncated: false,
        headSha: pr.headSha,
        rateLimited: false,
        unavailableReason:
          repo.lastSyncError || "Repository access is currently unavailable or revoked.",
      };
    }

    try {
      const rawFiles = await this.client.listPullRequestFiles(
        repo.installation.githubInstallationId,
        repo.owner,
        repo.name,
        prNumber,
        1,
        100,
      );
      const files = rawFiles.map(classifyChangedFile);
      return {
        files,
        truncated: pr.changedFilesCount > files.length || files.length >= 100,
        headSha: pr.headSha,
        rateLimited: false,
        unavailableReason: null,
      };
    } catch (error) {
      if (error instanceof GitHubApiError) {
        if (error.revokedOrNotFound) {
          await this.db.prisma.projectRepository.update({
            where: { id: repo.id },
            data: {
              status: "ACCESS_REVOKED",
              lastSyncStatus: "FAILED",
              lastSyncError: error.message,
            },
          });
        }
        return {
          files: [],
          truncated: false,
          headSha: pr.headSha,
          rateLimited: error.rateLimited,
          unavailableReason: error.message,
        };
      }
      return {
        files: [],
        truncated: false,
        headSha: pr.headSha,
        rateLimited: false,
        unavailableReason: "Unable to load changed files from GitHub.",
      };
    }
  }

  async createReviewComment(
    actorUserId: string,
    canManageProject: boolean,
    orgId: string,
    projectId: string,
    prNumber: number,
    bodyInput: { body?: unknown; filePath?: unknown; lineNumber?: unknown; lineSide?: unknown },
  ): Promise<PullRequestReviewCommentDto> {
    await this.requireActiveProject(orgId, projectId);
    const { pr } = await this.requirePullRequestForRepo(orgId, projectId, prNumber);
    const body = requireCommentBody(bodyInput?.body);
    const anchor = optionalDiffAnchor({
      filePath: bodyInput?.filePath,
      lineNumber: bodyInput?.lineNumber,
      lineSide: bodyInput?.lineSide,
    });

    const created = await this.db.prisma.pullRequestReviewComment.create({
      data: {
        organizationId: orgId,
        projectId,
        pullRequestId: pr.id,
        authorId: actorUserId,
        body,
        filePath: anchor.filePath,
        lineNumber: anchor.lineNumber,
        lineSide: anchor.lineSide,
        commitSha: pr.headSha,
      },
      include: {
        author: { select: USER_SELECT },
        resolvedBy: { select: USER_SELECT },
      },
    });

    return toPullRequestReviewCommentDto(created, pr.headSha, actorUserId, canManageProject);
  }

  async editReviewComment(
    actorUserId: string,
    canManageProject: boolean,
    orgId: string,
    projectId: string,
    prNumber: number,
    commentId: string,
    bodyInput: unknown,
  ): Promise<PullRequestReviewCommentDto> {
    await this.requireActiveProject(orgId, projectId);
    const { pr } = await this.requirePullRequestForRepo(orgId, projectId, prNumber);
    const body = requireCommentBody(bodyInput);

    const existing = await this.db.prisma.pullRequestReviewComment.findFirst({
      where: { id: commentId, pullRequestId: pr.id, projectId, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException("Review comment not found.");
    if (existing.authorId !== actorUserId) {
      throw new ForbiddenException("You can only edit your own review comments.");
    }

    const updated = await this.db.prisma.pullRequestReviewComment.update({
      where: { id: existing.id },
      data: { body, editedAt: new Date() },
      include: {
        author: { select: USER_SELECT },
        resolvedBy: { select: USER_SELECT },
      },
    });

    return toPullRequestReviewCommentDto(updated, pr.headSha, actorUserId, canManageProject);
  }

  async deleteReviewComment(
    actorUserId: string,
    canManageProject: boolean,
    orgId: string,
    projectId: string,
    prNumber: number,
    commentId: string,
  ): Promise<{ deleted: true }> {
    await this.requireActiveProject(orgId, projectId);
    const { pr } = await this.requirePullRequestForRepo(orgId, projectId, prNumber);

    const existing = await this.db.prisma.pullRequestReviewComment.findFirst({
      where: { id: commentId, pullRequestId: pr.id, projectId, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException("Review comment not found.");
    if (existing.authorId !== actorUserId && !canManageProject) {
      throw new ForbiddenException("You do not have permission to delete this review comment.");
    }

    await this.db.prisma.pullRequestReviewComment.delete({ where: { id: existing.id } });
    return { deleted: true };
  }

  async setReviewCommentStatus(
    actorUserId: string,
    canManageProject: boolean,
    orgId: string,
    projectId: string,
    prNumber: number,
    commentId: string,
    resolved: boolean,
  ): Promise<PullRequestReviewCommentDto> {
    await this.requireActiveProject(orgId, projectId);
    const { pr } = await this.requirePullRequestForRepo(orgId, projectId, prNumber);

    const existing = await this.db.prisma.pullRequestReviewComment.findFirst({
      where: { id: commentId, pullRequestId: pr.id, projectId, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException("Review comment not found.");

    const updated = await this.db.prisma.pullRequestReviewComment.update({
      where: { id: existing.id },
      data: resolved
        ? { status: "RESOLVED", resolvedById: actorUserId, resolvedAt: new Date() }
        : { status: "OPEN", resolvedById: null, resolvedAt: null },
      include: {
        author: { select: USER_SELECT },
        resolvedBy: { select: USER_SELECT },
      },
    });

    return toPullRequestReviewCommentDto(updated, pr.headSha, actorUserId, canManageProject);
  }

  async upsertInternalReview(
    actorUserId: string,
    orgId: string,
    projectId: string,
    prNumber: number,
    body: { decision?: unknown; summary?: unknown },
  ): Promise<PullRequestInternalReviewDto> {
    await this.requireActiveProject(orgId, projectId);
    const { pr } = await this.requirePullRequestForRepo(orgId, projectId, prNumber);
    const decision = parseInternalReviewDecision(body?.decision);
    const summary = optionalTaskDescription(body?.summary);

    const saved = await this.db.prisma.pullRequestInternalReview.upsert({
      where: {
        pullRequestId_reviewerId: {
          pullRequestId: pr.id,
          reviewerId: actorUserId,
        },
      },
      create: {
        organizationId: orgId,
        projectId,
        pullRequestId: pr.id,
        reviewerId: actorUserId,
        decision,
        summary,
        commitSha: pr.headSha,
      },
      update: {
        decision,
        summary,
        commitSha: pr.headSha,
      },
      include: { reviewer: { select: USER_SELECT } },
    });

    return toPullRequestInternalReviewDto(saved, pr.headSha);
  }

  async listLinkedPullRequestsForTask(
    orgId: string,
    projectId: string,
    taskId: string,
  ): Promise<LinkedPullRequestRefDto[]> {
    const links = await this.db.prisma.taskPullRequestLink.findMany({
      where: {
        organizationId: orgId,
        projectId,
        taskId,
        pullRequest: {
          projectRepository: { status: "CONNECTED" },
        },
      },
      orderBy: [{ createdAt: "desc" }],
      include: {
        pullRequest: {
          include: {
            projectRepository: { select: { fullName: true } },
          },
        },
      },
    });
    return links.map(toLinkedPullRequestRefDto);
  }

  async linkTaskAndPullRequest(
    actorUserId: string,
    orgId: string,
    projectId: string,
    input: { taskId: string; pullRequestId?: string; prNumber?: number },
  ): Promise<{ linked: true }> {
    await this.requireActiveProject(orgId, projectId);
    const repo = await this.requireConnectedProjectRepo(orgId, projectId);
    if (repo.status !== "CONNECTED") {
      throw new ConflictException("Connect a working GitHub repository before linking pull requests.");
    }

    const [task, pr, actor] = await Promise.all([
      this.db.prisma.task.findFirst({
        where: { id: input.taskId, projectId, organizationId: orgId },
        select: { id: true, identifier: true, archivedAt: true },
      }),
      this.db.prisma.pullRequest.findFirst({
        where: {
          projectRepositoryId: repo.id,
          projectId,
          organizationId: orgId,
          ...(input.pullRequestId ? { id: input.pullRequestId } : {}),
          ...(input.prNumber !== undefined ? { number: input.prNumber } : {}),
        },
        select: { id: true, number: true, title: true },
      }),
      this.db.prisma.user.findUnique({
        where: { id: actorUserId },
        select: { name: true, email: true },
      }),
    ]);

    if (!task) throw new NotFoundException("Task not found in this project.");
    if (task.archivedAt) {
      throw new ConflictException("Restore the task before linking pull requests.");
    }
    if (!pr) throw new NotFoundException("Pull request not found in this project's connected repository.");

    const who = actor?.name?.trim() || actor?.email || "A member";
    await this.db.prisma.$transaction(async (tx) => {
      const existing = await tx.taskPullRequestLink.findUnique({
        where: { taskId_pullRequestId: { taskId: task.id, pullRequestId: pr.id } },
        select: { id: true },
      });
      if (existing) return;

      await tx.taskPullRequestLink.create({
        data: {
          organizationId: orgId,
          projectId,
          taskId: task.id,
          pullRequestId: pr.id,
          linkedById: actorUserId,
        },
      });
      await tx.taskActivity.create({
        data: {
          taskId: task.id,
          projectId,
          actorId: actorUserId,
          eventType: "PR_LINKED",
          newValue: `#${pr.number}`,
          summary: `${who} linked PR #${pr.number} (${pr.title.slice(0, 60)})`,
        },
      });
    });

    return { linked: true };
  }

  async unlinkTaskAndPullRequest(
    actorUserId: string,
    orgId: string,
    projectId: string,
    input: { taskId: string; pullRequestId?: string; prNumber?: number },
  ): Promise<{ unlinked: true }> {
    await this.requireActiveProject(orgId, projectId);
    const repo = await this.requireConnectedProjectRepo(orgId, projectId);

    const [task, pr, actor] = await Promise.all([
      this.db.prisma.task.findFirst({
        where: { id: input.taskId, projectId, organizationId: orgId },
        select: { id: true },
      }),
      this.db.prisma.pullRequest.findFirst({
        where: {
          projectRepositoryId: repo.id,
          projectId,
          organizationId: orgId,
          ...(input.pullRequestId ? { id: input.pullRequestId } : {}),
          ...(input.prNumber !== undefined ? { number: input.prNumber } : {}),
        },
        select: { id: true, number: true },
      }),
      this.db.prisma.user.findUnique({
        where: { id: actorUserId },
        select: { name: true, email: true },
      }),
    ]);

    if (!task) throw new NotFoundException("Task not found in this project.");
    if (!pr) throw new NotFoundException("Pull request not found in this project.");

    const who = actor?.name?.trim() || actor?.email || "A member";
    await this.db.prisma.$transaction(async (tx) => {
      const deleted = await tx.taskPullRequestLink.deleteMany({
        where: { taskId: task.id, pullRequestId: pr.id, projectId, organizationId: orgId },
      });
      if (deleted.count > 0) {
        await tx.taskActivity.create({
          data: {
            taskId: task.id,
            projectId,
            actorId: actorUserId,
            eventType: "PR_UNLINKED",
            oldValue: `#${pr.number}`,
            summary: `${who} unlinked PR #${pr.number}`,
          },
        });
      }
    });

    return { unlinked: true };
  }

  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    const secret = this.config.getWebhookSecret();
    if (!secret) {
      throw new ServiceUnavailableException("GITHUB_WEBHOOK_SECRET is not configured.");
    }
    if (!signatureHeader || !/^sha256=[a-f0-9]{64}$/i.test(signatureHeader)) {
      return false;
    }
    const expected = Buffer.from(
      `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`,
      "utf8",
    );
    const provided = Buffer.from(signatureHeader, "utf8");
    if (expected.length !== provided.length) return false;
    return timingSafeEqual(expected, provided);
  }

  async processWebhook(input: {
    deliveryId: string | undefined;
    event: string | undefined;
    signature256: string | undefined;
    rawBody: Buffer;
  }): Promise<{ ok: true; duplicate?: boolean; status: string }> {
    if (!this.verifyWebhookSignature(input.rawBody, input.signature256)) {
      throw new UnauthorizedException("Invalid GitHub webhook signature.");
    }

    const deliveryId = requireRequiredId(input.deliveryId, "X-GitHub-Delivery");
    const event = requireRequiredId(input.event, "X-GitHub-Event");

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(input.rawBody.toString("utf8")) as Record<string, unknown>;
    } catch {
      throw new BadRequestException("Invalid JSON webhook payload.");
    }

    const action = typeof payload.action === "string" ? payload.action : null;
    const rawInstId =
      payload.installation &&
      typeof payload.installation === "object" &&
      "id" in payload.installation &&
      payload.installation.id !== undefined
        ? String(payload.installation.id)
        : null;
    const rawRepoId =
      payload.repository &&
      typeof payload.repository === "object" &&
      "id" in payload.repository &&
      payload.repository.id !== undefined
        ? String(payload.repository.id)
        : null;

    try {
      await this.db.prisma.gitHubWebhookDelivery.create({
        data: {
          deliveryId,
          event,
          action,
          githubInstallationId: rawInstId,
          githubRepoId: rawRepoId,
          status: "RECEIVED",
        },
      });
    } catch (error) {
      if (isPrismaUniqueError(error)) {
        return { ok: true, duplicate: true, status: "DUPLICATE_IGNORED" };
      }
      throw error;
    }

    let status = "PROCESSED";
    try {
      if (event === "ping") {
        status = "PROCESSED";
      } else if (event === "installation" && rawInstId) {
        const inst = await this.db.prisma.gitHubAppInstallation.findUnique({
          where: { githubInstallationId: rawInstId },
        });
        if (inst) {
          if (action === "deleted") {
            this.client.invalidateInstallationToken(rawInstId);
            await this.markInstallationStatus(inst.id, "REVOKED");
          } else if (action === "suspend") {
            this.client.invalidateInstallationToken(rawInstId);
            await this.markInstallationStatus(inst.id, "SUSPENDED");
          } else if (action === "unsuspend") {
            await this.db.prisma.$transaction(async (tx) => {
              await tx.gitHubAppInstallation.update({
                where: { id: inst.id },
                data: { status: "ACTIVE", suspendedAt: null },
              });
              await tx.projectRepository.updateMany({
                where: { installationId: inst.id, status: "ACCESS_REVOKED" },
                data: { status: "CONNECTED", lastSyncError: null, lastSyncStatus: "SUCCEEDED" },
              });
            });
          }
        }
      } else if (event === "installation_repositories" && rawInstId) {
        const inst = await this.db.prisma.gitHubAppInstallation.findUnique({
          where: { githubInstallationId: rawInstId },
        });
        if (inst) {
          const removed = Array.isArray(payload.repositories_removed)
            ? payload.repositories_removed
                .map((r) => (r && typeof r === "object" && "id" in r ? String(r.id) : ""))
                .filter(Boolean)
            : [];
          const added = Array.isArray(payload.repositories_added)
            ? payload.repositories_added
                .map((r) => (r && typeof r === "object" && "id" in r ? String(r.id) : ""))
                .filter(Boolean)
            : [];
          if (removed.length > 0) {
            await this.db.prisma.projectRepository.updateMany({
              where: { installationId: inst.id, githubRepoId: { in: removed }, status: { not: "DISCONNECTED" } },
              data: {
                status: "ACCESS_REVOKED",
                lastSyncStatus: "FAILED",
                lastSyncError: "Repository access was removed from this GitHub App installation.",
              },
            });
          }
          if (added.length > 0 && inst.status === "ACTIVE") {
            await this.db.prisma.projectRepository.updateMany({
              where: { installationId: inst.id, githubRepoId: { in: added }, status: "ACCESS_REVOKED" },
              data: { status: "CONNECTED", lastSyncError: null, lastSyncStatus: "SUCCEEDED" },
            });
          }
        }
      } else if (event === "pull_request" && rawRepoId && payload.pull_request && typeof payload.pull_request === "object") {
        const prData = payload.pull_request as unknown as GitHubPullRequestPayload;
        const connectedRepos = await this.db.prisma.projectRepository.findMany({
          where: {
            githubRepoId: rawRepoId,
            status: "CONNECTED",
            ...(rawInstId ? { installation: { githubInstallationId: rawInstId } } : {}),
          },
          select: { id: true, organizationId: true, projectId: true },
        });
        for (const repo of connectedRepos) {
          await this.upsertPullRequestPayload(repo, prData);
          const openCount = await this.db.prisma.pullRequest.count({
            where: { projectRepositoryId: repo.id, state: "OPEN" },
          });
          await this.db.prisma.projectRepository.update({
            where: { id: repo.id },
            data: { openPrCount: openCount, lastSyncedAt: new Date(), lastSyncStatus: "SUCCEEDED", lastSyncError: null },
          });
        }
      } else if (event === "pull_request_review" && rawRepoId && payload.pull_request && typeof payload.pull_request === "object") {
        const prObj = payload.pull_request as { number?: number };
        const reviewObj = payload.review as { state?: string } | undefined;
        if (typeof prObj.number === "number") {
          const connectedRepos = await this.db.prisma.projectRepository.findMany({
            where: {
              githubRepoId: rawRepoId,
              status: "CONNECTED",
              ...(rawInstId ? { installation: { githubInstallationId: rawInstId } } : {}),
            },
            select: { id: true },
          });
          const reviewState = reviewObj?.state ? String(reviewObj.state).toUpperCase() : undefined;
          for (const repo of connectedRepos) {
            await this.db.prisma.pullRequest.updateMany({
              where: { projectRepositoryId: repo.id, number: prObj.number },
              data: {
                ...(reviewState && ["APPROVED", "CHANGES_REQUESTED", "COMMENTED", "DISMISSED"].includes(reviewState)
                  ? { githubReviewDecision: reviewState }
                  : {}),
                lastSyncedAt: new Date(),
              },
            });
          }
        }
      } else {
        status = "IGNORED";
      }

      await this.db.prisma.gitHubWebhookDelivery.update({
        where: { deliveryId },
        data: { status, processedAt: new Date() },
      });
      return { ok: true, status };
    } catch (error) {
      await this.db.prisma.gitHubWebhookDelivery
        .update({
          where: { deliveryId },
          data: {
            status: "FAILED",
            errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Webhook failed",
            processedAt: new Date(),
          },
        })
        .catch(() => {});
      throw error;
    }
  }
}
