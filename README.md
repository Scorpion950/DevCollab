# DevCollab

**Build together. Ship smarter.**

DevCollab is an engineering workspace in development for teams that assign software tasks to people and AI agents. Brick 1 delivers the marketing site, a shared visual system, a REST health endpoint, and a database package prepared for Neon. Atlas API and Relay Console are illustrative projects. Selecting one changes its sample tasks, activity, and code review.

## Repository

```text
apps/
  web/                 Next.js App Router, React, strict TypeScript
    app/               Landing page, theme, fonts, development diagnostic
    components/        Navigation, assembly illustration, workspace preview, UI
    lib/server/        Server-only API client and repository URL configuration
    public/art/        Optimized hero illustration
  api/                 NestJS REST service
    src/config/        Environment parsing and validation
    src/health/        Health module, controller, and service
packages/
  database/            Prisma 7, PostgreSQL driver adapter, migration configuration
    prisma/            PostgreSQL schema
    src/               Lazy client and read-only connection check
  shared/src/          Shared TypeScript contracts
.env.example           Settings grouped by destination
package.json           Workspace commands and pinned package manager
pnpm-workspace.yaml    Workspace membership and dependency build permissions
pnpm-lock.yaml         Reproducible dependency versions
tsconfig.base.json     Shared strict TypeScript options
```

## Run locally

Use Node.js 24 LTS and pnpm 10.32.1. Corepack can select the pinned pnpm version from the root manifest. Run these commands at the workspace root.

```sh
corepack enable
pnpm install --frozen-lockfile
```

For the development connectivity diagnostic, create `apps/web/.env.local` with the following setting.

```dotenv
API_BASE_URL=http://localhost:4000/api
```

Start both applications with one command.

```sh
pnpm dev
```

Alternatively, use separate terminals for `pnpm dev:web` and `pnpm dev:api`. Open the [landing page](http://localhost:3000), [API health endpoint](http://localhost:4000/api/health), or [development diagnostic](http://localhost:3000/dev/health).

The health endpoint returns HTTP 200 with `{"status":"ok","service":"devcollab-api"}`. It checks API liveness. The diagnostic requests this endpoint from the Next.js server and reports configuration, response, or connection errors. Stop the API and use **Check again** to see the offline state. The landing page builds and runs independently.

## Environment

Use [.env.example](.env.example) as the reference. Keep each setting with its owning application. Restart the affected development process after editing an environment file.

| File | Variable | Use |
| --- | --- | --- |
| `apps/api/.env` | `PORT` | Optional listening port, default `4000`. |
| `apps/api/.env` | `CORS_ORIGINS` | Comma-separated, exact HTTP(S) origins. Development defaults to `http://localhost:3000`. Production defaults to an empty allowlist. |
| `apps/web/.env.local` | `API_BASE_URL` | Server-only API base including `/api`. Needed for the development diagnostic. |
| `apps/web/.env.local` | `GITHUB_REPOSITORY_URL` | Optional real GitHub repository URL. A configured repository appears in navigation after rebuild. |
| `packages/database/.env` | `DATABASE_URL` | Pooled Neon PostgreSQL URL for runtime queries and the live check. |
| `packages/database/.env` | `DIRECT_URL` | Direct Neon PostgreSQL URL for migration commands. |

The API validates the port and origin list at startup. Nest supplies standard JSON errors for missing routes and unexpected exceptions. The Next.js diagnostic returns 404 in production. No browser-exposed environment variables are required.

## Database and migrations

1. Create or select the intended Neon project, branch, database, and role. Open **Connect**.
2. Copy the pooled connection string into `DATABASE_URL` in `packages/database/.env`. Keep Neon’s supplied TLS options.
3. Turn off connection pooling in the connection dialog. Copy that branch’s direct connection string into `DIRECT_URL`.
4. Run `pnpm db:check` to execute `SELECT 1`. The command reports success only after the query completes and exits nonzero on failure.

The Prisma configuration reads the direct URL for CLI operations. The runtime package uses Prisma’s PostgreSQL driver adapter with the pooled URL. Its client initializes on first use and survives development hot reloads. Server processes can import `getDatabase` from the built `@devcollab/database` package after adding it as a workspace dependency. Keep database credentials on the server. [Prisma PostgreSQL and Neon guide](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql)

`pnpm db:validate` and `pnpm db:generate` run without database credentials. The schema contains a PostgreSQL datasource and a generator. Once domain models are approved, edit `packages/database/prisma/schema.prisma`, run `pnpm db:migrate --name <migration-name>` against a development branch with shadow database privileges, and review and commit the generated migration. Use `pnpm db:deploy` to apply committed migrations in a deployed environment. Brick 1 ships with zero domain migrations.

## Checks and production builds

```sh
pnpm lint
pnpm typecheck
pnpm db:validate
pnpm build
pnpm start
```

The root build generates and compiles the database client, builds the NestJS service, and produces the Next.js production build. The landing page is prerendered. Use `pnpm --filter @devcollab/web build` for a frontend-only build. `pnpm start` serves the built frontend and API together locally.

## Design system

The web app uses Tailwind CSS 4, a customized shadcn/ui Button with Radix Slot, and Lucide icons. Semantic tokens in `apps/web/app/globals.css` define surfaces, text, accents, borders, focus, and control states. Light tokens live on `:root` and the dark marketing theme is selected by the root layout. Form fields, panels, empty states, and loading skeletons share these tokens.

Space Grotesk sets headings, DM Sans sets interface copy, and IBM Plex Mono sets technical metadata. Font files ship with the application. Navigation, project selection, and section links support keyboard use, with visible focus and reduced-motion styles.

## Vercel frontend

1. Put the workspace in your own Git repository, including the lockfile, and import that repository into Vercel.
2. Select **Next.js** and set the project root to `apps/web`. Enable **Include source files outside of the Root Directory in the Build Step** for shared packages and workspace configuration. [Vercel monorepo settings](https://vercel.com/docs/monorepos/monorepo-faq)
3. Choose Node.js 24.x and pnpm. Use Corepack with the repository’s `packageManager` pin. Keep the framework’s build and output defaults. [Vercel package managers](https://vercel.com/docs/package-managers)
4. Optionally set `GITHUB_REPOSITORY_URL` before building, then deploy. The landing page needs no backend URL, database secrets, or OAuth credentials.

Run the NestJS application locally for Brick 1. A later API deployment will use its own service, environment, and CORS allowlist.

## Scope and next milestone

Brick 1 contains sample project views and a real health API. Authentication, organization management, project and task CRUD, Kanban, GitHub integration, agent execution, LLM calls, browser IDEs, terminals, real-time collaboration, queues, Docker execution, and analytics are deferred.

Brick 2 is planned for Auth.js with email/password, Google, and GitHub sign-in. It also requires an agreed identity model and a verification contract between Next.js and NestJS. Implementation awaits review of Brick 1.
