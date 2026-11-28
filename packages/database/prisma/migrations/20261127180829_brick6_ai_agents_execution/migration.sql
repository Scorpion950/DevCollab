-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('QUEUED', 'PLANNING', 'AWAITING_APPROVAL', 'RUNNING', 'AWAITING_REVIEW', 'COMPLETED', 'FAILED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgentPlanStatus" AS ENUM ('PENDING', 'SUPERSEDED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AgentProposalStatus" AS ENUM ('PENDING_REVIEW', 'REVISION_REQUESTED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "AgentTestRunStatus" AS ENUM ('PENDING', 'RUNNING', 'PASSED', 'FAILED', 'SKIPPED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "AgentRunEventType" AS ENUM ('RUN_QUEUED', 'CONTEXT_COLLECTED', 'PLAN_GENERATED', 'PLAN_APPROVED', 'PLAN_REJECTED', 'PLAN_REVISION_REQUESTED', 'EXECUTION_CLAIMED', 'PATCH_VALIDATED', 'PATCH_REJECTED', 'REVIEW_GENERATED', 'TESTS_EXECUTED', 'TESTS_UNAVAILABLE', 'PROPOSAL_CREATED', 'PROPOSAL_REVISION_REQUESTED', 'PROPOSAL_ACCEPTED', 'PROPOSAL_REJECTED', 'RUN_CANCELLED', 'RUN_FAILED');

-- CreateEnum
CREATE TYPE "AgentStageRole" AS ENUM ('PLANNER', 'IMPLEMENTER', 'REVIEWER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TaskActivityType" ADD VALUE 'AI_RUN_STARTED';
ALTER TYPE "TaskActivityType" ADD VALUE 'AI_PLAN_APPROVED';
ALTER TYPE "TaskActivityType" ADD VALUE 'AI_PLAN_REJECTED';
ALTER TYPE "TaskActivityType" ADD VALUE 'AI_PROPOSAL_READY';
ALTER TYPE "TaskActivityType" ADD VALUE 'AI_PROPOSAL_ACCEPTED';
ALTER TYPE "TaskActivityType" ADD VALUE 'AI_PROPOSAL_REJECTED';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "allowDeveloperAiRuns" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ProjectRoleAssignment" ADD COLUMN     "canRunAi" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AgentProfile" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "AgentStageRole" NOT NULL,
    "description" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "projectRepositoryId" TEXT,
    "triggeredById" TEXT,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'QUEUED',
    "requestedPhase" TEXT NOT NULL DEFAULT 'PLAN',
    "currentStage" TEXT,
    "idempotencyKey" TEXT,
    "repoFullName" TEXT NOT NULL,
    "baseBranch" TEXT NOT NULL,
    "baseCommitSha" TEXT,
    "taskSnapshotTitle" TEXT NOT NULL,
    "taskSnapshotHash" TEXT NOT NULL,
    "userInstructions" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "activePlanId" TEXT,
    "activeProposalId" TEXT,
    "workerId" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 2,
    "cancelRequestedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRunEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "actorId" TEXT,
    "eventType" "AgentRunEventType" NOT NULL,
    "statusFrom" "AgentRunStatus",
    "statusTo" "AgentRunStatus",
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRunEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentPlan" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "AgentPlanStatus" NOT NULL DEFAULT 'PENDING',
    "summary" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "targetFiles" TEXT[],
    "risks" TEXT[],
    "suggestedChecks" TEXT[],
    "contextSummary" JSONB NOT NULL,
    "revisionFeedback" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentProposal" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "AgentProposalStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "summary" TEXT NOT NULL,
    "reviewSummary" TEXT NOT NULL,
    "reviewFindings" JSONB NOT NULL,
    "changedFiles" JSONB NOT NULL,
    "rawPatch" TEXT NOT NULL,
    "filesChangedCount" INTEGER NOT NULL DEFAULT 0,
    "additionsCount" INTEGER NOT NULL DEFAULT 0,
    "deletionsCount" INTEGER NOT NULL DEFAULT 0,
    "baseCommitSha" TEXT NOT NULL,
    "revisionFeedback" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTestRun" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "proposalId" TEXT,
    "status" "AgentTestRunStatus" NOT NULL,
    "command" TEXT,
    "exitCode" INTEGER,
    "durationMs" INTEGER,
    "stdoutExcerpt" TEXT,
    "stderrExcerpt" TEXT,
    "explanation" TEXT NOT NULL,
    "sandboxed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AgentTestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentUsageRecord" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "stageRole" "AgentStageRole" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DECIMAL(12,6) NOT NULL,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentUsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentProfile_key_key" ON "AgentProfile"("key");

-- CreateIndex
CREATE INDEX "AgentRun_status_leaseExpiresAt_createdAt_idx" ON "AgentRun"("status", "leaseExpiresAt", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_projectId_taskId_createdAt_idx" ON "AgentRun"("projectId", "taskId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_organizationId_createdAt_idx" ON "AgentRun"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRun_projectId_idempotencyKey_key" ON "AgentRun"("projectId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AgentRunEvent_runId_createdAt_idx" ON "AgentRunEvent"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRunEvent_projectId_createdAt_idx" ON "AgentRunEvent"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentPlan_runId_createdAt_idx" ON "AgentPlan"("runId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentPlan_runId_version_key" ON "AgentPlan"("runId", "version");

-- CreateIndex
CREATE INDEX "AgentProposal_runId_createdAt_idx" ON "AgentProposal"("runId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentProposal_runId_version_key" ON "AgentProposal"("runId", "version");

-- CreateIndex
CREATE INDEX "AgentTestRun_runId_createdAt_idx" ON "AgentTestRun"("runId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentUsageRecord_organizationId_createdAt_idx" ON "AgentUsageRecord"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentUsageRecord_projectId_createdAt_idx" ON "AgentUsageRecord"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentUsageRecord_runId_createdAt_idx" ON "AgentUsageRecord"("runId", "createdAt");

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_projectRepositoryId_fkey" FOREIGN KEY ("projectRepositoryId") REFERENCES "ProjectRepository"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRunEvent" ADD CONSTRAINT "AgentRunEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRunEvent" ADD CONSTRAINT "AgentRunEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRunEvent" ADD CONSTRAINT "AgentRunEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRunEvent" ADD CONSTRAINT "AgentRunEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPlan" ADD CONSTRAINT "AgentPlan_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentPlan" ADD CONSTRAINT "AgentPlan_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentProposal" ADD CONSTRAINT "AgentProposal_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentProposal" ADD CONSTRAINT "AgentProposal_planId_fkey" FOREIGN KEY ("planId") REFERENCES "AgentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentProposal" ADD CONSTRAINT "AgentProposal_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTestRun" ADD CONSTRAINT "AgentTestRun_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTestRun" ADD CONSTRAINT "AgentTestRun_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "AgentProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentUsageRecord" ADD CONSTRAINT "AgentUsageRecord_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentUsageRecord" ADD CONSTRAINT "AgentUsageRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentUsageRecord" ADD CONSTRAINT "AgentUsageRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
