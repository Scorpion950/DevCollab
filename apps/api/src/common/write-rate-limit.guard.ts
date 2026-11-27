import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import type { IdentityRequest } from "../users/identity.guard";

const WINDOW_MS = 60_000;
const MAX_WRITES_PER_WINDOW = 120;

@Injectable()
export class WriteRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<IdentityRequest>();
    const key = request.userId;
    if (!key) return true;

    const now = Date.now();
    if (this.buckets.size > 5000) {
      for (const [k, v] of this.buckets.entries()) {
        if (v.resetAt <= now) this.buckets.delete(k);
      }
    }

    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return true;
    }

    if (existing.count >= MAX_WRITES_PER_WINDOW) {
      throw new HttpException(
        "Too many task updates in a short period. Please wait a moment and try again.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    existing.count += 1;
    return true;
  }
}
