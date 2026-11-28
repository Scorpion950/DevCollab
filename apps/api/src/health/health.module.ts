import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { AuthorizationModule } from "../authorization/authorization.module";
import { GitHubModule } from "../github/github.module";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { HealthController } from "./health.controller";
import { HealthService } from "./health.service";

@Module({
  imports: [AuthorizationModule, GitHubModule, AiModule, WorkspacesModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
