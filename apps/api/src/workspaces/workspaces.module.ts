import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../authorization/authorization.module";
import { WriteRateLimitGuard } from "../common/write-rate-limit.guard";
import { GitHubModule } from "../github/github.module";
import { WorkerClientService } from "./worker-client.service";
import { WorkspacesController } from "./workspaces.controller";
import { WorkspacesService } from "./workspaces.service";

@Module({
  imports: [AuthorizationModule, GitHubModule],
  controllers: [WorkspacesController],
  providers: [WorkerClientService, WorkspacesService, WriteRateLimitGuard],
  exports: [WorkerClientService, WorkspacesService],
})
export class WorkspacesModule {}
