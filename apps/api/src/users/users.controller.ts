import { Controller, Get, Header, Req, ServiceUnavailableException, UnauthorizedException, UseGuards } from "@nestjs/common";
import { getDatabase } from "@devcollab/database";
import { InternalIdentityGuard, type IdentityRequest } from "./identity.guard";

@Controller("users")
@UseGuards(InternalIdentityGuard)
export class UsersController {
  @Get("me")
  @Header("Cache-Control", "private, no-store")
  async profile(@Req() request: IdentityRequest) {
    if (!request.userId) throw new UnauthorizedException();
    let user;
    try {
      user = await getDatabase().user.findUnique({ where: { id: request.userId },
        select: { id: true, name: true, email: true, image: true } });
    } catch {
      throw new ServiceUnavailableException("Profile service unavailable.");
    }
    if (!user) throw new UnauthorizedException();
    return user;
  }
}
