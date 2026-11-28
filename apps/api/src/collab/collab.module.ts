import { Module } from "@nestjs/common";
import { AuthorizationModule } from "../authorization/authorization.module";
import { WriteRateLimitGuard } from "../common/write-rate-limit.guard";
import { WorkspacesModule } from "../workspaces/workspaces.module";
import { CollabController } from "./collab.controller";
import { CollabService } from "./collab.service";

@Module({
  imports: [AuthorizationModule, WorkspacesModule],
  controllers: [CollabController],
  providers: [CollabService, WriteRateLimitGuard],
  exports: [CollabService],
})
export class CollabModule {}
