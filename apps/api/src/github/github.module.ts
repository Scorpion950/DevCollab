import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../authorization/authorization.module";
import { GitHubAppClientService } from "./github-app-client.service";
import { GitHubConfigService } from "./github-config.service";
import { GitHubIntegrationsController, ProjectGitHubController } from "./github.controller";
import { GitHubService } from "./github.service";

@Module({
  imports: [AuthorizationModule],
  controllers: [ProjectGitHubController, GitHubIntegrationsController],
  providers: [GitHubConfigService, GitHubAppClientService, GitHubService],
  exports: [GitHubConfigService, GitHubAppClientService, GitHubService],
})
export class GitHubModule {}
