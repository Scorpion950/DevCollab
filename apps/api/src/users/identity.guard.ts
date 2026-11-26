import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { jwtVerify } from "jose";

export interface IdentityRequest {
  headers: { authorization?: string };
  userId?: string;
}

@Injectable()
export class InternalIdentityGuard implements CanActivate {
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<IdentityRequest>();
    const secret = process.env.INTERNAL_AUTH_SECRET;
    const match = /^Bearer (\S+)$/.exec(request.headers.authorization ?? "");
    if (!match?.[1] || !secret || secret.length < 32) throw new UnauthorizedException();
    try {
      const { payload } = await jwtVerify(match[1], new TextEncoder().encode(secret), {
        algorithms: ["HS256"], issuer: "devcollab-web", audience: "devcollab-api",
        requiredClaims: ["sub", "iat", "exp"], maxTokenAge: "45s",
      });
      if (typeof payload.sub !== "string" || !payload.sub.trim() || payload.sub.length > 128) throw new Error();
      request.userId = payload.sub;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
