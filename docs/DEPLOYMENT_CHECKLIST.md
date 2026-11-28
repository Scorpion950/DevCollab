# DevCollab — Production Deployment Checklist

DevCollab is a monorepo with three runtime services (`@devcollab/web`, `@devcollab/api`, `@devcollab/worker`) and a shared Neon PostgreSQL schema (`@devcollab/database`). Do not attempt to run the long-lived NestJS API, background worker, local Git disk runtime, Docker containers, or persistent `/collab` WebSockets inside serverless Vercel Functions.

---

## 1. Frontend — Vercel (`apps/web`)

1. **Import Repository on Vercel:**
   - **Root Directory:** `apps/web`
   - **Framework Preset:** Next.js (`apps/web/vercel.json` is preconfigured)
   - **Node.js Version:** `24.x`
2. **Required Vercel Environment Variables:**
   - `DATABASE_URL` — Neon **pooled** connection string (`-pooler...sslmode=require`)
   - `AUTH_URL` — Canonical HTTPS origin (e.g. `https://app.example.com`)
   - `AUTH_TRUST_HOST` — Set `true` (automatically trusted when `VERCEL=1`, explicit is clearest)
   - `AUTH_SECRET` — Strong 32+ char random string (`crypto.randomBytes(32).toString('base64')`)
   - `INTERNAL_AUTH_SECRET` — Identical 32+ char secret shared with `@devcollab/api` and `@devcollab/worker`
   - `API_BASE_URL` — Public/private HTTPS URL to the deployed NestJS API ending in `/api` (e.g. `https://api.example.com/api`)
   - Optional OAuth: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`
   - Optional footer link: `GITHUB_REPOSITORY_URL`
3. **Post-deploy Check:** Verify security response headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`), marketing routes, and `/api/auth/providers`.

---

## 2. Backend API — NestJS Container Host (`apps/api`)

Deploy `@devcollab/api` on a managed Node/Docker container service supporting persistent outbound connections, SSE streaming (`30s+` response timeouts disabled/extended), and Express rawBody webhook verification (e.g., Railway, Render, Fly.io, Google Cloud Run with min-instances/long timeouts, or ECS).

1. **Build & Start Commands (from repo root):**
   ```sh
   pnpm install --frozen-lockfile
   pnpm --filter @devcollab/database build
   pnpm --filter @devcollab/ai-core build
   pnpm --filter @devcollab/api build
   node apps/api/dist/main.js
   ```
   *(Or run `pnpm --filter @devcollab/api start` inside `apps/api`.)*
2. **Required Environment Variables:**
   - `NODE_ENV=production`
   - `PORT=4000` (or platform-injected `PORT`)
   - `DATABASE_URL` — Neon **pooled** URL
   - `INTERNAL_AUTH_SECRET` — Must exactly match web & worker
   - `CORS_ORIGINS` — Exact comma-separated web origin(s), e.g. `https://app.example.com`
   - `WORKER_URL` — Private/HTTPS base URL of `@devcollab/worker` (e.g. `https://worker.internal:4100`)
   - `WORKER_TERMINAL_PUBLIC_URL` — Public `wss://` or `https://` URL of `@devcollab/worker` (browser derives `/terminal` & `/collab` WebSockets from this)
   - Optional Integrations: `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_API_BASE_URL`, `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`, `AI_API_BASE_URL`, `AI_PRICE_*`, `SANDBOX_ENABLED`, `WORKSPACE_TTL_HOURS`
3. **Health Probes:**
   - Liveness: `GET /api/health` -> `200 { "status": "ok" }`
   - Readiness: `GET /api/health/ready` -> `200 { "status": "ready", "database": "ok" }` (`503` if DB unreachable)

---

## 3. Database — Neon PostgreSQL (`packages/database`)

1. Use **two distinct connection strings** from Neon:
   - `DATABASE_URL`: `-pooler` hostname with `?sslmode=require` (used at runtime by `web`, `api`, and `worker`).
   - `DIRECT_URL`: direct non-pooler hostname with `?sslmode=require` (used strictly for Prisma schema push/migrations).
