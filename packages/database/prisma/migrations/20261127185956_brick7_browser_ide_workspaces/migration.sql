-- CreateEnum
CREATE TYPE "DevWorkspaceStatus" AS ENUM ('CREATING', 'READY', 'ACTIVE', 'SUSPENDED', 'STOPPED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "WorkspaceStorageMode" AS ENUM ('EPHEMERAL', 'LOCAL_VOLUME', 'DURABLE');

-- CreateEnum
CREATE TYPE "WorkspaceSnapshotStatus" AS ENUM ('AVAILABLE', 'RESTORED', 'EXPIRED', 'MISSING');

-- CreateEnum
CREATE TYPE "WorkspaceEventType" AS ENUM ('WORKSPACE_CREATED', 'REPOSITORY_INITIALIZED', 'WORKSPACE_RESUMED', 'WORKSPACE_SUSPENDED', 'WORKSPACE_STOPPED', 'WORKSPACE_DELETED', 'WORKSPACE_FAILED', 'SNAPSHOT_CREATED', 'SNAPSHOT_RESTORED', 'FILE_SAVED', 'FILE_CREATED', 'FILE_RENAMED', 'FILE_DELETED', 'GIT_STAGE_CHANGED', 'GIT_COMMIT_CREATED', 'GIT_BRANCH_SWITCHED', 'AI_PATCH_APPLIED', 'TERMINAL_SESSION_STARTED', 'TERMINAL_SESSION_ENDED', 'TERMINAL_REJECTED');

-- CreateEnum
CREATE TYPE "WorkspaceTerminalSessionStatus" AS ENUM ('ACTIVE', 'ENDED', 'REJECTED');

-- AlterEnum
ALTER TYPE "TaskActivityType" ADD VALUE 'WORKSPACE_AI_PATCH_APPLIED';

-- CreateTable
CREATE TABLE "DevWorkspace" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "projectRepositoryId" TEXT,
    "ownerId" TEXT NOT NULL,
    "taskId" TEXT,
    "name" TEXT NOT NULL,
    "status" "DevWorkspaceStatus" NOT NULL DEFAULT 'CREATING',
    "storageMode" "WorkspaceStorageMode" NOT NULL DEFAULT 'EPHEMERAL',
    "storageWarning" TEXT,
    "repoFullName" TEXT NOT NULL,
    "baseBranch" TEXT NOT NULL,
    "baseCommitSha" TEXT,
    "currentBranch" TEXT,
    "lastCommitSha" TEXT,
    "workspacePathKey" TEXT NOT NULL,
    "dirtyFileCount" INTEGER NOT NULL DEFAULT 0,
    "workerId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "suspendedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevWorkspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "baseCommitSha" TEXT NOT NULL,
    "branchName" TEXT NOT NULL,
    "status" "WorkspaceSnapshotStatus" NOT NULL DEFAULT 'AVAILABLE',
    "storageKey" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "checksumSha256" TEXT NOT NULL,
    "trackedFileCount" INTEGER NOT NULL DEFAULT 0,
    "untrackedFileCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restoredAt" TIMESTAMP(3),

    CONSTRAINT "WorkspaceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "actorId" TEXT,
    "eventType" "WorkspaceEventType" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceTerminalSession" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "WorkspaceTerminalSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "sandboxed" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "exitCode" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "WorkspaceTerminalSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DevWorkspace_workspacePathKey_key" ON "DevWorkspace"("workspacePathKey");

-- CreateIndex
CREATE INDEX "DevWorkspace_organizationId_projectId_status_deletedAt_idx" ON "DevWorkspace"("organizationId", "projectId", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "DevWorkspace_ownerId_status_deletedAt_idx" ON "DevWorkspace"("ownerId", "status", "deletedAt");

-- CreateIndex
CREATE INDEX "DevWorkspace_expiresAt_status_idx" ON "DevWorkspace"("expiresAt", "status");

-- CreateIndex
CREATE INDEX "WorkspaceSnapshot_workspaceId_createdAt_idx" ON "WorkspaceSnapshot"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkspaceEvent_workspaceId_createdAt_idx" ON "WorkspaceEvent"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkspaceEvent_projectId_createdAt_idx" ON "WorkspaceEvent"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkspaceTerminalSession_workspaceId_status_startedAt_idx" ON "WorkspaceTerminalSession"("workspaceId", "status", "startedAt");

-- AddForeignKey
ALTER TABLE "DevWorkspace" ADD CONSTRAINT "DevWorkspace_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevWorkspace" ADD CONSTRAINT "DevWorkspace_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevWorkspace" ADD CONSTRAINT "DevWorkspace_projectRepositoryId_fkey" FOREIGN KEY ("projectRepositoryId") REFERENCES "ProjectRepository"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevWorkspace" ADD CONSTRAINT "DevWorkspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevWorkspace" ADD CONSTRAINT "DevWorkspace_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceSnapshot" ADD CONSTRAINT "WorkspaceSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DevWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceSnapshot" ADD CONSTRAINT "WorkspaceSnapshot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceEvent" ADD CONSTRAINT "WorkspaceEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DevWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceEvent" ADD CONSTRAINT "WorkspaceEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceEvent" ADD CONSTRAINT "WorkspaceEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceEvent" ADD CONSTRAINT "WorkspaceEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceTerminalSession" ADD CONSTRAINT "WorkspaceTerminalSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "DevWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceTerminalSession" ADD CONSTRAINT "WorkspaceTerminalSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceTerminalSession" ADD CONSTRAINT "WorkspaceTerminalSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceTerminalSession" ADD CONSTRAINT "WorkspaceTerminalSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
