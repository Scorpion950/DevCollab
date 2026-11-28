# DevCollab — Manual Testing Guide

This step-by-step guide walks you through testing every major DevCollab workflow end to end in a real browser. Follow steps **in order** because later tests reuse the organization, project, and tasks created in earlier sections.

> [!NOTE]
> Features marked **[Requires External Config]** depend on optional credentials or runtime services (`GITHUB_APP_*`, `AI_API_KEY`, `AUTH_GOOGLE_*` / `AUTH_GITHUB_*`, or Docker). When those are not configured locally, DevCollab displays an explicit status notice instead of failing unexpectedly — verify those graceful notices as part of testing.

---

## Before You Begin

1. Confirm environment files exist and pass validation (without printing secrets):
   ```sh
   pnpm env:check
   ```
2. Verify database connectivity and migrations:
   ```sh
   pnpm db:check
   ```
3. Start the web and API servers:
   ```sh
   pnpm dev
   ```
4. In a second terminal, start the background worker service (required for AI agent execution, Browser IDE workspaces, and real-time Yjs collaboration):
   ```sh
   pnpm dev:worker
   ```
5. Confirm all three services respond:
   - Web app: `http://localhost:3000`
   - API health: `http://localhost:4000/api/health` and readiness `http://localhost:4000/api/health/ready`
   - Worker health: `http://127.0.0.1:4100/health`

**Suggested disposable test accounts** (use two different browsers or one regular + one incognito window when testing multi-user permissions and collaboration):
- **Owner:** `owner-qa@example.com` / `DevCollabQa#2026`
- **Developer (2nd user):** `dev-qa@example.com` / `DevCollabQa#2026`

---

## 1. Marketing Pages & Navigation

- **Starting URL:** `http://localhost:3000`
- **Steps:**
  1. Sign out if already authenticated.
  2. Visit `http://localhost:3000`.
  3. Click through the simulated platform console tabs (`Tasks`, `Code Review`, `Agent Run`, `Workspace`).
  4. Click **How it works** (`http://localhost:3000/how-it-works`) and step through stages `01`–`05` and open FAQ items.
  5. Test keyboard navigation (`Tab` / `Shift+Tab`) and verify mobile layout around `375px` width.
- **Expected Result:** Dark Obsidian aesthetic renders cleanly without horizontal scrolling; marketing copy reflects implemented workflows; clicking **Sign in** or **Get started** routes to `/auth/sign-in` or `/auth/sign-up`.
- **If it fails:** Capture browser DevTools Console errors, viewport width, and URL.

---

## 2. Sign-Up, Sign-In & Welcome Animation

- **Starting URL:** `http://localhost:3000/auth/sign-up`
- **Steps:**
  1. Register **Owner** (`owner-qa@example.com`, name `QA Owner`, password `DevCollabQa#2026`).
  2. Observe the full-screen `/welcome` greeting animation (or click **Skip** / press `Enter` or `Space`).
  3. Repeat password mismatch validation on `/auth/sign-up` and wrong password validation on `/auth/sign-in` (note PostgreSQL-backed rate limit protection on repeated failed attempts).
  4. Use the account menu in `/app` -> **Sign out**, then verify visiting `http://localhost:3000/app` redirects back to `/auth/sign-in`.
  5. **[Requires External Config]** If `AUTH_GOOGLE_*` or `AUTH_GITHUB_*` is set, verify OAuth buttons appear on `/auth/sign-in` and redirect to the provider consent page.
- **Expected Result:** Valid registration logs in, plays/skips `/welcome`, and lands on `/app`; signing out revokes the session immediately.
- **If it fails:** Check `apps/web/.env.local` (`AUTH_SECRET`, `AUTH_URL`, `DATABASE_URL`) and inspect `/auth/sign-in` error banner + browser Network tab.

---

## 3. Organizations, Roles & Team Invitations

