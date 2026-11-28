import { Injectable } from "@nestjs/common";
import type {
  AiCurrencySpendSummaryDto,
  AiExecutionAnalyticsDto,
  AiRecentActivityItemDto,
  AiUsageAnalyticsDto,
  AiUsageGroupRowDto,
  AiUsageSourceKind,
} from "@devcollab/shared";
import { formatMicrosToDecimal6 } from "@devcollab/ai-core";
import { DatabaseService } from "../database/database.service";
import { findBucketIndex, type ParsedAnalyticsFilter } from "./date-range.util";

interface NormalizedUsageEvent {
  id: string;
  sourceKind: AiUsageSourceKind;
  operationLabel: string;
  projectId: string;
  projectKey: string;
  projectName: string;
  taskId: string | null;
  taskIdentifier: string | null;
  workspaceId: string | null;
  actorName: string | null;
  provider: string;
  model: string;
  usageAvailable: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  costAvailable: boolean;
  currency: string;
  costMicros: bigint | null;
  estimatedCostUsd: string | null;
  statusLabel: string;
  latencyMs: number;
  createdAt: Date;
}

function parseDecimalToMicros(raw: { toString(): string } | string | number): bigint {
  const s = typeof raw === "string" ? raw.trim() : raw.toString().trim();
  if (!s) return 0n;
  const neg = s.startsWith("-");
  const clean = neg ? s.slice(1) : s;
  const [whole = "0", frac = ""] = clean.split(".");
  const w = BigInt(whole.replace(/\D/g, "") || "0");
  const f = BigInt(frac.replace(/\D/g, "").padEnd(6, "0").slice(0, 6));
  const v = w * 1_000_000n + f;
  return neg ? -v : v;
}

function stageRoleToSourceKind(role: string): {
  sourceKind: AiUsageSourceKind;
  operationLabel: string;
} {
  if (role === "PLANNER") {
    return { sourceKind: "AGENT_PLANNER", operationLabel: "Agent Planner" };
  }
  if (role === "REVIEWER") {
    return { sourceKind: "AGENT_REVIEWER", operationLabel: "Agent Reviewer" };
  }
  return { sourceKind: "AGENT_IMPLEMENTER", operationLabel: "Agent Implementer" };
}

function inlineActionLabel(kind: string): string {
  switch (kind) {
    case "EXPLAIN":
      return "IDE Assistant · Explain";
    case "IMPROVE":
      return "IDE Assistant · Improve";
    case "FIND_BUGS":
      return "IDE Assistant · Find Bugs";
    case "GENERATE_TESTS":
      return "IDE Assistant · Generate Tests";
    default:
      return "IDE Assistant · Chat";
  }
}

@Injectable()
export class AiAnalyticsService {
  constructor(private readonly db: DatabaseService) {}

