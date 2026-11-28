import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import {
  RequireProjectAccess,
  type ScopedRequest,
} from "../authorization/authorization.constants";
import { OrgAccessGuard } from "../authorization/org-access.guard";
import { ProjectAccessGuard } from "../authorization/project-access.guard";
import { requireRequiredId } from "../common/validation";
import { WriteRateLimitGuard } from "../common/write-rate-limit.guard";
import { InternalIdentityGuard } from "../users/identity.guard";
import { CollabService } from "./collab.service";

@Controller("organizations/:orgId/projects/:projectId")
@UseGuards(InternalIdentityGuard, OrgAccessGuard, ProjectAccessGuard)
export class CollabController {
  constructor(private readonly collab: CollabService) {}

  @Get("collab/sessions")
  @RequireProjectAccess("view")
  @Header("Cache-Control", "private, no-store")
  async listSessions(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return {
      sessions: await this.collab.listProjectSessions(
        request.userId,
        orgId,
        projectId,
        request.projectContext,
      ),
    };
  }

  @Post("workspaces/:workspaceId/collab/sessions")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async createSession(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("workspaceId") workspaceId: string,
    @Body() body: { title?: unknown; activeFilePath?: unknown; inviteeIds?: unknown },
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.collab.createSession(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(workspaceId, "Workspace"),
      request.projectContext,
      body ?? {},
    );
  }

  @Get("collab/sessions/:sessionId")
  @RequireProjectAccess("view")
  @Header("Cache-Control", "private, no-store")
  async detail(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.collab.getSessionDetail(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(sessionId, "Session"),
      request.projectContext,
    );
  }

  @Post("collab/sessions/:sessionId/join")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async join(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.collab.joinSession(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(sessionId, "Session"),
      request.projectContext,
    );
  }

  @Post("collab/sessions/:sessionId/leave")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async leave(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.collab.leaveSession(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(sessionId, "Session"),
      request.projectContext,
    );
  }

  @Post("collab/sessions/:sessionId/close")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async close(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.collab.closeSession(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(sessionId, "Session"),
      request.projectContext,
    );
  }

  @Post("collab/sessions/:sessionId/participants")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async inviteParticipant(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Body() body: { userId?: unknown; role?: unknown },
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.collab.inviteParticipant(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(sessionId, "Session"),
      request.projectContext,
      body ?? {},
    );
  }

  @Patch("collab/sessions/:sessionId/participants/:participantUserId")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async updateRole(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Param("participantUserId") participantUserId: string,
    @Body() body: { role?: unknown },
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.collab.updateParticipantRole(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(sessionId, "Session"),
      requireRequiredId(participantUserId, "Participant"),
      request.projectContext,
      body ?? {},
    );
  }

  @Delete("collab/sessions/:sessionId/participants/:participantUserId")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async revokeParticipant(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Param("participantUserId") participantUserId: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.collab.revokeParticipant(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(sessionId, "Session"),
      requireRequiredId(participantUserId, "Participant"),
      request.projectContext,
    );
  }

  @Post("collab/sessions/:sessionId/ticket")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async issueTicket(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.collab.issueWsTicket(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(sessionId, "Session"),
      request.projectContext,
    );
  }

  @Post("collab/sessions/:sessionId/messages")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async postMessage(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
    @Body() body: { body?: unknown; filePath?: unknown; lineNumber?: unknown },
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.collab.postMessage(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(sessionId, "Session"),
      request.projectContext,
      body ?? {},
    );
  }
}