- **Starting URL:** `http://localhost:3000/app`
- **Steps:**
  1. Create an organization named `Acme Engineering` with slug `acme-qa` (`POST` via first-time onboarding form).
  2. Open **Members** (`/app/members`) and **Invitations** (`/app/invitations`).
  3. Invite `dev-qa@example.com` as role `MEMBER`. Copy the generated single-use invitation link.
  4. In an **Incognito** window, register/sign in as `dev-qa@example.com`, paste the invitation URL, accept the invitation, and switch active organization to `Acme Engineering`.
  5. Back in the Owner window, visit **Settings** (`/app/settings`), update the organization description, and inspect `/app/analytics` as Owner (`200`) vs Developer (`Restricted` notice).
- **Expected Result:** Owner lands on Organization Dashboard; Developer sees scoped Developer Workspace; `MEMBER` cannot access `/app/members`, `/app/settings`, or `/app/analytics`.
- **If it fails:** Check API terminal logs (`X-Request-Id`), verify `INTERNAL_AUTH_SECRET` matches between `apps/web/.env.local` and `apps/api/.env`.

---

## 4. Projects & Role Assignments

- **Starting URL:** `http://localhost:3000/app/projects`
- **Steps:**
  1. As **Owner**, click **New project**, enter name `Core API`, key `CORE`, and optionally assign `QA Developer`.
  2. Open the project (`CORE`), click **Management** tab (`/app/projects/[projectId]/manage`), verify assigning `DEVELOPER` vs `PROJECT_MANAGER` roles and toggling **Allow Developer AI Runs**.
  3. In the **Developer** incognito window, confirm opening `/app/projects/[projectId]` works while `/app/projects/[projectId]/manage` shows **Project management restricted**.
  4. Test archiving and restoring a disposable second project from Project Management.
- **Expected Result:** Project key (`CORE`) is unique inside the org; role assignments enforce immediate access changes across tabs.
- **If it fails:** Capture HTTP status on `/api/workspace/projects/...` and NestJS logs.

---

## 5. Task Management, Kanban Board & Search

- **Starting URL:** `http://localhost:3000/app/projects/[projectId]/tasks`
- **Steps:**
  1. Create 3 tasks (e.g., `Add rate limiter middleware` [`HIGH`, assigned to `QA Developer`], `Write onboarding guide` [`MEDIUM`], `Review webhook signatures` [`URGENT`]). Notice auto-generated keys `CORE-001`, `CORE-002`, `CORE-003`.
  2. Drag `CORE-001` from **Todo** to **In Progress**. Also change `CORE-002` status via the card's accessible **Move** `<select>` dropdown (`Keyboard: Tab -> Enter/Arrow keys`).
  3. Switch to **List** view (`?view=list`), filter by `Priority`, `Mine`, and search `webhook`.
  4. Open `CORE-001` detail drawer: add a comment, edit it, inspect the activity timeline, test **Archive**, verify it moves to archived filter, and **Restore** it.
  5. Open global **My Tasks** (`/app/tasks`) in the Developer window to confirm assigned tasks appear across projects.
- **Expected Result:** Status transitions persist across reloads, Kanban & List synchronize, activity entries record actor and timestamps cleanly.
- **If it fails:** Check browser Console/Network PATCH responses on `/api/workspace/projects/[projectId]/tasks/[taskId]`.

---

## 6. GitHub Repository Connection & Pull Requests **[Requires External Config]**

- **Starting URL:** `http://localhost:3000/app/projects/[projectId]/repository`
- **Steps (when GitHub App is NOT configured):**
  1. Verify the page renders cleanly without crashing and displays an explicit GitHub App unconfigured notice.
- **Steps (when GitHub App IS configured in `apps/api/.env` + `apps/worker/.env`):**
  1. As Owner/PM, click **Connect GitHub App**, complete installation on a test repository, return to DevCollab callback (`/api/workspace/integrations/github/callback`), select a repository, and click **Connect**.
  2. Click **Sync pull requests**, then open **Pull Requests** (`/app/projects/[projectId]/pull-requests`).
  3. Filter by `OPEN` / `CLOSED` / `MERGED` and search PR titles.
  4. Link `CORE-001` to a pull request and confirm the PR link appears inside task `CORE-001`.
