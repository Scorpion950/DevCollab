import { Injectable } from "@nestjs/common";
import type {
  TaskDeliveryAnalyticsDto,
  TaskHealthInsightDto,
  TaskHealthItemDto,
  TaskLifecycleAnalyticsDto,
  TaskStatus,
} from "@devcollab/shared";
import { DatabaseService } from "../database/database.service";
import {
  computeComparison,
  findBucketIndex,
  type ParsedAnalyticsFilter,
} from "./date-range.util";

const STATUS_META: Array<{ status: TaskStatus; label: string }> = [
  { status: "BACKLOG", label: "Backlog" },
  { status: "TODO", label: "Todo" },
  { status: "IN_PROGRESS", label: "In Progress" },
  { status: "IN_REVIEW", label: "In Review" },
  { status: "DONE", label: "Done" },
];

const DUE_SOON_MS = 72 * 60 * 60 * 1000;
const STALE_REVIEW_MS = 5 * 24 * 60 * 60 * 1000;
const INACTIVE_ACTIVE_MS = 7 * 24 * 60 * 60 * 1000;

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function medianHours(samples: number[]): number | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return round1(sorted[mid]!);
  return round1((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function avgHours(samples: number[]): number | null {
  if (samples.length === 0) return null;
  const sum = samples.reduce((acc, v) => acc + v, 0);
  return round1(sum / samples.length);
}

@Injectable()
export class TaskAnalyticsService {
  constructor(private readonly db: DatabaseService) {}

  async getDeliveryAnalytics(input: {
    organizationId: string;
    projectIds: string[] | null;
    filter: ParsedAnalyticsFilter;
    now?: Date;
  }): Promise<TaskDeliveryAnalyticsDto> {
    const now = input.now ?? new Date();
    const scopeWhere = {
      organizationId: input.organizationId,
      ...(input.projectIds !== null ? { projectId: { in: input.projectIds } } : {}),
    };

    const [
      statusCounts,
      archivedTasks,
      overdueTasks,
      createdCurrentRows,
      completedCurrentRows,
      createdPreviousCount,
      completedPreviousCount,
    ] = await Promise.all([
      this.db.prisma.task.groupBy({
        by: ["status"],
        where: { ...scopeWhere, archivedAt: null },
        _count: { _all: true },
      }),
      this.db.prisma.task.count({
        where: { ...scopeWhere, archivedAt: { not: null } },
      }),
      this.db.prisma.task.count({
        where: {
          ...scopeWhere,
          archivedAt: null,
          status: { not: "DONE" },
          dueDate: { lt: now },
        },
      }),
      this.db.prisma.task.findMany({
        where: {
          ...scopeWhere,
          archivedAt: null,
          createdAt: {
            gte: input.filter.periodStartDate,
            lt: input.filter.periodEndExclusiveDate,
          },
        },
        select: { createdAt: true },
      }),
      this.db.prisma.task.findMany({
        where: {
          ...scopeWhere,
          archivedAt: null,
          status: "DONE",
          completedAt: {
            gte: input.filter.periodStartDate,
            lt: input.filter.periodEndExclusiveDate,
          },
        },
        select: { completedAt: true },
      }),
      this.db.prisma.task.count({
        where: {
          ...scopeWhere,
          archivedAt: null,
          createdAt: {
            gte: input.filter.previousStartDate,
            lt: input.filter.previousEndExclusiveDate,
          },
        },
      }),
      this.db.prisma.task.count({
        where: {
          ...scopeWhere,
          archivedAt: null,
          status: "DONE",
          completedAt: {
            gte: input.filter.previousStartDate,
            lt: input.filter.previousEndExclusiveDate,
          },
        },
      }),
    ]);

    const byStatus = new Map<TaskStatus, number>();
    for (const row of statusCounts) {
      byStatus.set(row.status as TaskStatus, row._count._all);
    }

    const statusDistribution = STATUS_META.map((item) => ({
      status: item.status,
      label: item.label,
      count: byStatus.get(item.status) ?? 0,
    }));

    const totalNonArchivedTasks = statusDistribution.reduce((sum, s) => sum + s.count, 0);
    const completedTasks = byStatus.get("DONE") ?? 0;
    const tasksInReview = byStatus.get("IN_REVIEW") ?? 0;
    const activeTasks = totalNonArchivedTasks - completedTasks;

    const trends = input.filter.buckets.map((b) => ({
      bucketKey: b.bucketKey,
      label: b.label,
      createdCount: 0,
      completedCount: 0,
    }));

    for (const r of createdCurrentRows) {
      const idx = findBucketIndex(input.filter.buckets, r.createdAt);
      if (idx >= 0) trends[idx]!.createdCount += 1;
    }

    for (const r of completedCurrentRows) {
      if (!r.completedAt) continue;
      const idx = findBucketIndex(input.filter.buckets, r.completedAt);
      if (idx >= 0) trends[idx]!.completedCount += 1;
    }

    return {
      totalNonArchivedTasks,
      activeTasks,
      completedTasks,
      archivedTasks,
      overdueTasks,
      tasksInReview,
      createdInPeriod: createdCurrentRows.length,
      completedInPeriod: completedCurrentRows.length,
      createdComparison: computeComparison(createdCurrentRows.length, createdPreviousCount),
      completedComparison: computeComparison(completedCurrentRows.length, completedPreviousCount),
      statusDistribution,
      trends,
      archiveRuleNote:
        "Archived tasks (archivedAt != null) are excluded from backlog, completion, and period trend metrics and tracked separately.",
    };
  }

  async getProjectLifecycleAnalytics(input: {
    organizationId: string;
    projectId: string;
    filter: ParsedAnalyticsFilter;
  }): Promise<TaskLifecycleAnalyticsDto> {
    const [completedTasks, reopenedInPeriodCount] = await Promise.all([
      this.db.prisma.task.findMany({
        where: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          archivedAt: null,
          status: "DONE",
          completedAt: {
            gte: input.filter.periodStartDate,
            lt: input.filter.periodEndExclusiveDate,
          },
        },
        select: { id: true, createdAt: true, completedAt: true },
      }),
      this.db.prisma.taskActivity.count({
        where: {
          projectId: input.projectId,
          eventType: "TASK_REOPENED",
          createdAt: {
            gte: input.filter.periodStartDate,
            lt: input.filter.periodEndExclusiveDate,
          },
        },
      }),
    ]);

    const taskIds = completedTasks.map((t) => t.id);
    const activities =
      taskIds.length > 0
        ? await this.db.prisma.taskActivity.findMany({
            where: {
              projectId: input.projectId,
              taskId: { in: taskIds },
              eventType: { in: ["STATUS_CHANGED", "TASK_REOPENED"] },
            },
            orderBy: [{ createdAt: "asc" }],
            select: {
              taskId: true,
              eventType: true,
              newValue: true,
              createdAt: true,
            },
          })
        : [];

    const activitiesByTask = new Map<
      string,
      Array<{ eventType: string; newValue: string | null; createdAt: Date }>
    >();
    for (const act of activities) {
      let arr = activitiesByTask.get(act.taskId);
      if (!arr) {
        arr = [];
        activitiesByTask.set(act.taskId, arr);
      }
      arr.push(act);
    }

    const cycleHours: number[] = [];
    let cycleTimeExcludedCount = 0;
    const leadHours: number[] = [];

    for (const task of completedTasks) {
      if (!task.completedAt) continue;
      const compMs = task.completedAt.getTime();
      const leadMs = compMs - task.createdAt.getTime();
      if (leadMs >= 0) {
        leadHours.push(leadMs / 3_600_000);
      }

      const taskActs = activitiesByTask.get(task.id) ?? [];
      let cycleAnchorMs = 0;
      let startedInProgressAt: number | null = null;

      for (const act of taskActs) {
        const ts = act.createdAt.getTime();
        if (ts > compMs) break;
        if (act.eventType === "TASK_REOPENED") {
          cycleAnchorMs = ts;
          startedInProgressAt = null;
        } else if (
          act.eventType === "STATUS_CHANGED" &&
          act.newValue === "In Progress" &&
          ts >= cycleAnchorMs &&
          startedInProgressAt === null
        ) {
          startedInProgressAt = ts;
        }
      }

      if (startedInProgressAt !== null && compMs >= startedInProgressAt) {
        cycleHours.push((compMs - startedInProgressAt) / 3_600_000);
      } else {
        cycleTimeExcludedCount += 1;
      }
    }

    return {
      throughputCount: completedTasks.length,
      reopenedInPeriodCount,
      averageCycleTimeHours: avgHours(cycleHours),
      medianCycleTimeHours: medianHours(cycleHours),
      cycleTimeSampleCount: cycleHours.length,
      cycleTimeExcludedCount,
      cycleTimeStatus: cycleHours.length > 0 ? "AVAILABLE" : "INSUFFICIENT_DATA",
      cycleTimeRuleNote:
        "Cycle time is computed only from recorded 'In Progress' transition events through completion; tasks without an 'In Progress' activity timestamp are excluded rather than estimated.",
      averageLeadTimeHours: avgHours(leadHours),
      medianLeadTimeHours: medianHours(leadHours),
      leadTimeSampleCount: leadHours.length,
      leadTimeStatus: leadHours.length > 0 ? "AVAILABLE" : "INSUFFICIENT_DATA",
    };
  }

  async getProjectHealthInsights(input: {
    organizationId: string;
    projectId: string;
    now?: Date;
  }): Promise<TaskHealthInsightDto[]> {
    const now = input.now ?? new Date();
    const dueSoonEnd = new Date(now.getTime() + DUE_SOON_MS);
    const staleReviewCutoff = new Date(now.getTime() - STALE_REVIEW_MS);
    const inactiveActiveCutoff = new Date(now.getTime() - INACTIVE_ACTIVE_MS);

    const selectTask = {
      id: true,
      identifier: true,
      title: true,
      projectId: true,
      status: true,
      dueDate: true,
      updatedAt: true,
      project: { select: { key: true } },
    } as const;

    const toItem = (row: {
      id: string;
      identifier: string;
      title: string;
      projectId: string;
      status: TaskStatus;
      dueDate: Date | null;
      updatedAt: Date;
      project: { key: string };
    }): TaskHealthItemDto => ({
      id: row.id,
      identifier: row.identifier,
      title: row.title,
      projectId: row.projectId,
      projectKey: row.project.key,
      status: row.status,
      dueDate: row.dueDate ? row.dueDate.toISOString() : null,
      updatedAt: row.updatedAt.toISOString(),
    });

    const baseWhere = {
      organizationId: input.organizationId,
      projectId: input.projectId,
      archivedAt: null,
    };

    const [
      overdueCount,
      overdueRows,
      dueSoonCount,
      dueSoonRows,
      staleReviewCount,
      staleReviewRows,
      inactiveActiveCount,
      inactiveActiveRows,
      unassignedActiveCount,
      unassignedActiveRows,
    ] = await Promise.all([
      this.db.prisma.task.count({
        where: { ...baseWhere, status: { not: "DONE" }, dueDate: { lt: now } },
      }),
      this.db.prisma.task.findMany({
        where: { ...baseWhere, status: { not: "DONE" }, dueDate: { lt: now } },
        orderBy: [{ dueDate: "asc" }],
        take: 10,
        select: selectTask,
      }),
      this.db.prisma.task.count({
        where: {
          ...baseWhere,
          status: { not: "DONE" },
          dueDate: { gte: now, lte: dueSoonEnd },
        },
      }),
      this.db.prisma.task.findMany({
        where: {
          ...baseWhere,
          status: { not: "DONE" },
          dueDate: { gte: now, lte: dueSoonEnd },
        },
        orderBy: [{ dueDate: "asc" }],
        take: 10,
        select: selectTask,
      }),
      this.db.prisma.task.count({
        where: {
          ...baseWhere,
          status: "IN_REVIEW",
          updatedAt: { lt: staleReviewCutoff },
        },
      }),
      this.db.prisma.task.findMany({
        where: {
          ...baseWhere,
          status: "IN_REVIEW",
          updatedAt: { lt: staleReviewCutoff },
        },
        orderBy: [{ updatedAt: "asc" }],
        take: 10,
        select: selectTask,
      }),
      this.db.prisma.task.count({
        where: {
          ...baseWhere,
          status: { in: ["IN_PROGRESS", "IN_REVIEW"] },
          updatedAt: { lt: inactiveActiveCutoff },
        },
      }),
      this.db.prisma.task.findMany({
        where: {
          ...baseWhere,
          status: { in: ["IN_PROGRESS", "IN_REVIEW"] },
          updatedAt: { lt: inactiveActiveCutoff },
        },
        orderBy: [{ updatedAt: "asc" }],
        take: 10,
        select: selectTask,
      }),
      this.db.prisma.task.count({
        where: {
          ...baseWhere,
          status: { in: ["TODO", "IN_PROGRESS", "IN_REVIEW"] },
          assigneeId: null,
        },
      }),
      this.db.prisma.task.findMany({
        where: {
          ...baseWhere,
          status: { in: ["TODO", "IN_PROGRESS", "IN_REVIEW"] },
          assigneeId: null,
        },
        orderBy: [{ updatedAt: "asc" }],
        take: 10,
        select: selectTask,
      }),
    ]);

    return [
      {
        key: "OVERDUE",
        label: "Overdue Open Tasks",
        count: overdueCount,
        summary: "Non-completed tasks whose due date has passed.",
        tasks: overdueRows.map(toItem),
      },
      {
        key: "DUE_SOON",
        label: "Due Within 72 Hours",
        count: dueSoonCount,
        summary: "Open tasks scheduled to be due in the next 3 days.",
        tasks: dueSoonRows.map(toItem),
      },
      {
        key: "STALE_REVIEW",
        label: "Long-Running Review Queue",
        count: staleReviewCount,
        summary: "Tasks in 'In Review' with no recorded updates for at least 5 days.",
        tasks: staleReviewRows.map(toItem),
      },
      {
        key: "INACTIVE_ACTIVE",
        label: "Inactive Active Work",
        count: inactiveActiveCount,
        summary: "Active tasks with no recorded status or field updates in 7+ days.",
        tasks: inactiveActiveRows.map(toItem),
      },
      {
        key: "UNASSIGNED_ACTIVE",
        label: "Unassigned Active Work",
        count: unassignedActiveCount,
        summary: "Todo, In Progress, or In Review tasks currently lacking an owner.",
        tasks: unassignedActiveRows.map(toItem),
      },
    ];
  }
}
