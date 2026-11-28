import type {
  AgentContextSummaryDto,
  AgentPlanDto,
  AgentPlanStatus,
  AgentPlanStepDto,
  AgentProposalDto,
  AgentProposalStatus,
  AgentReviewFindingDto,
  AgentRunDetailDto,
  AgentRunEventDto,
  AgentRunEventType,
  AgentRunStatus,
  AgentRunSummaryDto,
  AgentStageRole,
  AgentTestRunDto,
  AgentTestRunStatus,
  AgentUsageRecordDto,
  AgentUsageTotalsDto,
  PullRequestChangedFileDto,
  TaskPriority,
  TaskStatus,
  TaskUserRef,
} from "@devcollab/shared";

export interface UsageLike {
  id: string;
  runId: string;
  stageRole: AgentStageRole;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: { toString(): string } | string | number;
  latencyMs: number;
  createdAt: Date;
}

export function sumUsageTotals(records: UsageLike[]): AgentUsageTotalsDto {
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let cost = 0;

  for (const r of records) {
    inputTokens += Number(r.inputTokens) || 0;
    outputTokens += Number(r.outputTokens) || 0;
    totalTokens += Number(r.totalTokens) || 0;
    const n = Number(r.estimatedCostUsd);
    if (Number.isFinite(n)) cost += n;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd: cost.toFixed(6),
    callCount: records.length,
  };
}

export function toAgentUsageRecordDto(record: UsageLike): AgentUsageRecordDto {
  const numericCost = Number(record.estimatedCostUsd);
  return {
    id: record.id,
    runId: record.runId,
    stageRole: record.stageRole,
    provider: record.provider,
    model: record.model,
    inputTokens: record.inputTokens,
    outputTokens: record.outputTokens,
    totalTokens: record.totalTokens,
    estimatedCostUsd: Number.isFinite(numericCost) ? numericCost.toFixed(6) : "0.000000",
    latencyMs: record.latencyMs,
    createdAt: record.createdAt.toISOString(),
  };
}

export function toAgentPlanDto(plan: {
  id: string;
  runId: string;
  version: number;
  status: AgentPlanStatus;
  summary: string;
  steps: unknown;
  targetFiles: string[];
  risks: string[];
  suggestedChecks: string[];
  contextSummary: unknown;
  revisionFeedback: string | null;
  decidedBy: TaskUserRef | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  createdAt: Date;
}): AgentPlanDto {
  return {
    id: plan.id,
    runId: plan.runId,
    version: plan.version,
    status: plan.status,
    summary: plan.summary,
    steps: Array.isArray(plan.steps) ? (plan.steps as AgentPlanStepDto[]) : [],
    targetFiles: plan.targetFiles,
    risks: plan.risks,
    suggestedChecks: plan.suggestedChecks,
    contextSummary: (plan.contextSummary ?? {
      repoFullName: "",
      baseBranch: "",
      baseCommitSha: null,
      indexedFileCount: 0,
      selectedFiles: [],
    }) as AgentContextSummaryDto,
    revisionFeedback: plan.revisionFeedback,
    decidedBy: plan.decidedBy,
    decidedAt: plan.decidedAt ? plan.decidedAt.toISOString() : null,
    decisionNote: plan.decisionNote,
    createdAt: plan.createdAt.toISOString(),
  };
}

export function toAgentProposalDto(proposal: {
  id: string;
  runId: string;
  planId: string;
  version: number;
  status: AgentProposalStatus;
  summary: string;
  reviewSummary: string;
  reviewFindings: unknown;
  changedFiles: unknown;
  rawPatch: string;
  filesChangedCount: number;
  additionsCount: number;
  deletionsCount: number;
  baseCommitSha: string;
  revisionFeedback: string | null;
  reviewedBy: TaskUserRef | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  createdAt: Date;
}): AgentProposalDto {
  return {
    id: proposal.id,
    runId: proposal.runId,
    planId: proposal.planId,
    version: proposal.version,
    status: proposal.status,
    summary: proposal.summary,
    reviewSummary: proposal.reviewSummary,
    reviewFindings: Array.isArray(proposal.reviewFindings)
      ? (proposal.reviewFindings as AgentReviewFindingDto[])
      : [],
    changedFiles: Array.isArray(proposal.changedFiles)
      ? (proposal.changedFiles as PullRequestChangedFileDto[])
      : [],
    rawPatch: proposal.rawPatch,
    filesChangedCount: proposal.filesChangedCount,
    additionsCount: proposal.additionsCount,
    deletionsCount: proposal.deletionsCount,
    baseCommitSha: proposal.baseCommitSha,
    revisionFeedback: proposal.revisionFeedback,
    reviewedBy: proposal.reviewedBy,
    reviewedAt: proposal.reviewedAt ? proposal.reviewedAt.toISOString() : null,
    reviewNote: proposal.reviewNote,
    createdAt: proposal.createdAt.toISOString(),
  };
}