- **Expected Result:** Connected repository metadata and PR list populate cleanly; manual sync respects the 15s cooldown banner.
- **If it fails:** Check `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, formatted `GITHUB_APP_PRIVATE_KEY`, and API logs.

---

## 7. Pull Request Diff Viewer & Internal Code Reviews **[Requires External Config for live PRs]**

- **Starting URL:** `http://localhost:3000/app/projects/[projectId]/pull-requests/[prNumber]`
- **Steps:**
  1. Toggle between **Unified** and **Split** diff modes, filter changed files, and expand any collapsed large/binary notice.
  2. Click `+` beside a diff line to attach an internal review comment, submit it, mark it **Resolved** / **Reopen**, and edit/delete your comment.
  3. Submit an internal review decision (`APPROVE` or `REQUEST_CHANGES`). Confirm it stays inside DevCollab and does NOT post to GitHub.
- **Expected Result:** Comments anchor to exact file, side, line number, and commit SHA; internal decisions update badge state immediately.
- **If it fails:** Capture the failing API status on `/internal-review` or `/comments` and screenshot the diff panel.

---

## 8. AI Coding Agents (Plan, Approval & Proposals) **[Requires External Config]**

- **Starting URL:** `http://localhost:3000/app/projects/[projectId]/tasks/[taskId]/agent` (or `/app/projects/[projectId]/ai`)
- **Steps (when AI or GitHub is unconfigured):**
  1. Verify preflight diagnostics clearly list missing blockers (`AI provider`, `GitHub repository`, or `Developer AI permission`) and disable run launch cleanly.
- **Steps (when AI + GitHub + Worker are configured):**
  1. Trigger an AI run for `CORE-001`.
  2. Watch status move `QUEUED` -> `PLANNING` -> `AWAITING_APPROVAL`.
  3. Review the generated plan and click **Approve Plan** (or test **Reject / Revise Plan**).
  4. Wait for the worker to move through `RUNNING` -> `AWAITING_REVIEW`.
  5. Inspect the generated unified diff proposal, verify sandbox test check status (`PASSED`, `FAILED`, or `UNAVAILABLE` if Docker is disabled), and click **Accept** or **Reject**.
- **Expected Result:** Worker claims job atomically; secret/untracked `.env` files are excluded from context; proposals render with token/cost telemetry.
- **If it fails:** Check `pnpm dev:worker` stdout, `AI_PROVIDER` / `AI_MODEL` / `AI_API_KEY`, and `AgentRun` events panel.

---

## 9. Browser IDE, File Explorer, Local Git & Snapshots **[Requires GitHub App + Worker]**

- **Starting URL:** `http://localhost:3000/app/projects/[projectId]/ide`
- **Steps:**
  1. Ensure `pnpm dev:worker` is running (`Worker Reachable` badge shows green).
  2. Click **Create Workspace**, name it `feature-ide-qa`, choose default branch, and open it.
  3. Expand folders in the File Explorer, open a source file in Monaco Editor, make a small edit, and press **Save** (`Ctrl+S`). Verify optimistic conflict handling if stale content hash is tested.
  4. Create a test file (`notes-qa.txt`), search across files in the Explorer search bar, rename it, then delete the scratch file.
  5. Open **Source Control**, stage changes, enter a commit message, and click **Commit** (local workspace Git only — never auto-pushes to GitHub). Test switching/creating a local branch.
  6. Click **Create Snapshot** checkpoint, then test **Suspend** / **Resume** / **Stop** workspace controls.
- **Expected Result:** Edits persist to isolated `.devcollab-workspaces/`, Monaco loads assets cleanly from `/monaco/vs`, commits update local branch history.
- **If it fails:** Verify `WORKER_URL` & `INTERNAL_AUTH_SECRET` match between API and Worker; inspect worker console logs.

---

## 10. Isolated Container Terminal **[Requires Docker + Worker]**

- **Starting URL:** `http://localhost:3000/app/projects/[projectId]/ide` (Bottom Terminal pane)
- **Steps (without Docker / `WORKSPACE_TERMINAL_ENABLED=false`):**
  1. Open the terminal drawer and verify DevCollab shows an explicit **Docker sandbox runtime unavailable / disabled** message without exposing host OS commands.