  async getAiExecutionAnalytics(input: {
    organizationId: string;
    projectIds: string[] | null;
    filter: ParsedAnalyticsFilter;
  }): Promise<AiExecutionAnalyticsDto> {
    const projectScope =
      input.projectIds !== null ? { projectId: { in: input.projectIds } } : {};
    const dateRange = {
      gte: input.filter.periodStartDate,
      lt: input.filter.periodEndExclusiveDate,
    };

    const [runs, plansGeneratedCount, proposals, testRuns] = await Promise.all([
      this.db.prisma.agentRun.findMany({
        where: {
          organizationId: input.organizationId,
          ...projectScope,
          createdAt: dateRange,
        },
        select: {
          id: true,
          status: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
        },
      }),
      this.db.prisma.agentPlan.count({
        where: {
          run: {
            organizationId: input.organizationId,
            ...projectScope,
          },
          createdAt: dateRange,
        },
      }),
      this.db.prisma.agentProposal.findMany({
        where: {
          run: {
            organizationId: input.organizationId,
            ...projectScope,
          },
          createdAt: dateRange,
        },
        select: { status: true },
      }),
      this.db.prisma.agentTestRun.findMany({
        where: {
          run: {
            organizationId: input.organizationId,
            ...projectScope,
          },
          createdAt: dateRange,
        },
        select: { status: true, sandboxed: true },
      }),
    ]);

    let completedRuns = 0;
    let failedRuns = 0;
    let cancelledRuns = 0;
    let awaitingApprovalRuns = 0;
    let awaitingReviewRuns = 0;
    let runningOrQueuedRuns = 0;
    let durationSecSum = 0;
    let durationSampleCount = 0;

    const bucketStats = input.filter.buckets.map((b) => ({
      bucketKey: b.bucketKey,
      label: b.label,
      totalRuns: 0,
      completedRuns: 0,
      failedRuns: 0,
    }));

    for (const run of runs) {
      const idx = findBucketIndex(input.filter.buckets, run.createdAt);
      if (idx >= 0) bucketStats[idx]!.totalRuns += 1;

      if (run.status === "COMPLETED") {
        completedRuns += 1;
        if (idx >= 0) bucketStats[idx]!.completedRuns += 1;
        if (run.startedAt && run.completedAt) {
          const sec = (run.completedAt.getTime() - run.startedAt.getTime()) / 1000;
          if (sec >= 0) {
            durationSecSum += sec;
            durationSampleCount += 1;
          }
        }
      } else if (run.status === "FAILED" || run.status === "REJECTED") {
        failedRuns += 1;
        if (idx >= 0) bucketStats[idx]!.failedRuns += 1;
      } else if (run.status === "CANCELLED") {
        cancelledRuns += 1;
      } else if (run.status === "AWAITING_APPROVAL") {
        awaitingApprovalRuns += 1;
      } else if (run.status === "AWAITING_REVIEW") {
        awaitingReviewRuns += 1;
      } else {
        runningOrQueuedRuns += 1;
      }
    }

    const terminalRuns = completedRuns + failedRuns;
    const proposalsAcceptedCount = proposals.filter((p) => p.status === "ACCEPTED").length;
    const testsExecutedCount = testRuns.filter(
      (t) => t.sandboxed && (t.status === "PASSED" || t.status === "FAILED"),
    ).length;
    const testsPassedCount = testRuns.filter(
      (t) => t.sandboxed && t.status === "PASSED",
    ).length;
    const testsUnavailableCount = testRuns.filter(
      (t) => !t.sandboxed || t.status === "UNAVAILABLE" || t.status === "SKIPPED",
    ).length;

    return {
      totalRuns: runs.length,
      completedRuns,
      failedRuns,
      cancelledRuns,
      awaitingApprovalRuns,
      awaitingReviewRuns,
      runningOrQueuedRuns,
      runSuccessRatePct:
        terminalRuns > 0 ? Math.round((completedRuns / terminalRuns) * 1000) / 10 : null,
      runFailureRatePct:
        terminalRuns > 0 ? Math.round((failedRuns / terminalRuns) * 1000) / 10 : null,
      averageCompletedDurationSeconds:
        durationSampleCount > 0
          ? Math.round((durationSecSum / durationSampleCount) * 10) / 10
          : null,
      durationSampleCount,
      plansGeneratedCount,
      proposalsGeneratedCount: proposals.length,
      proposalsAcceptedCount,
      testsExecutedCount,
      testsPassedCount,
      testsUnavailableCount,
      trends: bucketStats,
      accuracyNote:
        "Run outcomes, human proposal acceptances, and sandboxed test passes are reported independently and never conflated.",
    };
  }