export function toAgentTestRunDto(testRun: {
  id: string;
  runId: string;
  proposalId: string | null;
  status: AgentTestRunStatus;
  command: string | null;
  exitCode: number | null;
  durationMs: number | null;
  stdoutExcerpt: string | null;
  stderrExcerpt: string | null;
  explanation: string;
  sandboxed: boolean;
  createdAt: Date;
  completedAt: Date | null;
}): AgentTestRunDto {
  return {
    id: testRun.id,
    runId: testRun.runId,
    proposalId: testRun.proposalId,
    status: testRun.status,
    command: testRun.command,
    exitCode: testRun.exitCode,
    durationMs: testRun.durationMs,
    stdoutExcerpt: testRun.stdoutExcerpt,
    stderrExcerpt: testRun.stderrExcerpt,
    explanation: testRun.explanation,
    sandboxed: testRun.sandboxed,
    createdAt: testRun.createdAt.toISOString(),
    completedAt: testRun.completedAt ? testRun.completedAt.toISOString() : null,
  };
}

export function toAgentRunEventDto(event: {
  id: string;
  runId: string;
  eventType: AgentRunEventType;
  statusFrom: AgentRunStatus | null;
  statusTo: AgentRunStatus | null;
  message: string;
  metadata: unknown;
  actor: TaskUserRef | null;
  createdAt: Date;
}): AgentRunEventDto {
  return {
    id: event.id,
    runId: event.runId,
    eventType: event.eventType,
    statusFrom: event.statusFrom,
    statusTo: event.statusTo,
    message: event.message,
    metadata:
      event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
        ? (event.metadata as Record<string, unknown>)
        : null,
    actor: event.actor,
    createdAt: event.createdAt.toISOString(),
  };
}

export function toAgentRunSummaryDto(run: {
  id: string;
  organizationId: string;
  projectId: string;
  taskId: string;
  status: AgentRunStatus;
  requestedPhase: string;
  currentStage: string | null;
  repoFullName: string;
  baseBranch: string;
  baseCommitSha: string | null;
  taskSnapshotTitle: string;
  provider: string;
  model: string;
  triggeredBy: TaskUserRef | null;
  attemptCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  usageRecords: UsageLike[];
}): AgentRunSummaryDto {
  return {
    id: run.id,
    organizationId: run.organizationId,
    projectId: run.projectId,
    taskId: run.taskId,
    status: run.status,
    requestedPhase: run.requestedPhase,
    currentStage: run.currentStage,
    repoFullName: run.repoFullName,
    baseBranch: run.baseBranch,
    baseCommitSha: run.baseCommitSha,
    taskSnapshotTitle: run.taskSnapshotTitle,
    provider: run.provider,
    model: run.model,
    triggeredBy: run.triggeredBy,
    attemptCount: run.attemptCount,
    errorCode: run.errorCode,
    errorMessage: run.errorMessage,
    startedAt: run.startedAt ? run.startedAt.toISOString() : null,
    completedAt: run.completedAt ? run.completedAt.toISOString() : null,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    usageTotals: sumUsageTotals(run.usageRecords),
  };
}

export function toAgentRunDetailDto(
  run: Parameters<typeof toAgentRunSummaryDto>[0] & {
    activePlanId: string | null;
    activeProposalId: string | null;
    userInstructions: string | null;
    task: {
      identifier: string;
      title: string;
      status: TaskStatus;
      priority: TaskPriority;
    };
    plans: Array<Parameters<typeof toAgentPlanDto>[0]>;
    proposals: Array<Parameters<typeof toAgentProposalDto>[0]>;
    testRuns: Array<Parameters<typeof toAgentTestRunDto>[0]>;
    events: Array<Parameters<typeof toAgentRunEventDto>[0]>;
  },
  options: {
    canControlRun: boolean;
    isStaleContext: boolean;
    staleReason: string | null;
  },
): AgentRunDetailDto {
  const plans = run.plans.map(toAgentPlanDto);
  const proposals = run.proposals.map(toAgentProposalDto);
  const activePlan =
    (run.activePlanId ? plans.find((p) => p.id === run.activePlanId) : null) ??
    plans[0] ??
    null;
  const activeProposal =
    (run.activeProposalId ? proposals.find((p) => p.id === run.activeProposalId) : null) ??
    proposals[0] ??
    null;

  return {
    ...toAgentRunSummaryDto(run),
    taskIdentifier: run.task.identifier,
    taskTitle: run.task.title,
    taskStatus: run.task.status,
    taskPriority: run.task.priority,
    userInstructions: run.userInstructions,
    canControlRun: options.canControlRun,
    isStaleContext: options.isStaleContext,
    staleReason: options.staleReason,
    activePlan,
    plans,
    activeProposal,
    proposals,
    testRuns: run.testRuns.map(toAgentTestRunDto),
    events: run.events.map(toAgentRunEventDto),
    usageRecords: run.usageRecords.map(toAgentUsageRecordDto),
  };
}
