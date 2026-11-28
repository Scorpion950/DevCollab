import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AiModule } from "./ai/ai.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { AuthorizationModule } from "./authorization/authorization.module";
import { CollabModule } from "./collab/collab.module";
import { validateEnvironment } from "./config/environment";
import { DatabaseModule } from "./database/database.module";
import { GitHubModule } from "./github/github.module";
import { HealthModule } from "./health/health.module";
import { InvitationsModule } from "./invitations/invitations.module";
import { MembershipsModule } from "./memberships/memberships.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { ProjectsModule } from "./projects/projects.module";
import { TasksModule } from "./tasks/tasks.module";
import { UsersModule } from "./users/users.module";
import { WorkspaceModule } from "./workspace/workspace.module";
import { WorkspacesModule } from "./workspaces/workspaces.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    DatabaseModule,
    AuthorizationModule,
    HealthModule,
    UsersModule,
    WorkspaceModule,
    OrganizationsModule,
    MembershipsModule,
    InvitationsModule,
    ProjectsModule,
    TasksModule,
    GitHubModule,
    AiModule,
    WorkspacesModule,
    CollabModule,
    AnalyticsModule,
  ],
})
export class AppModule {}
