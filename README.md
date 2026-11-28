# DevCollab

**Build together. Ship smarter.**

DevCollab is a collaborative software engineering workspace where human developers and AI coding agents plan, build, review, and ship software together inside organization-scoped environments.

---

## Key Features

- **Authentication & Sessions:** Email/password registration and sign-in (`@node-rs/argon2` Argon2id hashing + DB-backed failed-login rate limiting), optional Google and GitHub OAuth via Auth.js v5, encrypted JWT sessions backed by server-side session revocation records on logout, and short-lived HS256 assertions between Web, API, and Worker.
- **Organizations & Fine-Grained RBAC:** Multi-organization workspaces with organization switching, **Owner / Admin / Member** hierarchy, last-Owner protection, ownership transfer, SHA-256 hashed single-use invitations, and separate **Project Manager / Developer** project roles.
- **Project Management, Kanban & Search:** Project key task identifiers (`KEY-001`), drag-and-drop and keyboard-accessible Kanban board, synchronized List view, **My Tasks** cross-project dashboard, task comments with edit/moderation controls, task archiving/restore, and full activity history.
- **GitHub Integration & Internal Code Review:** Per-project GitHub App repository connection (separate from OAuth login), repository sync with cooldown, pull request filtering/search, unified and side-by-side diff viewer, commit-SHA-aware internal review decisions and line threads (never pushed to GitHub), task-to-PR links, and HMAC-SHA256 webhook verification with delivery deduplication.
- **AI Coding Agents & Human Approval Gates:** Auditable `QUEUED -> PLANNING -> AWAITING_APPROVAL -> RUNNING -> AWAITING_REVIEW -> COMPLETED` lifecycle, `.gitignore` and secret-excluding context selection, stale-context plan approval checks, strict unified diff validation, revision history, and per-stage token telemetry.
- **Browser IDE, Local Git & Isolated Terminal:** Multi-tab lazy-loaded Monaco Editor backed by persistent `DevWorkspace` lifecycles, optimistic conflict checks, File Explorer CRUD & search inside strict symlink/path boundaries, local Git stage/unstage/commit/branch controls (without auto-pushing), snapshot checkpoints, and xterm.js terminal strictly gated on hardened Docker availability.
- **Real-Time Collaboration & Repository-Aware AI Assistant:** Private Yjs CRDT collaborative coding sessions (`y-monaco` + Worker `/collab` WebSocket gateway with durable `.bin` snapshots, `OWNER` / `EDITOR` / read-only `VIEWER` roles, live awareness cursors, and instant revocation), plus streaming SSE IDE AI Assistant (`OpenAI` / `Anthropic` / `OpenAI-compatible`) with cancellation, clickable citations, and conflict-checked patch proposals.
- **Engineering Analytics, Pricing & Budgets:** Role-scoped views across **Organization Analytics** (`/app/analytics`, `OWNER`/`ADMIN`), **Project Analytics** (`/app/projects/[projectId]/analytics`), and **Personal Insights** (`/app/tasks?view=insights`), with versioned `AiModelPricing`, advisory weekly/monthly budgets, honest unknown/unpriced states, timezone-aware date filtering, and formula-safe RFC-4180 CSV exports.

---

## Tech Stack & Monorepo Layout

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, Auth.js v5
- **Backend & Worker:** NestJS 11 API (`apps/api`), standalone Node.js Worker + WebSocket server (`apps/worker`)
- **Database:** Neon PostgreSQL with Prisma 7 (`@prisma/adapter-pg`)
- **Tooling:** pnpm `10.32.1` monorepo on Node.js `24+`

| Path | Responsibility |
| --- | --- |
| `apps/web` | Next.js App Router UI, Auth.js session handling, BFF API routes, and marketing site |
| `apps/api` | NestJS REST API, RBAC guards, GitHub App/webhooks, AI/IDE orchestration, and analytics |
| `apps/worker` | AI agent queue processor, local workspace filesystem/Git runtime, Docker terminal, and Yjs `/collab` gateway |
| `packages/ai-core` | AI provider client, context/secret filtering, tar extraction, and unified diff validator |
| `packages/database` | Prisma schema, PostgreSQL adapter, Neon config, and additive migrations |
| `packages/shared` | Shared TypeScript DTO contracts across Web, API, and Worker |
| `docs/` | [Manual Testing Guide](docs/MANUAL_TESTING_GUIDE.md) and [Deployment Checklist](docs/DEPLOYMENT_CHECKLIST.md) |

---

## Prerequisites & Installation

Requires **Node.js `24+`** and **pnpm `10.32+`** (via Corepack or standalone pnpm), plus a Neon PostgreSQL database. Docker is optional and required only for sandboxed test runs and the isolated IDE terminal.

```sh
corepack enable
pnpm install --frozen-lockfile
```

---

## Environment Configuration

Each runtime package loads its own `.env` / `.env.local` file; [`.env.example`](.env.example) documents the complete variable map:

