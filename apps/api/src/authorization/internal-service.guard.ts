import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { jwtVerify } from "jose";

@Injectable()
export class InternalServiceGuard implements CanActivate {
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ headers: { authorization?: string } }>();
    const secret = process.env.INTERNAL_AUTH_SECRET;
    const match = /^Bearer (\S+)$/.exec(request.headers.authorization ?? "");
    if (!match?.[1] || !secret || secret.length < 32) throw new UnauthorizedException();
    try {
      await jwtVerify(match[1], new TextEncoder().encode(secret), {
        algorithms: ["HS256"],
        issuer: "devcollab-web",
        audience: "devcollab-api-service",
        requiredClaims: ["iat", "exp"],
        maxTokenAge: "45s",
      });
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
