-- CreateEnum
CREATE TYPE "GitHubInstallationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "RepositoryConnectionStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'ACCESS_REVOKED', 'ERROR');

-- CreateEnum
CREATE TYPE "PullRequestState" AS ENUM ('OPEN', 'CLOSED', 'MERGED');

-- CreateEnum
CREATE TYPE "InternalReviewDecision" AS ENUM ('NONE', 'NEEDS_DISCUSSION', 'CHANGES_SUGGESTED', 'READY_FOR_REVIEW', 'INTERNALLY_APPROVED');

-- CreateEnum
CREATE TYPE "ReviewThreadStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "DiffLineSide" AS ENUM ('LEFT', 'RIGHT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TaskActivityType" ADD VALUE 'PR_LINKED';
ALTER TYPE "TaskActivityType" ADD VALUE 'PR_UNLINKED';

-- CreateTable
CREATE TABLE "GitHubAppInstallation" (
    "id" TEXT NOT NULL,
    "githubInstallationId" TEXT NOT NULL,
    "accountLogin" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "accountAvatarUrl" TEXT,
    "status" "GitHubInstallationStatus" NOT NULL DEFAULT 'ACTIVE',
    "permissions" JSONB,
    "suspendedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubAppInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationGitHubInstallation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "connectedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationGitHubInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitHubInstallSession" (
    "id" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GitHubInstallSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectRepository" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "githubRepoId" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "defaultBranch" TEXT NOT NULL,
    "description" TEXT,
    "htmlUrl" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "status" "RepositoryConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "activeLock" TEXT,
    "connectedById" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncError" TEXT,
    "openPrCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectRepository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PullRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "projectRepositoryId" TEXT NOT NULL,
    "githubPrId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "state" "PullRequestState" NOT NULL,
    "isDraft" BOOLEAN NOT NULL DEFAULT false,
    "authorLogin" TEXT NOT NULL,
    "authorAvatarUrl" TEXT,
    "headRef" TEXT NOT NULL,
    "baseRef" TEXT NOT NULL,
    "headSha" TEXT NOT NULL,
    "mergeableState" TEXT,
    "githubReviewDecision" TEXT,
    "additions" INTEGER NOT NULL DEFAULT 0,
    "deletions" INTEGER NOT NULL DEFAULT 0,
    "changedFilesCount" INTEGER NOT NULL DEFAULT 0,
    "htmlUrl" TEXT NOT NULL,
    "githubCreatedAt" TIMESTAMP(3) NOT NULL,
    "githubUpdatedAt" TIMESTAMP(3) NOT NULL,
    "mergedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PullRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PullRequestReviewComment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "pullRequestId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "filePath" TEXT,
    "lineNumber" INTEGER,
    "lineSide" "DiffLineSide",
    "commitSha" TEXT NOT NULL,
    "status" "ReviewThreadStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PullRequestReviewComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PullRequestInternalReview" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "pullRequestId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "decision" "InternalReviewDecision" NOT NULL,
    "summary" TEXT,
    "commitSha" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PullRequestInternalReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskPullRequestLink" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "pullRequestId" TEXT NOT NULL,
    "linkedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskPullRequestLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitHubWebhookDelivery" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "action" TEXT,
    "githubInstallationId" TEXT,
    "githubRepoId" TEXT,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "GitHubWebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GitHubAppInstallation_githubInstallationId_key" ON "GitHubAppInstallation"("githubInstallationId");

-- CreateIndex
CREATE INDEX "OrganizationGitHubInstallation_installationId_idx" ON "OrganizationGitHubInstallation"("installationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationGitHubInstallation_organizationId_installationI_key" ON "OrganizationGitHubInstallation"("organizationId", "installationId");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubInstallSession_stateHash_key" ON "GitHubInstallSession"("stateHash");

-- CreateIndex
CREATE INDEX "GitHubInstallSession_expiresAt_idx" ON "GitHubInstallSession"("expiresAt");

-- CreateIndex
CREATE INDEX "ProjectRepository_organizationId_projectId_status_idx" ON "ProjectRepository"("organizationId", "projectId", "status");

-- CreateIndex
CREATE INDEX "ProjectRepository_githubRepoId_status_idx" ON "ProjectRepository"("githubRepoId", "status");

-- CreateIndex
CREATE INDEX "ProjectRepository_installationId_idx" ON "ProjectRepository"("installationId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectRepository_projectId_activeLock_key" ON "ProjectRepository"("projectId", "activeLock");

-- CreateIndex
CREATE INDEX "PullRequest_projectRepositoryId_state_githubUpdatedAt_idx" ON "PullRequest"("projectRepositoryId", "state", "githubUpdatedAt");

-- CreateIndex
CREATE INDEX "PullRequest_projectId_state_githubUpdatedAt_idx" ON "PullRequest"("projectId", "state", "githubUpdatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PullRequest_projectRepositoryId_number_key" ON "PullRequest"("projectRepositoryId", "number");

-- CreateIndex
CREATE INDEX "PullRequestReviewComment_pullRequestId_createdAt_idx" ON "PullRequestReviewComment"("pullRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "PullRequestReviewComment_pullRequestId_filePath_createdAt_idx" ON "PullRequestReviewComment"("pullRequestId", "filePath", "createdAt");

-- CreateIndex
CREATE INDEX "PullRequestInternalReview_pullRequestId_updatedAt_idx" ON "PullRequestInternalReview"("pullRequestId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PullRequestInternalReview_pullRequestId_reviewerId_key" ON "PullRequestInternalReview"("pullRequestId", "reviewerId");

-- CreateIndex
CREATE INDEX "TaskPullRequestLink_pullRequestId_idx" ON "TaskPullRequestLink"("pullRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskPullRequestLink_taskId_pullRequestId_key" ON "TaskPullRequestLink"("taskId", "pullRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubWebhookDelivery_deliveryId_key" ON "GitHubWebhookDelivery"("deliveryId");

-- CreateIndex
CREATE INDEX "GitHubWebhookDelivery_receivedAt_idx" ON "GitHubWebhookDelivery"("receivedAt");

-- AddForeignKey
ALTER TABLE "OrganizationGitHubInstallation" ADD CONSTRAINT "OrganizationGitHubInstallation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationGitHubInstallation" ADD CONSTRAINT "OrganizationGitHubInstallation_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "GitHubAppInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationGitHubInstallation" ADD CONSTRAINT "OrganizationGitHubInstallation_connectedById_fkey" FOREIGN KEY ("connectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubInstallSession" ADD CONSTRAINT "GitHubInstallSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubInstallSession" ADD CONSTRAINT "GitHubInstallSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubInstallSession" ADD CONSTRAINT "GitHubInstallSession_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRepository" ADD CONSTRAINT "ProjectRepository_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRepository" ADD CONSTRAINT "ProjectRepository_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRepository" ADD CONSTRAINT "ProjectRepository_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "GitHubAppInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectRepository" ADD CONSTRAINT "ProjectRepository_connectedById_fkey" FOREIGN KEY ("connectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PullRequest" ADD CONSTRAINT "PullRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PullRequest" ADD CONSTRAINT "PullRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PullRequest" ADD CONSTRAINT "PullRequest_projectRepositoryId_fkey" FOREIGN KEY ("projectRepositoryId") REFERENCES "ProjectRepository"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PullRequestReviewComment" ADD CONSTRAINT "PullRequestReviewComment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PullRequestReviewComment" ADD CONSTRAINT "PullRequestReviewComment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PullRequestReviewComment" ADD CONSTRAINT "PullRequestReviewComment_pullRequestId_fkey" FOREIGN KEY ("pullRequestId") REFERENCES "PullRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PullRequestReviewComment" ADD CONSTRAINT "PullRequestReviewComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PullRequestReviewComment" ADD CONSTRAINT "PullRequestReviewComment_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PullRequestInternalReview" ADD CONSTRAINT "PullRequestInternalReview_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PullRequestInternalReview" ADD CONSTRAINT "PullRequestInternalReview_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PullRequestInternalReview" ADD CONSTRAINT "PullRequestInternalReview_pullRequestId_fkey" FOREIGN KEY ("pullRequestId") REFERENCES "PullRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PullRequestInternalReview" ADD CONSTRAINT "PullRequestInternalReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskPullRequestLink" ADD CONSTRAINT "TaskPullRequestLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskPullRequestLink" ADD CONSTRAINT "TaskPullRequestLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskPullRequestLink" ADD CONSTRAINT "TaskPullRequestLink_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskPullRequestLink" ADD CONSTRAINT "TaskPullRequestLink_pullRequestId_fkey" FOREIGN KEY ("pullRequestId") REFERENCES "PullRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskPullRequestLink" ADD CONSTRAINT "TaskPullRequestLink_linkedById_fkey" FOREIGN KEY ("linkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
