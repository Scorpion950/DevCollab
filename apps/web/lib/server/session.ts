import "server-only";
import { cache } from "react";
import { auth } from "@/auth";

export const getCachedSession = cache(async () => auth());

export function safeInvitePath(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  return /^\/invitations\/[A-Za-z0-9_-]{10,128}$/.test(trimmed) ? trimmed : null;
}
