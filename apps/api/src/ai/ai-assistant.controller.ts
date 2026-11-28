import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AiAssistantStreamEventDto } from "@devcollab/shared";
import {
  RequireProjectAccess,
  type ScopedRequest,
} from "../authorization/authorization.constants";
import { OrgAccessGuard } from "../authorization/org-access.guard";
import { ProjectAccessGuard } from "../authorization/project-access.guard";
import { requireRequiredId } from "../common/validation";
import { WriteRateLimitGuard } from "../common/write-rate-limit.guard";
import { InternalIdentityGuard } from "../users/identity.guard";
import { AiConfigService } from "./ai-config.service";
import { AiAssistantService } from "./ai-assistant.service";

@Controller("organizations/:orgId/projects/:projectId/ai/assistant")
@UseGuards(InternalIdentityGuard, OrgAccessGuard, ProjectAccessGuard)
export class AiAssistantController {
  constructor(
    private readonly assistant: AiAssistantService,
    private readonly aiConfig: AiConfigService,
  ) {}

  @Get("status")
  @RequireProjectAccess("view")
  @Header("Cache-Control", "private, no-store")
  async getStatus(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.assistant.getStatus(orgId, projectId, request.userId, request.projectContext);
  }

  @Get("conversations")
  @RequireProjectAccess("view")
  @Header("Cache-Control", "private, no-store")
  async listConversations(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return {
      conversations: await this.assistant.listConversations(request.userId, orgId, projectId),
    };
  }

  @Post("conversations")
  @RequireProjectAccess("ai")
  @UseGuards(WriteRateLimitGuard)
  async createConversation(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Body()
    body: {
      title?: unknown;
      workspaceId?: unknown;
      taskId?: unknown;
      collabSessionId?: unknown;
      lastActiveFile?: unknown;
    },
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.assistant.createConversation(
      request.userId,
      orgId,
      projectId,
      request.projectContext,
      body ?? {},
    );
  }

  @Get("conversations/:conversationId")
  @RequireProjectAccess("view")
  @Header("Cache-Control", "private, no-store")
  async getConversation(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("conversationId") conversationId: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.assistant.getConversationDetail(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(conversationId, "Conversation"),
    );
  }

  @Delete("conversations/:conversationId")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async deleteConversation(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("conversationId") conversationId: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.assistant.deleteConversation(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(conversationId, "Conversation"),
    );
  }

  @Post("conversations/:conversationId/stream")
  @RequireProjectAccess("ai")
  @UseGuards(WriteRateLimitGuard)
  async streamMessage(
    @Req() request: ScopedRequest & IncomingMessage,
    @Res() response: ServerResponse & { flushHeaders?: () => void },
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("conversationId") conversationId: string,
    @Body()
    body: {
      prompt?: unknown;
      actionKind?: unknown;
      workspaceId?: unknown;
      taskId?: unknown;
      pullRequestId?: unknown;
      activeFilePath?: unknown;
      selectedText?: unknown;
      selectionStartLine?: unknown;
      selectionEndLine?: unknown;
      attachedPaths?: unknown;
      includeLocalDiff?: unknown;
    },
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    if (!this.aiConfig.isConfigured()) {
      throw new ServiceUnavailableException(
        "AI provider is not configured on this server (set AI_PROVIDER, AI_MODEL, and AI_API_KEY).",
      );
    }

    const abortController = new AbortController();
    const onClose = () => {
      if (!response.writableEnded) {
        abortController.abort(new Error("Client disconnected"));
      }
    };
    request.on("close", onClose);
    response.on("close", onClose);

    let sseOpened = false;
    const ensureSseHeaders = () => {
      if (sseOpened) return;
      sseOpened = true;
      response.statusCode = 200;
      response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      response.setHeader("Cache-Control", "no-cache, no-transform");
      response.setHeader("Connection", "keep-alive");
      response.setHeader("X-Accel-Buffering", "no");
      response.flushHeaders?.();
    };

    const emit = (event: AiAssistantStreamEventDto) => {
      if (response.writableEnded || response.destroyed) return;
      ensureSseHeaders();
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      await this.assistant.streamMessage({
        actorUserId: request.userId,
        orgId,
        projectId,
        conversationId: requireRequiredId(conversationId, "Conversation"),
        projectContext: request.projectContext,
        body: body ?? {},
        signal: abortController.signal,
        emit,
      });
    } catch (error) {
      if (!sseOpened) {
        request.off("close", onClose);
        response.off("close", onClose);
        throw error;
      }
      const message = error instanceof Error ? error.message : "Streaming assistant request failed.";
      emit({ type: "error", message, status: "FAILED" });
    } finally {
      request.off("close", onClose);
      response.off("close", onClose);
      if (sseOpened && !response.writableEnded) {
        response.end();
      }
    }
  }

  @Post("conversations/:conversationId/messages/:messageId/apply-proposal")
  @RequireProjectAccess("ai")
  @UseGuards(WriteRateLimitGuard)
  async applyProposal(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("conversationId") conversationId: string,
    @Param("messageId") messageId: string,
    @Body() body: { workspaceId?: unknown },
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.assistant.applyAssistantProposal(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(conversationId, "Conversation"),
      requireRequiredId(messageId, "Message"),
      request.projectContext,
      typeof body?.workspaceId === "string" ? body.workspaceId : undefined,
    );
  }
}
