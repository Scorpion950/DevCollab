#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash, createPrivateKey } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const PLACEHOLDER_PATTERNS = [
  /generate-with/i,
  /must-match/i,
  /USER:PASSWORD/i,
  /ep-example/i,
  /replace-?me/i,
  /changeme/i,
  /example-secret/i,
];

function parseEnvFile(relPath) {
  const full = path.resolve(relPath);
  if (!fs.existsSync(full)) return { exists: false, map: new Map() };
  const map = new Map();
  for (const rawLine of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    map.set(key, val);
  }
  return { exists: true, map };
}

function fingerprint(value) {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 8);
}

function isPlaceholder(value) {
  return PLACEHOLDER_PATTERNS.some((rx) => rx.test(value));
}

function isValidPostgresUrl(value) {
  try {
    const u = new URL(value);
    return (
      (u.protocol === "postgres:" || u.protocol === "postgresql:") &&
      Boolean(u.hostname) &&
      !isPlaceholder(value)
    );
  } catch {
    return false;
  }
}

function isValidHttpUrl(value) {
  try {
    const u = new URL(value);
    return (u.protocol === "http:" || u.protocol === "https:") && Boolean(u.hostname);
  } catch {
    return false;
  }
}

function isValidWsUrl(value) {
  try {
    const u = new URL(value);
    return (u.protocol === "ws:" || u.protocol === "wss:") && Boolean(u.hostname);
  } catch {
    return false;
  }
}

