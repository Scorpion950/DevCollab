import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { InternalIdentityGuard } from "./identity.guard";
@Module({ controllers: [UsersController], providers: [InternalIdentityGuard] })
export class UsersModule {}
