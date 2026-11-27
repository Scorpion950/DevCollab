import { Module } from "@nestjs/common";
import { InvitationsController, OrgInvitationsController } from "./invitations.controller";
import { InvitationsService } from "./invitations.service";

@Module({
  controllers: [OrgInvitationsController, InvitationsController],
  providers: [InvitationsService],
})
export class InvitationsModule {}
