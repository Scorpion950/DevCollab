# DevCollab

**Build together. Ship smarter.**

DevCollab is a collaborative engineering workspace. The public website illustrates planned project and agent workflows with local sample data. Brick 2 implements persistent accounts, password and OAuth authentication, an authenticated profile API and a minimal workspace entry.

## Repository

| Package | Responsibility |
| --- | --- |
| `apps/web` | Next.js App Router, Auth.js v5, TypeScript, Tailwind, shadcn/ui primitives, Lucide icons, marketing and account screens |
| `apps/api` | NestJS REST service with validated configuration, health and protected profile endpoints |
| `packages/database` | Prisma 7, PostgreSQL driver adapter, Neon connection configuration and migrations |
| `packages/shared` | Shared TypeScript contracts |

## Start locally

Install Node.js 24 LTS and pnpm 10.32.1. From the repository root:

```sh
corepack enable
pnpm install --frozen-lockfile
```

Configure the environments below and run the following commands. Schema validation and the public website work without database credentials.

```sh
pnpm db:validate
pnpm db:check
pnpm db:deploy
pnpm dev
```

Open the [homepage](http://localhost:3000), [registration](http://localhost:3000/auth/sign-up), or [sign-in](http://localhost:3000/auth/sign-in). Use `pnpm dev:web` and `pnpm dev:api` to run the processes individually. Root development commands prepare the generated database client before launching.

On Windows, run `pnpm.cmd dev` with ports 3000 and 4000 free. This starts Next.js with Webpack and NestJS together. Signup and sign-in use the database from Next.js. Both the welcome screen and the workspace also need the NestJS profile endpoint. Check [API health](http://localhost:4000/api/health) and the [frontend connectivity diagnostic](http://localhost:3000/dev/health) when troubleshooting startup.

Development uses Webpack. The reported `Map maximum size exceeded` in `AsyncHook.init` also occurred under Webpack when React retried a native form postback. The sign-in and signup forms now pass stable server actions to `useActionState` so React can match the posted form state. The production build still uses the default bundler.

With both services running, use `node --test apps/web/test/dev-auth.test.mjs` to check frontend-to-API connectivity, anonymous route protection, and form submissions before hydration.

## Server-only configuration

Use [.env.example](.env.example) for variable names. Restart the affected services after editing environment files.

| Location | Settings |
| --- | --- |
| `packages/database/.env` | `DATABASE_URL` for the pooled Neon connection and `DIRECT_URL` for migrations |
| `apps/web/.env.local` | `DATABASE_URL`, `AUTH_URL` (locally `http://localhost:3000`), `AUTH_SECRET`, `INTERNAL_AUTH_SECRET`, `API_BASE_URL` (locally `http://localhost:4000/api`) |
| `apps/api/.env` | Same pooled `DATABASE_URL` and `INTERNAL_AUTH_SECRET` as web. Optional `PORT` defaults to 4000. `CORS_ORIGINS` accepts comma-separated exact origins and defaults to localhost:3000 in development and an empty list in production. |
| Optional web settings | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `GITHUB_REPOSITORY_URL` |

Generate **two independent random secrets**, each with at least 32 random bytes, using a password manager or secure random generator. Keep `AUTH_SECRET` with the frontend server. Copy the separate internal assertion secret to both servers. Store production values in the hosting environment’s secret manager. These settings must remain server-only.

### Neon

Open **Connect** on the intended Neon development branch, select the database and role, and copy the pooled URL into each runtime environment. Disable pooling in the connection dialog to obtain the direct URL for Prisma CLI. Keep the TLS options Neon supplies. [Prisma PostgreSQL and Neon guide](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql)

`pnpm db:check` executes a real read-only query. `pnpm db:deploy` applies the committed additive migration for User, Account, Session, VerificationToken and AuthAttempt. Inspect the target schema for conflicting names before applying. For future schema changes use `pnpm db:migrate --name <name>` on a development branch with shadow database privileges and review the generated SQL.

### OAuth providers

- **Google.** Configure the Google Cloud consent screen, test audience and a Web application OAuth client. Register `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI. Set the Google ID and secret in the web environment. [Auth.js Google setup](https://authjs.dev/getting-started/providers/google)
- **GitHub.** Under Developer settings → OAuth Apps, create an app with the frontend origin as its homepage and `http://localhost:3000/api/auth/callback/github` as its authorization callback. Set the GitHub ID and secret in the web environment. Use a separate OAuth app for production. [Auth.js GitHub setup](https://authjs.dev/getting-started/providers/github)

Use the canonical HTTPS frontend origin for deployed callback URLs and `AUTH_URL`. Each provider is enabled only when its credential pair and base authentication settings are present. Matching email alone does not link accounts. Auth.js persists provider identity mappings; DevCollab discards access and refresh tokens at linking. GitHub sign-in requests identity access only. [Auth.js Prisma adapter](https://authjs.dev/getting-started/adapters/prisma)

## Identity and access

Registration normalizes email, checks the name and matching 12–128 character passwords, hashes with Argon2id, then signs in through Auth.js Credentials. Unique database constraints arbitrate concurrent registrations. Email verification remains pending, and no verification email is sent.

Auth.js manages encrypted JWT session cookies with an eight-hour lifetime. While the workspace is open, Auth.js rechecks the session on focus and every five minutes online so a valid session can roll forward. Logout clears the browser session. Immediate revocation of a previously copied JWT requires an additional revocation mechanism. The repository pins the Auth.js v5 beta release used for these flows.

Credential verification and registration have atomic PostgreSQL rate counters shared across instances. Per email, the ten-minute limits are twelve credential attempts and five registration attempts. Each operation also has an aggregate ceiling to bound distributed attempts against new addresses. Expired counters are reclaimed on traffic. Monitor these limits and add infrastructure-level abuse controls before a public rollout.

Next.js reads the server session and signs a 30-second internal assertion. NestJS independently checks the HS256 signature, issuer, audience, expiry, age and subject before querying the current database profile. Use HTTPS for server-to-server traffic outside localhost.

| Route | Behavior |
| --- | --- |
| `GET /api/health` on NestJS | Public service liveness |
| `GET /api/users/me` on NestJS | Requires a valid service assertion. Returns only ID, name, email and image. |
| `/dev/health` on Next.js | Development-only API connectivity diagnostic |
| `/welcome` | Protected personalized transition with skip, reduced motion and a per-login marker for the current tab |
| `/app` | Protected workspace, profile menu, theme selection and logout |

## Design and interaction

Space Grotesk, DM Sans and IBM Plex Mono ship locally. The public pages use a carbon background, citron actions, clay details and visible keyboard focus. Inputs, buttons, cards and panels use semantic geometry tokens. Motion respects the operating system’s reduced-motion preference.

The workspace account menu switches between dark and warm off-white themes. A non-sensitive preference cookie scoped to `/app` gives the server the correct initial theme. Keep workspace overlays inside the provider so they inherit its semantic tokens.

## Checks and deployment

```sh
pnpm lint
pnpm typecheck
pnpm db:validate
pnpm build
pnpm --filter @devcollab/api test
pnpm start
```

For Vercel, select Next.js, use `apps/web` as the root, include source files outside the root, and set the build command to `pnpm --filter @devcollab/web... build`. Use Node 24 and the pinned pnpm version. Deploy NestJS separately with the runtime settings above. Set the web service’s API base to the reachable HTTPS NestJS origin including `/api`. Apply migrations as a separate release step. [Vercel monorepo configuration](https://vercel.com/docs/monorepos/monorepo-faq)

## Remaining milestones

Complete provider callback, returning-user, and account-conflict checks against your configured Google and GitHub applications. Email ownership verification, password recovery, abuse monitoring and operational session revocation are production-readiness work. Organization setup and project permissions are planned. The workspace shows real profile data and an empty state.

Future agents should work from scoped tasks, expose progress, errors and retries, and leave stop, review and approval decisions with developers. The public site’s agent execution is illustrative.