| Package | Template | Target File | Purpose |
| --- | --- | --- | --- |
| Database | [`packages/database/.env.example`](packages/database/.env.example) | `packages/database/.env` | Neon `DIRECT_URL` (migrations) & pooled `DATABASE_URL` |
| Web | [`apps/web/.env.example`](apps/web/.env.example) | `apps/web/.env.local` | `DATABASE_URL`, `AUTH_URL`, `AUTH_TRUST_HOST`, `AUTH_SECRET`, `INTERNAL_AUTH_SECRET`, `API_BASE_URL`, OAuth |
| API | [`apps/api/.env.example`](apps/api/.env.example) | `apps/api/.env` | `PORT=4000`, `DATABASE_URL`, `INTERNAL_AUTH_SECRET`, `CORS_ORIGINS`, Worker URLs, GitHub App, AI provider |
| Worker | [`apps/worker/.env.example`](apps/worker/.env.example) | `apps/worker/.env` | `WORKER_PORT=4100`, `DATABASE_URL`, `INTERNAL_AUTH_SECRET`, workspace dirs, Docker isolation flags, GitHub/AI |

Generate distinct 32+ byte secrets (`AUTH_SECRET`, and a shared matching `INTERNAL_AUTH_SECRET` across Web, API, and Worker):

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Validate configuration cleanly without exposing secret values:

```sh
pnpm env:check
```

---

## Database Setup & Migrations

```sh
pnpm db:validate
pnpm db:check
pnpm db:deploy
```

Use `pnpm db:migrate` only when authoring new schema migrations during development.

---

## Local Development & Worker Execution

Start the Next.js Web app (`:3000`) and NestJS API (`:4000`):

```sh
pnpm dev
```

*(On Windows PowerShell/CMD, use `pnpm.cmd dev`.)*

Start the background Worker service (`:4100` HTTP + `/terminal` + `/collab` WebSockets) in a separate terminal:

```sh
pnpm dev:worker
```

For production verification locally:

```sh
pnpm build
pnpm start
pnpm start:worker
```

---

## GitHub App, AI Provider & OAuth Notes

- **OAuth Login (optional):** Configure `AUTH_GOOGLE_*` and/or `AUTH_GITHUB_*` in `apps/web/.env.local` with callback URLs `http://localhost:3000/api/auth/callback/{google|github}` (or your production domain).
- **GitHub App Integration (optional):** Create a GitHub App with **Read-only** permissions for **Contents**, **Metadata**, and **Pull requests**. Set **Setup URL** to `https://<web-origin>/api/workspace/integrations/github/callback` and subscribe to **Pull request**, **Pull request review**, **Installation**, and **Installation repositories** pointing to `/api/webhooks/github`. Put `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_WEBHOOK_SECRET` into `apps/api/.env` (plus App ID & Private Key in `apps/worker/.env`).
- **AI Provider (optional):** Set `AI_PROVIDER` (`openai`, `anthropic`, or `openai-compatible`), `AI_MODEL`, and `AI_API_KEY` (plus optional `AI_API_BASE_URL` / `AI_PRICE_*`) in both `apps/api/.env` and `apps/worker/.env`.

---

## Security Model Summary

- **Sessions & BFF Boundary:** Auth.js JWT sessions verify server-side revocation rows in PostgreSQL on each request; Next.js BFF routes mint 30–45s HS256 user assertions (`devcollab-web` -> `devcollab-api`) so browsers never talk directly to internal APIs with raw identity headers.
- **Authorization & Tenant Isolation:** Every API endpoint enforces `InternalIdentityGuard`, `OrgAccessGuard`, and `ProjectAccessGuard` against active memberships and project role assignments; write/export routes apply per-user rate limiting; unexpected errors pass through `SafeExceptionFilter` without leaking stack traces or DB URLs.
- **Secrets & Workspace Isolation:** Explorer, Context Builder, and AI Assistant exclude `.env*`, keys/PEMs, credentials, `.gitignore` rules, and symlink escapes, and scrub detected tokens before storage or prompt construction.
- **No Unisolated Host Shell Execution:** Sandbox checks (`SANDBOX_ENABLED`) and IDE terminals (`WORKSPACE_TERMINAL_ENABLED`) run exclusively inside hardened Docker containers (`--network=none`, `--read-only`, `--cap-drop=ALL`). When Docker is unavailable, services refuse host shell fallback cleanly.

---

## Testing & Verification

```sh
pnpm env:check
pnpm db:validate
pnpm db:check
pnpm lint
pnpm typecheck
pnpm --filter @devcollab/worker test
pnpm --filter @devcollab/api test
pnpm build
```

For end-to-end QA flows in the browser, see [`docs/MANUAL_TESTING_GUIDE.md`](docs/MANUAL_TESTING_GUIDE.md).

---

## Production Deployment

- **Frontend (`apps/web`):** Deploy to Vercel with Root Directory `apps/web` (preconfigured via [`apps/web/vercel.json`](apps/web/vercel.json)) and `AUTH_TRUST_HOST=true`.
- **API (`apps/api`):** Deploy to a persistent Node/Docker host (supports `/api/health`, `/api/health/ready`, SSE streams, and webhook raw-body HMAC checks).
- **Worker (`apps/worker`):** Deploy on Docker-capable compute with persistent block storage mounted for `WORKSPACE_ROOT_DIR` and `WORKSPACE_SNAPSHOT_DIR` plus TLS WebSocket upgrades for `/collab` and `/terminal`.
- **Database (`packages/database`):** Managed Neon PostgreSQL (`DATABASE_URL` pooled runtime + `DIRECT_URL` migrations).

Follow the complete production walkthrough in [`docs/DEPLOYMENT_CHECKLIST.md`](docs/DEPLOYMENT_CHECKLIST.md).
