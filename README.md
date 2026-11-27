# DevCollab

**Build together. Ship smarter.**

DevCollab is a collaborative software engineering workspace built for teams working alongside AI coding agents. It unifies organizations, team permissions, project structure, and developer workflows into a single platform.

## Problem & approach

Engineering work often splits across separate tools for access control, task tracking, code review, and AI automation. DevCollab gives each organization an isolated workspace with explicit role-based permissions, scoped projects, and a foundation ready for upcoming repositories, Kanban boards, cloud development environments, and autonomous coding agents.

## Capabilities

### Implemented

- **Authentication & session security:** Password registration and sign-in (Argon2id hashing, PostgreSQL-backed rate limits), optional Google and GitHub OAuth via Auth.js v5, encrypted JWT sessions backed by server-side session revocation records on logout, and short-lived HS256 server-to-server assertions between Next.js and NestJS.
- **Smart navigation & welcome transition:** Automatic `/` → `/app` routing for authenticated users, auth-aware logo links, and a full-screen clickable/keyboard-skippable welcome transition (`/welcome`).
- **Organizations & multi-org workspaces:** Create organizations with unique slugs, belong to multiple organizations, switch active organizations with server-side membership validation, update organization settings, and leave organizations safely.
- **Organization & project RBAC:** Organization-level roles (`OWNER`, `ADMIN`, `MEMBER`) and separate project-level roles (`PROJECT_MANAGER`, `DEVELOPER`) enforced in NestJS guards and services, including last-Owner protection and ownership transfer.
- **Secure invitations:** SHA-256 hashed single-use invitation links with expiration, revocation, email-match verification, and copy-link sharing (automatic email delivery is not configured yet).
- **Projects & dashboards:** Create, view, edit, archive, and restore projects inside organizations; dedicated Organization Dashboard (`OWNER`/`ADMIN`), Project Management Dashboard (`OWNER`/`ADMIN`/`PROJECT_MANAGER`), and Developer Workspace (`MEMBER`).
- **Task management, Kanban boards & collaboration:** Project-scoped task identifiers (`KEY-001`), Kanban board (drag-and-drop plus accessible status controls) and synchronized list view, search/filter/sort, **My Tasks** cross-project view, task archiving/restoring, task comments (author edit and manager moderation), and persistent task activity history.
- **GitHub integration, pull requests & code review workspace:** Dedicated GitHub App repository connection per project (separate from Auth.js GitHub OAuth login), repository overview, synced pull requests with filtering/search/pagination, unified & side-by-side diff viewer (with binary/large/truncated patch handling), internal DevCollab review decisions & threaded file/line discussions (commit-SHA version-aware, never posted to GitHub), task-to-PR linking, manual sync with cooldown, and HMAC-SHA256 verified GitHub webhooks with delivery deduplication.
- **Workspace theming:** Dark (default) and warm off-white themes inside `/app` with cookie persistence; public marketing and auth pages remain dark.

### Planned (upcoming milestones)

- Browser IDE, cloud dev containers, and integrated terminal
- Autonomous AI coding agents, patch review workflows, and AI cost tracking
- Automated invitation and verification email delivery

*Note: The public homepage and `/how-it-works` demos illustrate these planned workflows with local sample data.*

## Technology stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, shadcn/ui primitives, Lucide icons, Auth.js v5
- **Backend:** NestJS 11, TypeScript, `jose`
- **Database:** PostgreSQL (Neon), Prisma 7 (`@prisma/adapter-pg`)
- **Workspace:** pnpm monorepo

## Repository structure

| Package / App | Responsibility |
| --- | --- |
| `apps/web` | Next.js App Router frontend, Auth.js session handling, BFF server actions, marketing pages, and `/app` workspace UI |
| `apps/api` | NestJS REST API, authorization guards/policies, organization, membership, invitation, project, task, and GitHub integration/review modules |
| `packages/database` | Prisma schema, PostgreSQL driver adapter, Neon configuration, and additive migrations |
| `packages/shared` | Shared TypeScript DTO contracts across web and API |

## Environment variables

See [`.env.example`](.env.example) for exact placement. Do not commit secrets.

- **Database (`packages/database/.env`):** `DIRECT_URL`, `DATABASE_URL`
- **Web (`apps/web/.env.local`):** `DATABASE_URL`, `AUTH_URL`, `AUTH_SECRET`, `INTERNAL_AUTH_SECRET`, `API_BASE_URL`, optional `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`
- **API (`apps/api/.env`):** `DATABASE_URL`, `INTERNAL_AUTH_SECRET`, `PORT` (default `4000`), `CORS_ORIGINS`, plus server-only GitHub App credentials: `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET` (optional `GITHUB_API_BASE_URL`)

## GitHub App integration setup

To enable live repository connection and pull request synchronization:

1. Create a GitHub App on GitHub with **Read-only** Repository permissions for **Metadata** and **Pull requests** (Contents read is optional; write permissions are not required).
2. Set the GitHub App **Setup URL** to `https://<your-web-origin>/api/workspace/integrations/github/callback` (locally: `http://localhost:3000/api/workspace/integrations/github/callback`).
3. Subscribe to webhook events: **Pull request**, **Pull request review**, **Installation**, and **Installation repositories**. Set the **Webhook URL** to your publicly reachable HTTPS endpoint forwarding to `/api/webhooks/github` (or `/api/integrations/github/webhooks` on the API server). Note: GitHub cannot reach `http://localhost` directly without a forwarding tunnel such as ngrok or Cloudflare Tunnel; use **Sync now** for manual synchronization locally.
4. Set `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY` (with `\n` line escapes if single-line), and `GITHUB_WEBHOOK_SECRET` in `apps/api/.env`.

## Local setup & commands

Requires Node.js 24+ and pnpm 10.32+.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm db:validate
pnpm db:check
pnpm db:deploy
pnpm dev
```

On Windows, run `pnpm.cmd dev` with ports `3000` (Next.js with Webpack) and `4000` (NestJS) available.

### Verification commands

```sh
pnpm lint
pnpm typecheck
pnpm db:validate
pnpm build
pnpm --filter @devcollab/api test
pnpm start
```

With local dev servers running, `node --test apps/web/test/dev-auth.test.mjs` verifies API connectivity, route protection, and pre-hydration auth form validation.
