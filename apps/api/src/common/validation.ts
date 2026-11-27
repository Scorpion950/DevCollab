import { BadRequestException } from "@nestjs/common";

const RESERVED_SLUGS = new Set([
  "new",
  "create",
  "settings",
  "members",
  "invitations",
  "projects",
  "profile",
  "onboarding",
  "api",
  "auth",
  "admin",
  "welcome",
  "app",
  "dev",
  "orgs",
]);

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function requireOrganizationName(input: unknown): string {
  if (typeof input !== "string") {
    throw new BadRequestException("Organization name is required.");
  }
  const trimmed = input.trim();
  if (trimmed.length < 2 || trimmed.length > 80) {
    throw new BadRequestException("Organization name must be between 2 and 80 characters.");
  }
  return trimmed;
}

export function requireOrganizationSlug(input: unknown, fallbackName?: string): string {
  const raw = typeof input === "string" && input.trim() ? input : fallbackName ?? "";
  const normalized = slugify(raw);
  if (normalized.length < 2 || normalized.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    throw new BadRequestException("Organization slug must be 2–64 lowercase letters, numbers, or hyphens.");
  }
  if (RESERVED_SLUGS.has(normalized)) {
    throw new BadRequestException("This organization slug is reserved. Please choose another.");
  }
  return normalized;
}

export function optionalDescription(input: unknown, max = 500): string | null {
  if (input === undefined || input === null) return null;
  if (typeof input !== "string") {
    throw new BadRequestException("Description must be plain text.");
  }
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    throw new BadRequestException(`Description cannot exceed ${max} characters.`);
  }
  return trimmed;
}

export function requireProjectName(input: unknown): string {
  if (typeof input !== "string") {
    throw new BadRequestException("Project name is required.");
  }
  const trimmed = input.trim();
  if (trimmed.length < 2 || trimmed.length > 100) {
    throw new BadRequestException("Project name must be between 2 and 100 characters.");
  }
  return trimmed;
}

export function requireProjectKey(input: unknown): string {
  if (typeof input !== "string") {
    throw new BadRequestException("Project key is required.");
  }
  const normalized = input.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{1,9}$/.test(normalized)) {
    throw new BadRequestException(
      "Project key must be 2–10 characters, start with a letter, and contain only letters and numbers.",
    );
  }
  return normalized;
}

export function requireProjectSlug(name: string, key: string): string {
  const fromName = slugify(name);
  const candidate = fromName.length >= 2 ? fromName : key.toLowerCase();
  return candidate.slice(0, 64);
}

export function requireEmail(input: unknown): string {
  if (typeof input !== "string") {
    throw new BadRequestException("Enter a valid email address.");
  }
  const email = input.trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BadRequestException("Enter a valid email address.");
  }
  return email;
}

export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

export function isPrismaUniqueError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
