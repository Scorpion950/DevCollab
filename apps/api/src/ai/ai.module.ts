import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../authorization/authorization.module";
import { WriteRateLimitGuard } from "../common/write-rate-limit.guard";
import { GitHubModule } from "../github/github.module";
import { TasksModule } from "../tasks/tasks.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { AiAssistantController } from "./ai-assistant.controller";
import { AiAssistantService } from "./ai-assistant.service";
import { AiConfigService } from "./ai-config.service";
import { AiRunsService } from "./ai-runs.service";
import { AiController } from "./ai.controller";

@Module({
  imports: [AuthorizationModule, GitHubModule, TasksModule, WorkspacesModule],
  controllers: [AiController, AiAssistantController],
  providers: [AiConfigService, AiRunsService, AiAssistantService, WriteRateLimitGuard],
  exports: [AiConfigService, AiRunsService, AiAssistantService],
})
export class AiModule {}