function checkDockerAvailable() {
  try {
    execFileSync("docker", ["info", "--format", "{{.ServerVersion}}"], {
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2500,
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

const dbEnv = parseEnvFile("packages/database/.env");
const webEnv = parseEnvFile("apps/web/.env.local");
const apiEnv = parseEnvFile("apps/api/.env");
const workerEnv = parseEnvFile("apps/worker/.env");

const errors = [];
const warnings = [];

for (const [label, parsed] of [
  ["packages/database/.env", dbEnv],
  ["apps/web/.env.local", webEnv],
  ["apps/api/.env", apiEnv],
  ["apps/worker/.env", workerEnv],
]) {
  if (!parsed.exists) {
    errors.push(`Missing environment file: ${label}`);
  }
}

// Required schema & DB validation
if (dbEnv.exists) {
  if (!isValidPostgresUrl(dbEnv.map.get("DIRECT_URL") || "")) {
    errors.push("packages/database/.env: DIRECT_URL missing or invalid PostgreSQL URL.");
  }
  if (!isValidPostgresUrl(dbEnv.map.get("DATABASE_URL") || "")) {
    errors.push("packages/database/.env: DATABASE_URL missing or invalid PostgreSQL URL.");
  }
}

// Web frontend validation
if (webEnv.exists) {
  if (!isValidPostgresUrl(webEnv.map.get("DATABASE_URL") || "")) {
    errors.push("apps/web/.env.local: DATABASE_URL missing or invalid PostgreSQL URL.");
  }
  if (!isValidHttpUrl(webEnv.map.get("AUTH_URL") || "")) {
    errors.push("apps/web/.env.local: AUTH_URL must be an HTTP/HTTPS URL.");
  }
  const authSecret = webEnv.map.get("AUTH_SECRET") || "";
  if (authSecret.length < 32 || isPlaceholder(authSecret)) {
    errors.push("apps/web/.env.local: AUTH_SECRET must be at least 32 non-placeholder characters.");
  }
  const webInternal = webEnv.map.get("INTERNAL_AUTH_SECRET") || "";
  if (webInternal.length < 32 || isPlaceholder(webInternal)) {
    errors.push("apps/web/.env.local: INTERNAL_AUTH_SECRET must be at least 32 non-placeholder characters.");
  }
  if (!isValidHttpUrl(webEnv.map.get("API_BASE_URL") || "")) {
    errors.push("apps/web/.env.local: API_BASE_URL must be an HTTP/HTTPS URL.");
  }
  for (const k of webEnv.map.keys()) {
    if (k.startsWith("NEXT_PUBLIC_") && /SECRET|KEY|TOKEN|PASSWORD|DATABASE/i.test(k)) {
      errors.push(`apps/web/.env.local: Forbidden public exposure variable name "${k}".`);
    }
  }
}

// API validation
if (apiEnv.exists) {
  if (!isValidPostgresUrl(apiEnv.map.get("DATABASE_URL") || "")) {
    errors.push("apps/api/.env: DATABASE_URL missing or invalid PostgreSQL URL.");
  }
  const apiInternal = apiEnv.map.get("INTERNAL_AUTH_SECRET") || "";
  if (apiInternal.length < 32 || isPlaceholder(apiInternal)) {
    errors.push("apps/api/.env: INTERNAL_AUTH_SECRET must be at least 32 non-placeholder characters.");
  }
  const apiPort = Number(apiEnv.map.get("PORT") || "4000");
  if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) {
    errors.push("apps/api/.env: PORT must be a valid TCP port.");
  }
  if (!isValidHttpUrl(apiEnv.map.get("WORKER_URL") || "")) {
    errors.push("apps/api/.env: WORKER_URL must be an HTTP/HTTPS URL.");
  }
  if (!isValidWsUrl(apiEnv.map.get("WORKER_TERMINAL_PUBLIC_URL") || "")) {
    errors.push("apps/api/.env: WORKER_TERMINAL_PUBLIC_URL must be a ws:// or wss:// URL.");
  }
}

// Worker validation
if (workerEnv.exists) {
  if (!isValidPostgresUrl(workerEnv.map.get("DATABASE_URL") || "")) {
    errors.push("apps/worker/.env: DATABASE_URL missing or invalid PostgreSQL URL.");
  }
  const workerInternal = workerEnv.map.get("INTERNAL_AUTH_SECRET") || "";
  if (workerInternal.length < 32 || isPlaceholder(workerInternal)) {
    errors.push("apps/worker/.env: INTERNAL_AUTH_SECRET must be at least 32 non-placeholder characters.");
  }
  const workerPort = Number(workerEnv.map.get("WORKER_PORT") || "4100");
  if (!Number.isInteger(workerPort) || workerPort < 1 || workerPort > 65535) {
    errors.push("apps/worker/.env: WORKER_PORT must be a valid TCP port.");
  }
  const storageDir = workerEnv.map.get("WORKSPACE_STORAGE_DIR") || "";
  if (storageDir) {
    const resolved = path.resolve(storageDir);
    if (resolved === path.parse(resolved).root || resolved === process.env.HOME || resolved === process.env.USERPROFILE) {
      errors.push("apps/worker/.env: WORKSPACE_STORAGE_DIR cannot target filesystem or user home root.");
    }
  }
}

// Cross-service consistency checks (strictly fingerprint-based; never print secret values)
const dbFps = [dbEnv, webEnv, apiEnv, workerEnv]
  .filter((x) => x.exists && x.map.get("DATABASE_URL"))
  .map((x) => fingerprint(x.map.get("DATABASE_URL")));
if (new Set(dbFps).size > 1) {
  errors.push("DATABASE_URL does not match across database, web, api, and worker env files.");
}

const secFps = [webEnv, apiEnv, workerEnv]
  .filter((x) => x.exists && x.map.get("INTERNAL_AUTH_SECRET"))
  .map((x) => fingerprint(x.map.get("INTERNAL_AUTH_SECRET")));
if (new Set(secFps).size > 1) {
  errors.push("INTERNAL_AUTH_SECRET does not match across web, api, and worker env files.");
}

if (webEnv.exists && apiEnv.exists && workerEnv.exists) {
  try {
    const webPort = new URL(webEnv.map.get("AUTH_URL")).port || "80";
    const apiPort = String(Number(apiEnv.map.get("PORT") || "4000"));
    const workerPort = String(Number(workerEnv.map.get("WORKER_PORT") || "4100"));
    if (new Set([webPort, apiPort, workerPort]).size < 3) {
      errors.push(`Port conflict detected across services (web=${webPort}, api=${apiPort}, worker=${workerPort}).`);
    }
    const apiBasePort = new URL(webEnv.map.get("API_BASE_URL")).port || "80";
    if (apiBasePort !== apiPort) {
      errors.push(`API_BASE_URL port (${apiBasePort}) differs from apps/api PORT (${apiPort}).`);
    }
    const workerUrlPort = new URL(apiEnv.map.get("WORKER_URL")).port || "80";
    if (workerUrlPort !== workerPort) {
      errors.push(`apps/api WORKER_URL port (${workerUrlPort}) differs from apps/worker WORKER_PORT (${workerPort}).`);
    }
    const authOrigin = new URL(webEnv.map.get("AUTH_URL")).origin;
    const apiCors = (apiEnv.map.get("CORS_ORIGINS") || "").split(",").map((s) => s.trim());
    if (!apiCors.includes(authOrigin)) {
      warnings.push(`apps/api CORS_ORIGINS does not include web AUTH_URL origin (${authOrigin}).`);
    }
  } catch {
    // URL parsing errors already recorded above
  }
}

// Optional integrations & sandbox status
const googleConfigured = Boolean(webEnv.map.get("AUTH_GOOGLE_ID") && webEnv.map.get("AUTH_GOOGLE_SECRET"));
const githubOauthConfigured = Boolean(webEnv.map.get("AUTH_GITHUB_ID") && webEnv.map.get("AUTH_GITHUB_SECRET"));

const ghId = apiEnv.map.get("GITHUB_APP_ID") || "";
const ghSlug = apiEnv.map.get("GITHUB_APP_SLUG") || "";
const ghPemRaw = (apiEnv.map.get("GITHUB_APP_PRIVATE_KEY") || "").replace(/\\n/g, "\n").trim();
let ghAppStatus = "not configured (optional manual external setup)";
if (ghId || ghSlug || ghPemRaw) {
  let pemValid = false;
  if (ghPemRaw) {
    try {
      createPrivateKey(ghPemRaw);
      pemValid = true;
    } catch {
      pemValid = false;
    }
  }
  if (ghId && ghSlug && pemValid) {
    ghAppStatus = "configured";
  } else {
    warnings.push("GitHub App configuration is incomplete or private key PEM is invalid.");
    ghAppStatus = "partially configured (invalid/missing fields)";
  }
}

const aiProv = apiEnv.map.get("AI_PROVIDER") || "";
const aiModel = apiEnv.map.get("AI_MODEL") || "";
const aiKey = apiEnv.map.get("AI_API_KEY") || "";
let aiStatus = "not configured (optional manual external setup)";
if (aiProv || aiModel || aiKey) {
  if (aiProv && aiModel && aiKey) {
    aiStatus = `configured (${aiProv})`;
  } else {
    warnings.push("AI provider configuration is partial; AI_PROVIDER, AI_MODEL, and AI_API_KEY are all required.");
    aiStatus = "partially configured";
  }
}

const dockerReady = checkDockerAvailable();
const sandboxEnabled =
  String(workerEnv.map.get("SANDBOX_ENABLED") || apiEnv.map.get("SANDBOX_ENABLED") || "false")
    .trim()
    .toLowerCase() !== "false";
const terminalEnabled =
  String(workerEnv.map.get("WORKSPACE_TERMINAL_ENABLED") || "false")
    .trim()
    .toLowerCase() !== "false";

if (!dockerReady && (sandboxEnabled || terminalEnabled)) {
  warnings.push(
    "Docker runtime was not detected locally, while SANDBOX_ENABLED or WORKSPACE_TERMINAL_ENABLED is true. Set both to false until Docker is available (host execution remains disabled).",
  );
}

console.log("=== DevCollab Redacted Environment Check ===");
console.log(`Neon PostgreSQL:          ${dbEnv.exists && errors.filter((e) => e.includes("DATABASE_URL") || e.includes("DIRECT_URL")).length === 0 ? "configured" : "needs attention"}`);
console.log(`Auth.js & Internal JWT:   ${errors.filter((e) => e.includes("SECRET")).length === 0 ? "configured (consistent across web/api/worker)" : "needs attention"}`);
console.log(`Google OAuth Login:       ${googleConfigured ? "configured" : "not configured (optional)"}`);
console.log(`GitHub OAuth Login:       ${githubOauthConfigured ? "configured" : "not configured (optional)"}`);
console.log(`GitHub App Integration:   ${ghAppStatus}`);
console.log(`AI Provider Integration:  ${aiStatus}`);
console.log(
  `Docker / Sandbox / Term:  docker=${dockerReady ? "available" : "unavailable"}, SANDBOX_ENABLED=${sandboxEnabled}, WORKSPACE_TERMINAL_ENABLED=${terminalEnabled}`,
);

if (warnings.length > 0) {
  console.log("\nWarnings:");
  for (const w of warnings) console.log(`  - ${w}`);
}

if (errors.length > 0) {
  console.error("\nErrors:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log("\nEnvironment configuration check passed with zero leaked secrets.");