  async getAiUsageAnalytics(input: {
    organizationId: string;
    projectIds: string[] | null;
    userId?: string | null;
    filter: ParsedAnalyticsFilter;
    page?: number;
    pageSize?: number;
    includeCostDetails?: boolean;
  }): Promise<AiUsageAnalyticsDto> {
    const projectScope =
      input.projectIds !== null ? { projectId: { in: input.projectIds } } : {};
    const userScope = input.userId ? { userId: input.userId } : {};
    const dateRange = {
      gte: input.filter.periodStartDate,
      lt: input.filter.periodEndExclusiveDate,
    };

    const page = Math.max(1, Math.floor(input.page ?? 1));
    const pageSize = Math.min(50, Math.max(1, Math.floor(input.pageSize ?? 15)));
    const includeCostDetails = input.includeCostDetails !== false;

    const [agentRows, assistantRows] = await Promise.all([
      this.db.prisma.agentUsageRecord.findMany({
        where: {
          organizationId: input.organizationId,
          ...projectScope,
          ...userScope,
          createdAt: dateRange,
        },
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          stageRole: true,
          provider: true,
          model: true,
          usageAvailable: true,
          inputTokens: true,
          outputTokens: true,
          totalTokens: true,
          costAvailable: true,
          currency: true,
          estimatedCostUsd: true,
          latencyMs: true,
          createdAt: true,
          project: { select: { id: true, key: true, name: true } },
          user: { select: { name: true, email: true } },
          run: {
            select: {
              id: true,
              status: true,
              taskId: true,
              task: { select: { identifier: true } },
              triggeredBy: { select: { name: true, email: true } },
            },
          },
        },
      }),
      this.db.prisma.aiAssistantUsageRecord.findMany({
        where: {
          organizationId: input.organizationId,
          ...projectScope,
          ...userScope,
          createdAt: dateRange,
        },
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          actionKind: true,
          provider: true,
          model: true,
          usageAvailable: true,
          inputTokens: true,
          outputTokens: true,
          totalTokens: true,
          costAvailable: true,
          currency: true,
          estimatedCostUsd: true,
          latencyMs: true,
          createdAt: true,
          project: { select: { id: true, key: true, name: true } },
          user: { select: { name: true, email: true } },
          conversation: {
            select: {
              workspaceId: true,
              taskId: true,
              task: { select: { identifier: true } },
            },
          },
        },
      }),
    ]);

    const events: NormalizedUsageEvent[] = [];

    for (const r of agentRows) {
      const mapped = stageRoleToSourceKind(r.stageRole);
      const usageAvailable =
        r.usageAvailable && r.inputTokens !== null && r.outputTokens !== null;
      const inTok = usageAvailable ? r.inputTokens : null;
      const outTok = usageAvailable ? r.outputTokens : null;
      const totTok = usageAvailable ? (r.totalTokens ?? (inTok ?? 0) + (outTok ?? 0)) : null;

      const costAvailable =
        includeCostDetails && r.costAvailable && r.estimatedCostUsd !== null;
      const micros = costAvailable ? parseDecimalToMicros(r.estimatedCostUsd!) : null;
      const actor = r.user ?? r.run.triggeredBy;

      events.push({
        id: r.id,
        sourceKind: mapped.sourceKind,
        operationLabel: mapped.operationLabel,
        projectId: r.project.id,
        projectKey: r.project.key,
        projectName: r.project.name,
        taskId: r.run.taskId,
        taskIdentifier: r.run.task?.identifier ?? null,
        workspaceId: null,
        actorName: actor ? (actor.name || actor.email) : null,
        provider: r.provider,
        model: r.model,
        usageAvailable,
        inputTokens: inTok,
        outputTokens: outTok,
        totalTokens: totTok,
        costAvailable,
        currency: r.currency || "USD",
        costMicros: micros,
        estimatedCostUsd: micros !== null ? formatMicrosToDecimal6(micros) : null,
        statusLabel: r.run.status,
        latencyMs: r.latencyMs,
        createdAt: r.createdAt,
      });
    }

    for (const r of assistantRows) {
      const usageAvailable =
        r.usageAvailable && r.inputTokens !== null && r.outputTokens !== null;
      const inTok = usageAvailable ? r.inputTokens : null;
      const outTok = usageAvailable ? r.outputTokens : null;
      const totTok = usageAvailable ? (r.totalTokens ?? (inTok ?? 0) + (outTok ?? 0)) : null;

      const costAvailable =
        includeCostDetails && r.costAvailable && r.estimatedCostUsd !== null;
      const micros = costAvailable ? parseDecimalToMicros(r.estimatedCostUsd!) : null;

      events.push({
        id: r.id,
        sourceKind: "IDE_ASSISTANT",
        operationLabel: inlineActionLabel(r.actionKind),
        projectId: r.project.id,
        projectKey: r.project.key,
        projectName: r.project.name,
        taskId: r.conversation.taskId,
        taskIdentifier: r.conversation.task?.identifier ?? null,
        workspaceId: r.conversation.workspaceId,
        actorName: r.user ? (r.user.name || r.user.email) : null,
        provider: r.provider,
        model: r.model,
        usageAvailable,
        inputTokens: inTok,
        outputTokens: outTok,
        totalTokens: totTok,
        costAvailable,
        currency: r.currency || "USD",
        costMicros: micros,
        estimatedCostUsd: micros !== null ? formatMicrosToDecimal6(micros) : null,
        statusLabel: "COMPLETED",
        latencyMs: r.latencyMs,
        createdAt: r.createdAt,
      });
    }

    events.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    let reportedCallCount = 0;
    let unreportedCallCount = 0;
    let sumInputTokens = 0;
    let sumOutputTokens = 0;
    let sumTotalTokens = 0;

    const currencyAcc = new Map<
      string,
      { micros: bigint; costedCallCount: number; uncostedCallCount: number }
    >();
    const modelCounts = new Map<string, number>();

    const bucketAcc = input.filter.buckets.map((b) => ({
      bucketKey: b.bucketKey,
      label: b.label,
      requestCount: 0,
      reportedTokens: 0,
      hasReportedTokens: false,
      costMicros: 0n,
      hasCost: false,
      currencies: new Set<string>(),
    }));

    const buildGroupAcc = () =>
      new Map<
        string,
        {
          key: string;
          label: string;
          subLabel: string | null;
          requestCount: number;
          reportedCallCount: number;
          unreportedCallCount: number;
          inTok: number;
          outTok: number;
          totTok: number;
          costedCallCount: number;
          uncostedCallCount: number;
          micros: bigint;
          currencies: Set<string>;
        }
      >();

    const byModelAcc = buildGroupAcc();
    const byProjectAcc = buildGroupAcc();
    const byOperationAcc = buildGroupAcc();

    const addToGroup = (
      map: ReturnType<typeof buildGroupAcc>,
      key: string,
      label: string,
      subLabel: string | null,
      ev: NormalizedUsageEvent,
    ) => {
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          label,
          subLabel,
          requestCount: 0,
          reportedCallCount: 0,
          unreportedCallCount: 0,
          inTok: 0,
          outTok: 0,
          totTok: 0,
          costedCallCount: 0,
          uncostedCallCount: 0,
          micros: 0n,
          currencies: new Set<string>(),
        };
        map.set(key, g);
      }
      g.requestCount += 1;
      if (ev.usageAvailable) {
        g.reportedCallCount += 1;
        g.inTok += ev.inputTokens ?? 0;
        g.outTok += ev.outputTokens ?? 0;
        g.totTok += ev.totalTokens ?? 0;
      } else {
        g.unreportedCallCount += 1;
      }
      if (ev.costAvailable && ev.costMicros !== null) {
        g.costedCallCount += 1;
        g.micros += ev.costMicros;
        g.currencies.add(ev.currency);
      } else {
        g.uncostedCallCount += 1;
      }
    };

    for (const ev of events) {
      modelCounts.set(ev.model, (modelCounts.get(ev.model) ?? 0) + 1);
      if (ev.usageAvailable) {
        reportedCallCount += 1;
        sumInputTokens += ev.inputTokens ?? 0;
        sumOutputTokens += ev.outputTokens ?? 0;
        sumTotalTokens += ev.totalTokens ?? 0;
      } else {
        unreportedCallCount += 1;
      }

      const cur = ev.currency || "USD";
      let ca = currencyAcc.get(cur);
      if (!ca) {
        ca = { micros: 0n, costedCallCount: 0, uncostedCallCount: 0 };
        currencyAcc.set(cur, ca);
      }
      if (ev.costAvailable && ev.costMicros !== null) {
        ca.micros += ev.costMicros;
        ca.costedCallCount += 1;
      } else {
        ca.uncostedCallCount += 1;
      }

      const bIdx = findBucketIndex(input.filter.buckets, ev.createdAt);
      if (bIdx >= 0) {
        const b = bucketAcc[bIdx]!;
        b.requestCount += 1;
        if (ev.usageAvailable && ev.totalTokens !== null) {
          b.reportedTokens += ev.totalTokens;
          b.hasReportedTokens = true;
        }
        if (ev.costAvailable && ev.costMicros !== null) {
          b.costMicros += ev.costMicros;
          b.hasCost = true;
          b.currencies.add(ev.currency);
        }
      }

      addToGroup(
        byModelAcc,
        `${ev.provider}:${ev.model}:${ev.currency}`,
        ev.model,
        `${ev.provider} · ${ev.currency}`,
        ev,
      );
      addToGroup(byProjectAcc, ev.projectId, ev.projectName, ev.projectKey, ev);
      addToGroup(byOperationAcc, ev.sourceKind, ev.operationLabel, null, ev);
    }

    const finalizeGroups = (
      map: ReturnType<typeof buildGroupAcc>,
    ): AiUsageGroupRowDto[] =>
      [...map.values()]
        .map((g) => {
          const singleCurrency = g.currencies.size <= 1 ? ([...g.currencies][0] ?? "USD") : "MULTI";
          let costStatus: AiUsageGroupRowDto["costStatus"] = "PRICING_UNAVAILABLE";
          let estimatedSpend: string | null = null;
          if (!includeCostDetails) {
            costStatus = "PRICING_UNAVAILABLE";
            estimatedSpend = null;
          } else if (g.currencies.size > 1) {
            costStatus = "PARTIAL";
            estimatedSpend = null;
          } else if (g.costedCallCount > 0 && g.uncostedCallCount === 0) {
            costStatus = "AVAILABLE";
            estimatedSpend = formatMicrosToDecimal6(g.micros);
          } else if (g.costedCallCount > 0) {
            costStatus = "PARTIAL";
            estimatedSpend = formatMicrosToDecimal6(g.micros);
          }
          return {
            key: g.key,
            label: g.label,
            subLabel: g.subLabel,
            requestCount: g.requestCount,
            reportedCallCount: g.reportedCallCount,
            unreportedCallCount: g.unreportedCallCount,
            inputTokens: g.reportedCallCount > 0 ? g.inTok : null,
            outputTokens: g.reportedCallCount > 0 ? g.outTok : null,
            totalTokens: g.reportedCallCount > 0 ? g.totTok : null,
            costedCallCount: g.costedCallCount,
            uncostedCallCount: g.uncostedCallCount,
            currency: singleCurrency,
            estimatedSpend,
            costStatus,
          };
        })
        .sort((a, b) => b.requestCount - a.requestCount);

    const spendByCurrency: AiCurrencySpendSummaryDto[] = [];
    for (const [currency, ca] of currencyAcc.entries()) {
      const status: AiCurrencySpendSummaryDto["status"] =
        ca.costedCallCount === 0
          ? "PRICING_UNAVAILABLE"
          : ca.uncostedCallCount === 0
            ? "AVAILABLE"
            : "PARTIAL";
      spendByCurrency.push({
        currency,
        estimatedSpend: ca.costedCallCount > 0 ? formatMicrosToDecimal6(ca.micros) : null,
        costedCallCount: ca.costedCallCount,
        uncostedCallCount: ca.uncostedCallCount,
        status,
      });
    }
    spendByCurrency.sort((a, b) => a.currency.localeCompare(b.currency));

    const totalCostedCalls = spendByCurrency.reduce((acc, c) => acc + c.costedCallCount, 0);
    const totalUncostedCalls = events.length - totalCostedCalls;
    const costedCurrencies = spendByCurrency.filter((c) => c.costedCallCount > 0);
    const mixedCurrencyDetected = costedCurrencies.length > 1;

    let costStatus: AiUsageAnalyticsDto["costStatus"] = "NO_USAGE";
    let costStatusMessage = "No AI requests recorded during the selected period.";

    if (events.length > 0) {
      if (!includeCostDetails) {
        costStatus = "PRICING_UNAVAILABLE";
        costStatusMessage = "Cost details are restricted in this view.";
      } else if (totalCostedCalls === 0) {
        costStatus = "PRICING_UNAVAILABLE";
        costStatusMessage =
          "Cost estimate unavailable — configure active pricing rules for recorded models or ensure token telemetry is reported.";
      } else if (totalUncostedCalls > 0 || mixedCurrencyDetected) {
        costStatus = "PARTIAL";
        costStatusMessage = mixedCurrencyDetected
          ? `Multiple currencies recorded (${costedCurrencies.map((c) => c.currency).join(", ")}); currency totals are displayed separately without conversion.`
          : `Partial cost estimate: ${totalUncostedCalls} of ${events.length} request(s) lack token telemetry or active pricing rules.`;
      } else {
        costStatus = "AVAILABLE";
        costStatusMessage = "All recorded AI requests have verified pricing snapshots.";
      }
    }

    const tokenUsageStatus: AiUsageAnalyticsDto["tokenUsageStatus"] =
      events.length === 0
        ? "NO_USAGE"
        : reportedCallCount === 0
          ? "UNAVAILABLE"
          : unreportedCallCount > 0
            ? "PARTIAL"
            : "AVAILABLE";

    let mostUsedModel: string | null = null;
    let topCount = 0;
    for (const [m, count] of modelCounts.entries()) {
      if (count > topCount) {
        topCount = count;
        mostUsedModel = m;
      }
    }

    const startOffset = (page - 1) * pageSize;
    const pagedActivity: AiRecentActivityItemDto[] = events
      .slice(startOffset, startOffset + pageSize)
      .map((ev) => ({
        id: ev.id,
        sourceKind: ev.sourceKind,
        operationLabel: ev.operationLabel,
        projectId: ev.projectId,
        projectKey: ev.projectKey,
        projectName: ev.projectName,
        taskId: ev.taskId,
        taskIdentifier: ev.taskIdentifier,
        workspaceId: ev.workspaceId,
        actorName: ev.actorName,
        provider: ev.provider,
        model: ev.model,
        usageAvailable: ev.usageAvailable,
        inputTokens: ev.inputTokens,
        outputTokens: ev.outputTokens,
        totalTokens: ev.totalTokens,
        costAvailable: ev.costAvailable,
        currency: ev.currency,
        estimatedCostUsd: ev.estimatedCostUsd,
        statusLabel: ev.statusLabel,
        latencyMs: ev.latencyMs,
        createdAt: ev.createdAt.toISOString(),
      }));

    return {
      totalRequests: events.length,
      reportedCallCount,
      unreportedCallCount,
      tokenUsageStatus,
      totalInputTokens: reportedCallCount > 0 ? sumInputTokens : null,
      totalOutputTokens: reportedCallCount > 0 ? sumOutputTokens : null,
      totalTokens: reportedCallCount > 0 ? sumTotalTokens : null,
      mostUsedModel,
      spendByCurrency,
      mixedCurrencyDetected,
      costStatus,
      costStatusMessage,
      trends: bucketAcc.map((b) => ({
        bucketKey: b.bucketKey,
        label: b.label,
        requestCount: b.requestCount,
        reportedTokens: b.hasReportedTokens ? b.reportedTokens : null,
        estimatedSpend:
          includeCostDetails && b.hasCost && b.currencies.size === 1
            ? formatMicrosToDecimal6(b.costMicros)
            : null,
      })),
      byModel: finalizeGroups(byModelAcc),
      byProject: finalizeGroups(byProjectAcc),
      byOperation: finalizeGroups(byOperationAcc),
      recentActivity: pagedActivity,
      activityTotalCount: events.length,
      page,
      pageSize,
    };
  }
}
