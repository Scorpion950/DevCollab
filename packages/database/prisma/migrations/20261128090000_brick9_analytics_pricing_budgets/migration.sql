-- CreateEnum
CREATE TYPE "AiBudgetPeriod" AS ENUM ('WEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "AgentUsageRecord" ADD COLUMN     "cachedTokens" INTEGER,
ADD COLUMN     "costAvailable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "pricingId" TEXT,
ADD COLUMN     "reasoningTokens" INTEGER,
ADD COLUMN     "usageAvailable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "userId" TEXT,
ALTER COLUMN "inputTokens" DROP NOT NULL,
ALTER COLUMN "inputTokens" DROP DEFAULT,
ALTER COLUMN "outputTokens" DROP NOT NULL,
ALTER COLUMN "outputTokens" DROP DEFAULT,
ALTER COLUMN "totalTokens" DROP NOT NULL,
ALTER COLUMN "totalTokens" DROP DEFAULT,
ALTER COLUMN "estimatedCostUsd" DROP NOT NULL,
ALTER COLUMN "estimatedCostUsd" SET DATA TYPE DECIMAL(14,6);

-- AlterTable
ALTER TABLE "AiAssistantUsageRecord" ADD COLUMN     "cachedTokens" INTEGER,
ADD COLUMN     "costAvailable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "pricingId" TEXT,
ADD COLUMN     "reasoningTokens" INTEGER,
ADD COLUMN     "usageAvailable" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "inputTokens" DROP NOT NULL,
ALTER COLUMN "inputTokens" DROP DEFAULT,
ALTER COLUMN "outputTokens" DROP NOT NULL,
ALTER COLUMN "outputTokens" DROP DEFAULT,
ALTER COLUMN "totalTokens" DROP NOT NULL,
ALTER COLUMN "totalTokens" DROP DEFAULT,
ALTER COLUMN "estimatedCostUsd" DROP NOT NULL,
ALTER COLUMN "estimatedCostUsd" SET DATA TYPE DECIMAL(14,6);

-- CreateTable
CREATE TABLE "AiModelPricing" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "inputRatePer1m" DECIMAL(14,6) NOT NULL,
    "outputRatePer1m" DECIMAL(14,6) NOT NULL,
    "cachedInputRatePer1m" DECIMAL(14,6),
    "reasoningRatePer1m" DECIMAL(14,6),
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiModelPricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiBudgetConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "period" "AiBudgetPeriod" NOT NULL DEFAULT 'MONTHLY',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "amountUsd" DECIMAL(14,2) NOT NULL,
    "warningThresholdPct" INTEGER NOT NULL DEFAULT 80,
    "hardLimitMode" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiBudgetConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiBudgetAuditEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "budgetId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "previousValue" JSONB,
    "newValue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiBudgetAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiModelPricing_organizationId_provider_model_isActive_effec_idx" ON "AiModelPricing"("organizationId", "provider", "model", "isActive", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "AiModelPricing_organizationId_provider_model_version_key" ON "AiModelPricing"("organizationId", "provider", "model", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AiBudgetConfig_scopeKey_key" ON "AiBudgetConfig"("scopeKey");

-- CreateIndex
CREATE INDEX "AiBudgetConfig_organizationId_projectId_idx" ON "AiBudgetConfig"("organizationId", "projectId");

-- CreateIndex
CREATE INDEX "AiBudgetAuditEvent_organizationId_createdAt_idx" ON "AiBudgetAuditEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AiBudgetAuditEvent_projectId_createdAt_idx" ON "AiBudgetAuditEvent"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentUsageRecord_idempotencyKey_key" ON "AgentUsageRecord"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AgentUsageRecord_userId_createdAt_idx" ON "AgentUsageRecord"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiAssistantUsageRecord_messageId_key" ON "AiAssistantUsageRecord"("messageId");

-- CreateIndex
CREATE INDEX "AiAssistantUsageRecord_userId_createdAt_idx" ON "AiAssistantUsageRecord"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PullRequest_organizationId_state_githubUpdatedAt_idx" ON "PullRequest"("organizationId", "state", "githubUpdatedAt");

-- CreateIndex
CREATE INDEX "Task_organizationId_status_archivedAt_completedAt_idx" ON "Task"("organizationId", "status", "archivedAt", "completedAt");

-- CreateIndex
CREATE INDEX "Task_organizationId_createdAt_idx" ON "Task"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskActivity_projectId_eventType_createdAt_idx" ON "TaskActivity"("projectId", "eventType", "createdAt");

-- AddForeignKey
ALTER TABLE "AgentUsageRecord" ADD CONSTRAINT "AgentUsageRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentUsageRecord" ADD CONSTRAINT "AgentUsageRecord_pricingId_fkey" FOREIGN KEY ("pricingId") REFERENCES "AiModelPricing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAssistantUsageRecord" ADD CONSTRAINT "AiAssistantUsageRecord_pricingId_fkey" FOREIGN KEY ("pricingId") REFERENCES "AiModelPricing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiModelPricing" ADD CONSTRAINT "AiModelPricing_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiModelPricing" ADD CONSTRAINT "AiModelPricing_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiBudgetConfig" ADD CONSTRAINT "AiBudgetConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiBudgetConfig" ADD CONSTRAINT "AiBudgetConfig_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiBudgetConfig" ADD CONSTRAINT "AiBudgetConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiBudgetAuditEvent" ADD CONSTRAINT "AiBudgetAuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiBudgetAuditEvent" ADD CONSTRAINT "AiBudgetAuditEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiBudgetAuditEvent" ADD CONSTRAINT "AiBudgetAuditEvent_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "AiBudgetConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiBudgetAuditEvent" ADD CONSTRAINT "AiBudgetAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
