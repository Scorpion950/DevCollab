-- CreateEnum
CREATE TYPE "CollabSessionStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "CollabRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "CollabParticipantStatus" AS ENUM ('ACTIVE', 'LEFT', 'REMOVED');

-- CreateEnum
CREATE TYPE "AiMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AiInlineActionKind" AS ENUM ('CHAT', 'EXPLAIN', 'IMPROVE', 'FIND_BUGS', 'GENERATE_TESTS');

-- CreateEnum
CREATE TYPE "AiMessageStatus" AS ENUM ('STREAMING', 'COMPLETED', 'CANCELLED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TaskActivityType" ADD VALUE 'COLLAB_SESSION_STARTED';
ALTER TYPE "TaskActivityType" ADD VALUE 'COLLAB_SESSION_CLOSED';
ALTER TYPE "TaskActivityType" ADD VALUE 'AI_ASSISTANT_PATCH_APPLIED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WorkspaceEventType" ADD VALUE 'COLLAB_SESSION_STARTED';
ALTER TYPE "WorkspaceEventType" ADD VALUE 'COLLAB_SESSION_CLOSED';
ALTER TYPE "WorkspaceEventType" ADD VALUE 'COLLAB_PARTICIPANT_JOINED';
ALTER TYPE "WorkspaceEventType" ADD VALUE 'COLLAB_PARTICIPANT_REVOKED';
ALTER TYPE "WorkspaceEventType" ADD VALUE 'COLLAB_FILE_FLUSHED';
ALTER TYPE "WorkspaceEventType" ADD VALUE 'AI_ASSISTANT_PATCH_APPLIED';

-- CreateTable
CREATE TABLE "CollabSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taskId" TEXT,
    "createdById" TEXT NOT NULL,
    "closedById" TEXT,
    "title" TEXT NOT NULL,
    "status" "CollabSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "activeFilePath" TEXT,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollabSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollabParticipant" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "invitedById" TEXT,
    "role" "CollabRole" NOT NULL DEFAULT 'EDITOR',
    "status" "CollabParticipantStatus" NOT NULL DEFAULT 'ACTIVE',
    "colorHex" TEXT NOT NULL DEFAULT '#3b82f6',
    "revokedReason" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollabParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollabDocument" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "docKey" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "versionSeq" INTEGER NOT NULL DEFAULT 1,
    "contentSha256" TEXT NOT NULL,
    "lastModifiedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "lastSavedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollabDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollabMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "filePath" TEXT,
    "lineNumber" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollabMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiConversation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "taskId" TEXT,
    "collabSessionId" TEXT,
    "title" TEXT NOT NULL,
    "isSharedWithSession" BOOLEAN NOT NULL DEFAULT false,
    "lastActiveFile" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "authorId" TEXT,
    "role" "AiMessageRole" NOT NULL,
    "actionKind" "AiInlineActionKind" NOT NULL DEFAULT 'CHAT',
    "status" "AiMessageStatus" NOT NULL DEFAULT 'COMPLETED',
    "content" TEXT NOT NULL,
    "errorMessage" TEXT,
    "attachedContext" JSONB,
    "citations" JSONB,
    "proposalJson" JSONB,
    "provider" TEXT,
    "model" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAssistantUsageRecord" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT,
    "actionKind" "AiInlineActionKind" NOT NULL DEFAULT 'CHAT',
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DECIMAL(12,6) NOT NULL,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAssistantUsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CollabSession_organizationId_projectId_status_updatedAt_idx" ON "CollabSession"("organizationId", "projectId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "CollabSession_workspaceId_status_idx" ON "CollabSession"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "CollabParticipant_sessionId_status_idx" ON "CollabParticipant"("sessionId", "status");

-- CreateIndex
CREATE INDEX "CollabParticipant_userId_status_idx" ON "CollabParticipant"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CollabParticipant_sessionId_userId_key" ON "CollabParticipant"("sessionId", "userId");

-- CreateIndex
CREATE INDEX "CollabDocument_sessionId_deletedAt_updatedAt_idx" ON "CollabDocument"("sessionId", "deletedAt", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CollabDocument_sessionId_filePath_key" ON "CollabDocument"("sessionId", "filePath");

-- CreateIndex
CREATE UNIQUE INDEX "CollabDocument_sessionId_docKey_key" ON "CollabDocument"("sessionId", "docKey");

-- CreateIndex
CREATE INDEX "CollabMessage_sessionId_createdAt_idx" ON "CollabMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "AiConversation_organizationId_projectId_userId_updatedAt_idx" ON "AiConversation"("organizationId", "projectId", "userId", "updatedAt");

-- CreateIndex
CREATE INDEX "AiConversation_collabSessionId_isSharedWithSession_idx" ON "AiConversation"("collabSessionId", "isSharedWithSession");

-- CreateIndex
CREATE INDEX "AiMessage_conversationId_createdAt_idx" ON "AiMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "AiAssistantUsageRecord_organizationId_createdAt_idx" ON "AiAssistantUsageRecord"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AiAssistantUsageRecord_projectId_createdAt_idx" ON "AiAssistantUsageRecord"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "AiAssistantUsageRecord_conversationId_createdAt_idx" ON "AiAssistantUsageRecord"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "CollabSession" ADD CONSTRAINT "CollabSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollabSession" ADD CONSTRAINT "CollabSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollabSession" ADD CONSTRAINT "CollabSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DevWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollabSession" ADD CONSTRAINT "CollabSession_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollabSession" ADD CONSTRAINT "CollabSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollabSession" ADD CONSTRAINT "CollabSession_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollabParticipant" ADD CONSTRAINT "CollabParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CollabSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollabParticipant" ADD CONSTRAINT "CollabParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollabParticipant" ADD CONSTRAINT "CollabParticipant_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollabDocument" ADD CONSTRAINT "CollabDocument_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CollabSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollabDocument" ADD CONSTRAINT "CollabDocument_lastModifiedById_fkey" FOREIGN KEY ("lastModifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollabMessage" ADD CONSTRAINT "CollabMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CollabSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollabMessage" ADD CONSTRAINT "CollabMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollabMessage" ADD CONSTRAINT "CollabMessage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollabMessage" ADD CONSTRAINT "CollabMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DevWorkspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiConversation" ADD CONSTRAINT "AiConversation_collabSessionId_fkey" FOREIGN KEY ("collabSessionId") REFERENCES "CollabSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiMessage" ADD CONSTRAINT "AiMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAssistantUsageRecord" ADD CONSTRAINT "AiAssistantUsageRecord_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AiConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAssistantUsageRecord" ADD CONSTRAINT "AiAssistantUsageRecord_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "AiMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAssistantUsageRecord" ADD CONSTRAINT "AiAssistantUsageRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAssistantUsageRecord" ADD CONSTRAINT "AiAssistantUsageRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAssistantUsageRecord" ADD CONSTRAINT "AiAssistantUsageRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