2. Run migrations strictly from CI/CD or controlled release step (never via automatic server boot on web):
   ```sh
   pnpm --filter @devcollab/database migrate:deploy
   ```
3. Verify schema drift cleanly before cutover:
   ```sh
   pnpm db:validate
   pnpm db:check
   ```

---

## 4. Auth.js & OAuth Callbacks

1. Update **Google Cloud OAuth Consent / Credentials**:
   - Authorized JavaScript origin: `https://app.example.com`
   - Authorized redirect URI: `https://app.example.com/api/auth/callback/google`
2. Update **GitHub OAuth App** (used strictly for user login — separate from the GitHub App integration):
   - Homepage URL: `https://app.example.com`
   - Authorization callback URL: `https://app.example.com/api/auth/callback/github`
3. Rotate `AUTH_SECRET` and `INTERNAL_AUTH_SECRET` prior to going live if any secrets existed during staging.

---

## 5. GitHub App Integration & Webhooks

1. In GitHub App settings -> **Permissions & events**:
   - Repository permissions: **Contents (Read-only)**, **Metadata (Read-only)**, **Pull requests (Read-only)**
   - Events: `Pull request`, `Pull request review`, `Installation`, `Installation repositories`
2. Set **Setup URL (optional)** to:
   `https://app.example.com/api/workspace/integrations/github/callback`
3. Set **Webhook URL** to:
   `https://app.example.com/api/webhooks/github` (or directly `https://api.example.com/api/integrations/github/webhooks`)
   with a strong `GITHUB_WEBHOOK_SECRET` matching `apps/api/.env`.
4. Confirm raw JSON signature verification (`x-hub-signature-256`) passes in GitHub App **Recent Deliveries**.

---

## 6. AI Execution Worker, Isolated Sandboxes & Persistent Storage (`apps/worker`)

Deploy `@devcollab/worker` on a dedicated VM, bare-metal host, or Docker-capable compute node (NOT a stateless ephemeral container if retaining un-snapshotted IDE workspace directories).

1. **Build & Start:**
   ```sh
   pnpm --filter @devcollab/worker build
   node apps/worker/dist/main.js
   ```
2. **Storage Configuration:**
   - Mount a persistent block volume and point both:
     - `WORKSPACE_ROOT_DIR=/var/lib/devcollab/workspaces`
     - `WORKSPACE_SNAPSHOT_DIR=/var/lib/devcollab/snapshots`
     - `WORKSPACE_STORAGE_MODE=DURABLE`
3. **Sandbox / Terminal Isolation:**
   - Install rootless or hardened Docker Engine on the worker host and pre-pull `SANDBOX_IMAGE` (e.g., `node:24-bookworm-slim` or language runtime image).
   - Enable `SANDBOX_ENABLED=true` and `WORKSPACE_TERMINAL_ENABLED=true` only after verifying Docker (`docker info`) works cleanly; DevCollab deliberately refuses host-shell execution fallbacks when Docker is unavailable.
   - Set `WORKER_ALLOWED_ORIGINS=https://app.example.com`.

---

## 7. Real-Time Collaboration (`/collab`) WebSockets

1. Because `@devcollab/worker` serves both `/terminal` and `/collab` WebSockets on `WORKER_PORT` (`4100`), terminate TLS in front of the worker (`wss://worker.example.com`) with:
   - WebSocket upgrade support enabled (`Upgrade` / `Connection: upgrade`)
   - Long idle timeout (`>= 300s`, as Yjs clients send periodic pings)
   - Single-instance sticky routing per active workspace directory (so in-memory Yjs rooms, `.bin` durability snapshots, and Git disk writes remain consistent against the attached `WORKSPACE_ROOT_DIR` & `WORKSPACE_SNAPSHOT_DIR`).
2. Confirm `WORKER_TERMINAL_PUBLIC_URL=https://worker.example.com` in `apps/api/.env` so minted workspace/collab WebSocket tickets advertise `wss://worker.example.com/collab` and `wss://worker.example.com/terminal`.