- **Steps (with Docker enabled & running):**
  1. Confirm the workspace owner can open the xterm.js terminal (`whoami`, `pwd`, `ls`) while another non-owner team member cannot attach to another developer's shell.
- **Expected Result:** Never executes commands directly on host OS; container enforces `--network=none`, `--read-only`, `--cap-drop=ALL`.
- **If it fails:** Check Docker daemon health (`docker info`) and `WORKSPACE_TERMINAL_ENABLED` in `apps/worker/.env`.

---

## 11. Real-Time Collaboration & IDE AI Assistant

- **Starting URL:** `http://localhost:3000/app/projects/[projectId]/ide`
- **Steps (Real-Time Yjs Collaboration — requires active IDE workspace):**
  1. As Workspace Owner, open the **Collaborate** panel and start a collaborative session. Invite `QA Developer` with `EDITOR` role (or `VIEWER` to test read-only enforcement).
  2. In the **Incognito** window as `QA Developer`, join the session from the IDE Collaborate panel and open the same file.
  3. Type in both windows simultaneously and watch live cursor awareness pills and CRDT convergence, plus send a message in session chat.
  4. Switch `QA Developer` to `VIEWER` (or revoke access) and verify immediate write block / WebSocket disconnect.
- **Steps (IDE AI Assistant — **[Requires External Config `AI_API_KEY`]**):**
  1. Open **AI Assistant**, select lines in Monaco, and trigger **Explain** or ask a repo question.
  2. Watch streaming SSE tokens arrive; test **Cancel** mid-stream, clickable file citations, and applying a suggested diff patch (only available to writable roles, never `VIEWER`).
- **Expected Result:** Dual editors converge cleanly without overwriting; AI assistant excludes secret files and handles unconfigured keys cleanly.
- **If it fails:** Inspect browser WebSocket frame inspector (`ws://127.0.0.1:4100/collab`) and `WORKER_TERMINAL_PUBLIC_URL` in `apps/api/.env`.

---

## 12. Engineering Analytics, Pricing, Budgets & CSV Export

- **Starting URL:** `http://localhost:3000/app/analytics` (**Owner/Admin**), `/app/projects/[projectId]/analytics` (Project team), and `/app/tasks?view=insights` (Personal Insights)
- **Steps:**
  1. Open **Organization Analytics** as Owner: toggle presets (`7d`, `30d`, `90d`), apply custom dates and a timezone (e.g. `Asia/Kolkata`), and click **Refresh**.
  2. Create a versioned **AI Model Pricing** rule (e.g., `openai` / `gpt-4.1-mini` / `0.40` input / `1.60` output) and configure a monthly **Advisory Budget** (e.g., `$50.00`, warning `80%`). Verify the budget audit history updates and historical usage costs do not mutate when adding a new pricing version.
  3. Click **Export CSV** (`Delivery` & `AI Usage`) and verify download headers and formula neutralization (task titles beginning with `=` are prefixed with `'`).
  4. Verify `QA Developer` sees Personal Insights (`/app/tasks?view=insights`) and Project Analytics (`/app/projects/[projectId]/analytics`), and sees a Restricted screen on `/app/analytics`.
- **Expected Result:** Unpriced or provider-omitted token events clearly state **Unavailable** rather than `$0.00` or `0`; dark and warm light themes render charts legibly.
- **If it fails:** Check `apps/web/app/api/workspace/analytics/` network responses and API logs.

---

## 13. Security & Authorization Spot Checks

1. **Unauthenticated redirect:** Open an incognito window to `http://localhost:3000/app/analytics` -> redirects cleanly to `/auth/sign-in`.
2. **Direct NestJS IDOR block:** Run `curl -i http://localhost:4000/api/organizations` without a bearer token -> `401 Unauthorized`.
3. **Secret protection:** Run `pnpm env:check` and inspect browser Network payloads -> zero `.env`, `AUTH_SECRET`, `INTERNAL_AUTH_SECRET`, `AI_API_KEY`, or private key material ever reaches client bundles or responses.
4. **Error resilience:** Visit `http://localhost:3000/app/projects/non-existent-id` -> renders clean styled unavailable/not-found UI without raw stack traces.
