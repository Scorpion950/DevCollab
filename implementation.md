# DevCollab — Implementation Plan
## Real-Time Project Collaboration Platform for Developers

A GitHub-meets-Notion-meets-Slack platform for student dev teams. Below is the complete plan covering tech stack, design system, architecture, all features, and your manual setup steps.

---

## Tech Stack

### Frontend
| Layer | Technology |
|---|---|
| Framework | **Next.js 14** (App Router) |
| Language | **TypeScript** |
| Styling | **Tailwind CSS** + custom CSS variables |
| UI Components | **shadcn/ui** (built on Radix UI) |
| Icons | **Lucide React** |
| Fonts | **Inter** (body) + **JetBrains Mono** (code) — Google Fonts |
| Rich Text Editor | **Tiptap** (Notion-like wiki editor) |
| Code Editor | **Monaco Editor** (VS Code engine) |
| Syntax Highlight | **Shiki** (for snippet display) |
| Drag & Drop | **@dnd-kit** (Kanban board) |
| State Management | **Zustand** |
| Data Fetching | **TanStack Query (React Query)** |
| Real-Time | **Socket.IO Client** |
| Charts/Calendar | **react-big-calendar** + **date-fns** |

### Backend
| Layer | Technology |
|---|---|
| Runtime | **Node.js 20** |
| Framework | **Express.js** |
| Language | **TypeScript** |
| Real-Time | **Socket.IO** |
| ORM | **Prisma** |
| Database | **PostgreSQL** (via Supabase free tier) |
| Cache / Pub-Sub | **Redis** (Upstash free tier) |
| Auth | **JWT + bcrypt** (custom auth) |
| File Uploads | **Cloudinary** (free tier) |
| Email | **Resend** (free tier — invite emails) |
| AI | **Google Gemini 1.5 Flash API** (free tier) |
| Payments | **Stripe** (test/sandbox mode) |

### DevOps & Tools
| Tool | Purpose |
|---|---|
| **pnpm** | Fast package manager |
| **Turborepo** | Monorepo build system |
| **ESLint + Prettier** | Code quality |
| **Husky** | Git pre-commit hooks |
| **dotenv** | Environment variables |

---

## Design System

### Color Palette

> **Theme**: Dark-first, premium dev-tool aesthetic. Inspired by Linear, Vercel, and Raycast.

```
Background       #0A0A0F   (near-black, slightly purple-tinted)
Surface          #111118   (cards, sidebars)
Surface Elevated #1A1A26   (modals, dropdowns)
Border           #2A2A3D   (subtle borders)

Primary          #7C3AED   (violet-600 — brand accent)
Primary Hover    #6D28D9   (violet-700)
Primary Glow     rgba(124, 58, 237, 0.15)  (glow effects)

Secondary        #06B6D4   (cyan-500 — secondary accent)
Success          #10B981   (emerald-500)
Warning          #F59E0B   (amber-500)
Danger           #EF4444   (red-500)

Text Primary     #F1F5F9   (slate-100)
Text Secondary   #94A3B8   (slate-400)
Text Muted       #475569   (slate-600)
```

**Priority Badge Colors:**
- P0 (Critical): `#EF4444` red
- P1 (High): `#F59E0B` amber
- P2 (Normal): `#06B6D4` cyan

**Kanban Column Colors (left border accents):**
- To Do: `#475569` slate
- In Progress: `#7C3AED` violet
- In Review: `#F59E0B` amber
- Done: `#10B981` emerald

### Typography

```css
--font-sans: 'Inter', system-ui, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;

/* Scale */
--text-xs:   0.75rem   /* labels, badges */
--text-sm:   0.875rem  /* secondary text, captions */
--text-base: 1rem      /* body */
--text-lg:   1.125rem  /* card titles */
--text-xl:   1.25rem   /* section headers */
--text-2xl:  1.5rem    /* page titles */
--text-4xl:  2.25rem   /* hero headings */
```

### Spacing & Radius
```css
--radius-sm:  4px
--radius-md:  8px
--radius-lg:  12px
--radius-xl:  16px
--radius-full: 9999px  /* pills, avatars */

Sidebar width:  240px
Page padding:   24px
Card padding:   16px
```

### Animations & Effects
- **Glassmorphism** panels: `backdrop-filter: blur(12px)` on modals
- **Gradient shimmer** on loading skeletons
- **Hover lift**: `transform: translateY(-2px)` + box-shadow on cards
- **Active glow**: violet glow on focused inputs and selected nav items
- **Framer Motion** for page transitions and panel slides
- **Smooth drag** with `@dnd-kit` spring physics

---

## Architecture

### Monorepo Structure
```
DevCollab/
├── apps/
│   ├── web/              ← Next.js frontend
│   └── server/           ← Express + Socket.IO backend
├── packages/
│   ├── types/            ← Shared TypeScript types
│   ├── ui/               ← Shared UI components (optional)
│   └── config/           ← Shared ESLint, TS configs
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
└── .env (root)
```

### Frontend App Structure (`apps/web/`)
```
src/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   └── register/
│   ├── (dashboard)/
│   │   ├── layout.tsx       ← Main app shell (sidebar + topbar)
│   │   ├── home/            ← Activity feed / landing
│   │   ├── [workspaceId]/
│   │   │   ├── settings/
│   │   │   └── [projectId]/
│   │   │       ├── board/   ← Kanban
│   │   │       ├── list/    ← Task list view
│   │   │       ├── calendar/
│   │   │       ├── docs/
│   │   │       │   └── [pageId]/
│   │   │       ├── snippets/
│   │   │       └── ai/
│   └── api/                 ← Next.js API proxy (optional)
├── components/
│   ├── layout/              ← Sidebar, Topbar, Shell
│   ├── board/               ← Kanban, TaskCard, Column
│   ├── task/                ← TaskDetail, TaskForm
│   ├── wiki/                ← Editor, PageList, VersionHistory
│   ├── snippets/            ← SnippetCard, SnippetEditor
│   ├── ai/                  ← AIPanel, CodeReviewer
│   ├── notifications/
│   ├── presence/            ← Live cursors, online indicators
│   └── ui/                  ← shadcn components
├── hooks/
├── lib/
│   ├── api.ts              ← axios instance
│   ├── socket.ts           ← Socket.IO client
│   └── utils.ts
├── store/                  ← Zustand stores
└── types/
```

### Backend Structure (`apps/server/`)
```
src/
├── routes/
│   ├── auth.ts
│   ├── workspaces.ts
│   ├── projects.ts
│   ├── tasks.ts
│   ├── docs.ts
│   ├── snippets.ts
│   ├── ai.ts
│   ├── notifications.ts
│   └── payments.ts
├── middleware/
│   ├── auth.ts             ← JWT verification
│   └── roles.ts            ← Permission checks
├── socket/
│   ├── index.ts            ← Socket.IO setup
│   ├── board.ts            ← Task move events
│   ├── presence.ts         ← Who is viewing
│   └── notifications.ts
├── services/
│   ├── ai.service.ts       ← Gemini API calls
│   ├── email.service.ts    ← Resend invite emails
│   ├── upload.service.ts   ← Cloudinary
│   └── stripe.service.ts
├── prisma/
│   └── schema.prisma
└── index.ts                ← Entry point
```

---

## Database Schema (Key Models)

```prisma
User { id, name, email, passwordHash, avatar, bio, skills[], githubUrl, plan }
Workspace { id, name, slug, ownerId, plan }
WorkspaceMember { workspaceId, userId, role: OWNER|ADMIN|MEMBER|VIEWER }
Project { id, name, workspaceId, description, color }
ProjectMember { projectId, userId, role }
Task { id, title, description, projectId, assigneeId, status, priority, dueDate, labels[], order }
TaskComment { id, taskId, authorId, content, mentions[] }
TaskAttachment { id, taskId, url, filename }
WikiPage { id, projectId, parentId, title, content, authorId }
WikiVersion { id, pageId, content, savedAt }
Snippet { id, projectId, title, language, code, tags[], description }
Notification { id, userId, type, message, read, link }
ActivityLog { id, workspaceId, projectId, userId, action, entityType, entityId }
Subscription { id, userId, stripeCustomerId, plan, status }
```

---

## Feature Modules

### 1. Authentication
- Register with name, email, password → verify email via Resend
- Login → JWT access token (15min) + refresh token (7d) in httpOnly cookie
- Protected routes via middleware

### 2. Workspace & Projects
- Create workspace → auto-assign as Owner
- Invite via email link (signed JWT link, 48h expiry)
- Role-based permission middleware: Viewer can't edit, Member can't delete, etc.

### 3. Task Management (Kanban)
- 4-column Kanban with drag-and-drop (`@dnd-kit`)
- Socket.IO broadcasts `task:moved` to all board members in real-time
- Task detail modal: assignee picker, priority dropdown, due date, labels, comments
- @mention in comments triggers in-app + email notification
- List view (sortable table) and Calendar view (react-big-calendar)

### 4. Real-Time Presence
- On board open → emit `presence:join` with userId
- Server broadcasts current viewers to all in room
- Avatar stack shown at top of board: "3 people viewing"
- On task open → show "Ankush is viewing this task"

### 5. Code Snippets
- Monaco Editor for writing/editing snippets
- Shiki for read-only highlighted display
- Full-text search with PostgreSQL `ILIKE`
- Copy-to-clipboard button with animated feedback

### 6. Documentation Wiki
- Tiptap editor with: headings, bold/italic, bullet/numbered lists, code blocks (with language), tables, image upload (Cloudinary)
- Page tree in sidebar (nested pages)
- Version history: save snapshot on every publish → diff viewer
- Inter-page links with `[[Page Name]]` syntax

### 7. AI Project Assistant (Gemini)
- **Summarise project**: Sends task list + statuses → returns markdown summary
- **What's blocking us?**: Filters tasks in "In Progress" > 3 days → AI commentary
- **Standup report**: Task movements in last 24h → formatted standup
- **Task breakdown**: User types feature description → AI returns JSON array of subtasks → auto-created in DB

### 8. AI Code Reviewer (Gemini)
- User pastes code + selects language
- Prompt: Review for bugs, performance, security, readability → return JSON: `{ score, issues[], suggestions[] }`
- Rendered as formatted cards with severity badges
- Supports: JS, TS, Python, Java, C++, Go, Rust

### 9. Activity Feed
- Every write action logs to `ActivityLog`
- Feed page: infinite scroll, grouped by date
- Filter by project or member
- Real-time updates via Socket.IO `activity:new`

### 10. Notifications
- Bell icon with unread count badge
- Dropdown with latest 10; "Mark all read" button
- Notification types: @mention, task assigned, task moved, doc updated, member joined
- Real-time delivery via Socket.IO `notification:new`

### 11. Payments (Stripe)
- Free plan: 1 workspace, 3 projects, 5 members, no AI
- Pro plan ($12/mo): unlimited everything + AI features
- Stripe Checkout Session → webhook → update DB plan
- Plan gate middleware on AI routes and workspace creation

---

## Development Phases

### Phase 1 - Foundation (Completed)
- [x] Monorepo setup with Turborepo and pnpm.
- [x] Database schema and Prisma setup.
- [x] Auth system with register, login, refresh tokens, and JWT middleware.
- [x] Workspace and project CRUD.
- [x] Basic frontend shell with dashboard layout, sidebar, routing, login, and register pages.

### Phase 2 - Core Features (Completed)
#### Status
Phase 2 is implemented and build-verified. The Kanban board, task APIs, notifications, presence, Socket.IO integration, role checks, frontend stores, hooks, and board page are now in the codebase.

#### Completed Backend Work
- Added Phase 2 Prisma models and relations for tasks, task comments, notifications, presence, and activity support.
- Added task routes for create, read, update, delete, move/reorder, comments, and project task listing.
- Added notification routes for listing notifications, unread count, mark read, mark all read, and delete.
- Added presence routes for project viewers and task/project presence updates.
- Added backend services for tasks, notifications, presence, and activity logging.
- Added Socket.IO handlers for board events, task movement, task updates, comments, notifications, and presence.
- Updated role middleware so viewers can read, members can create/edit/move/comment, and admins can delete tasks.
- Wired Phase 2 routes and sockets into the Express server.

#### Completed Frontend Work
- Added Kanban board components: board, columns, task cards, task detail modal, create task modal, comments, assignee select, priority select, status select, and presence indicator.
- Added notification UI: bell, dropdown, and notification item.
- Added frontend hooks for board data, task CRUD, task comments, notifications, board sockets, notification sockets, and presence sockets.
- Added Zustand stores for board, task modal state, notifications, and presence.
- Replaced the old dashboard board placeholder with the real board page at `/dashboard/:workspaceId/:projectId/board`.
- Added the local `components/ui` primitives required by Phase 2 components.
- Added missing frontend dependencies for drag-and-drop and socket/client integration.

#### Integration Fixes Completed
- Fixed active board route wiring so sidebar project links open the real board.
- Fixed frontend API import mismatch by exporting both named and default `api`.
- Added local `BoardTask` typing for task objects that include assignee/comment details.
- Fixed project member loading in task assignee controls to use the real workspace-scoped project API.
- Added missing `dotenv` runtime dependency for the server.
- Fixed TypeScript errors in Socket.IO board handlers and activity metadata.

#### Verification Completed
- Server TypeScript check passes: `pnpm.cmd --filter @devcollab/server lint`.
- Web production build passes: `pnpm.cmd --filter @devcollab/web build`.
- ### Phase 3 — Content Features (Completed)
#### Status
Phase 3 is fully implemented, built, verified, and pushed to main! This includes full documentation Wiki trees, code snippet storage and syntax highlighting, Cloudinary attachment uploading, notifications, and activity logging.

#### Completed Backend Work
- Added Prisma models and relations for `WikiPage`, `WikiVersion`, `Snippet`, `ActivityLog`, and `TaskAttachment`.
- Added Wiki routes for CRUD, hierarchy tree, version snapshotting, and page restoration.
- Added Snippet routes for CRUD and full-text/tag search.
- Added Activity log endpoints (paginated workspace-level activity feed).
- Added File upload endpoint (Cloudinary API integration) for task attachments.
- Wired all routes into the main Express server.

#### Completed Frontend Work
- Added Wiki components: Notion-like nested page sidebar hierarchy, Tiptap Rich Text editor, Version History drawer, and diff viewer.
- Added Snippet components: syntax-highlighted code viewer, code editor, tag selector, search, and lists.
- Added Activity components: grouped date-based infinite scroll feed, and activity filters.
- Added Uploads components: drag-and-drop file upload zone.
- Wired Phase 3 views into project sub-navigation panel at `/dashboard/[workspaceId]/[projectId]/docs` and `snippets`.

**Phase 3 Status**: [x] Implemented, verified, and pushed to remote main.
---

### Phase 4 — AI + Polish (Week 4)
#### Overview
Integrate Gemini AI for project intelligence, add alternative views (calendar, list), payments via Stripe, and final UI polish.

#### A. Database Schema Additions (Prisma)
```prisma
model AICreditUsage {
  id        String   @id @default(cuid())
  workspaceId String
  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  
  creditsUsed Int     // Tokens/request units
  creditsLimit Int    // Free or Pro tier limit
  resetDate   DateTime // Monthly reset
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@unique([workspaceId])
}

model Subscription {
  id        String   @id @default(cuid())
  workspaceId String  @unique
  workspace Workspace @relation(fields: [workspaceId], references: [id])
  
  plan      String   // "free" | "pro"
  stripeCustomerId String?
  stripePriceId String?
  stripeSubscriptionId String?
  
  status    String   // "active" | "cancelled" | "past_due"
  currentPeriodEnd DateTime?
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([stripeCustomerId])
}
```

#### B. Backend Routes & Services
```typescript
// AI Routes: src/routes/ai.ts
POST   /api/ai/summarize-project      // Summarize tasks + status
POST   /api/ai/whats-blocking-us      // Analyze blockers (overdue tasks)
POST   /api/ai/standup-report         // Generate standup report
POST   /api/ai/task-breakdown         // Convert description to subtasks
POST   /api/ai/code-review            // Review code snippet

// Payments Routes: src/routes/payments.ts
POST   /api/payments/checkout         // Create Stripe checkout session
GET    /api/payments/subscription     // Get subscription details
POST   /api/payments/cancel-subscription // Cancel Pro plan
POST   /api/payments/webhook          // Stripe webhook handler

// Services: src/services/ai.service.ts & stripe.service.ts
- handleAIRequest(type, context) → rate-limit check → call Gemini → save usage
- parseAIResponse(response, type) → format response for client
- getUserCredits(workspaceId) → get remaining AI credits
- createCheckoutSession(workspaceId) → create Stripe checkout
- handleWebhookEvent(event) → update subscription on Stripe event
```

#### C. Frontend Components
```
components/
├── ai/
│   ├── AIPanel.tsx              // Panel with AI tool buttons
│   ├── SummarizeProject.tsx     // Button + response display
│   ├── WhatsBlockingUs.tsx      // Button + blocker list
│   ├── StandupReport.tsx        // Button + formatted report
│   ├── TaskBreakdown.tsx        // Input form + generated tasks
│   ├── CodeReviewer.tsx         // Monaco editor + review results
│   ├── AICreditsDisplay.tsx     // Show remaining free credits
│   └── AIUpgradePrompt.tsx      // Upsell for Pro plan
├── payments/
│   ├── PricingTable.tsx         // Free vs Pro comparison
│   ├── UpgradeButton.tsx        // Start checkout
│   ├── SubscriptionManager.tsx  // Cancel, manage subscription
│   └── PaymentStatus.tsx        // Success/error messages
├── calendar/
│   ├── CalendarView.tsx         // react-big-calendar wrapper
│   └── CalendarTask.tsx         // Task event on calendar
└── list/
    ├── TaskListView.tsx         // Sortable table
    ├── TaskListRow.tsx          // Single row with inline edit
    └── TaskListFilters.tsx      // Sort by: date, priority, assignee
```

#### D. Frontend Pages
```
app/(dashboard)/[workspaceId]/[projectId]/
├── calendar/
│   └── page.tsx                 // Calendar view of tasks
├── list/
│   └── page.tsx                 // Table/list view of tasks
├── ai/
│   └── page.tsx                 // AI assistant hub
└── settings/
    └── billing/
        └── page.tsx             // Subscription management
```

#### E. Plan Gates & Middleware
```typescript
// Middleware: src/middleware/plan-gates.ts
- requirePlan(plan) middleware → check subscription.plan
- rateLimitAI(credits) middleware → check remaining AI credits
- requiresProPlan() middleware → AI features require Pro

// Free plan limits:
- 1 workspace, 3 projects, 5 members per workspace
- 0 AI requests per month
- Limited snippet storage

// Pro plan ($12/mo):
- Unlimited workspaces, projects, members
- 1000 AI credits/month (1 request ≈ 50 credits)
- Unlimited snippets
- Priority support
```

#### F. Phase 4 Testing Checklist
```
[ ] Summarize project → returns markdown summary
[ ] What's blocking us → filters tasks >3 days in progress
[ ] Standup report → shows last 24h movements
[ ] Task breakdown → converts description to JSON → creates tasks
[ ] Code review → returns score + issues + suggestions
[ ] AI request on free plan → "Upgrade to Pro" message
[ ] Free tier credits → display remaining count
[ ] Upgrade checkout → creates Stripe session
[ ] Payment success → subscription plan updated
[ ] Cancel subscription → plan reverts to free
[ ] Stripe webhook → subscription status syncs
[ ] Calendar view → tasks appear as events
[ ] List view → sortable by date, priority, assignee
[ ] Final UI polish → animations smooth, no layout shift
[ ] Framer Motion page transitions → work on all routes
[ ] Dark theme consistency → all components follow color palette
[ ] Mobile responsiveness → sidebar collapses on mobile
```

---

**Implementation Priorities:**
1. **Phase 3** (Next) - Content creation = user engagement
2. **Phase 4** (Last) - AI + payments = monetization + polish

---

## Proposed Changes / File Creation

### Root Monorepo
#### [NEW] `turbo.json`
#### [NEW] `pnpm-workspace.yaml`
#### [NEW] `package.json` (root)
#### [NEW] `.env` (root — all secrets)

### Backend (`apps/server`)
#### [NEW] `apps/server/` — full Express + Socket.IO + Prisma backend
#### [NEW] `apps/server/prisma/schema.prisma` — all DB models
#### [NEW] All route, middleware, socket, service files

### Frontend (`apps/web`)
#### [NEW] `apps/web/` — full Next.js 14 app
#### [NEW] All page, component, hook, store, lib files

---

## Verification Plan

### Automated
- TypeScript compilation: `pnpm build` — no errors
- ESLint: `pnpm lint` — clean

### Manual (Browser)
1. Register → verify email invite flow
2. Create workspace → project → tasks
3. Open board in two tabs → drag task → confirm both update live
4. Add wiki page → edit → check version history
5. Paste code into AI reviewer → verify response
6. Trigger Stripe checkout (test card `4242 4242 4242 4242`)
7. Verify plan gates (AI blocked on free plan)

---

## ⚙️ Your Manual Setup Steps (Step-by-Step from Scratch)

> Follow these EXACTLY, in order. Every step is explained simply.

---

### STEP 1 — Install Required Tools

#### 1a. Install Node.js
1. Go to: https://nodejs.org
2. Download **Node.js 20 LTS**
3. Run the installer → keep all defaults → click Next → Install
4. Open **Command Prompt** and run: `node -v` — should print `v20.x.x`

#### 1b. Install pnpm
1. In Command Prompt, run:
   ```
   npm install -g pnpm
   ```
2. Verify: `pnpm -v` — should print `9.x.x`

#### 1c. Install Git (if not already)
1. Go to: https://git-scm.com/download/win
2. Download and install → keep all defaults

---

### STEP 2 — Set Up Accounts (All Free)

#### 2a. Supabase (PostgreSQL database)
1. Go to: https://supabase.com → Sign up free
2. Click **"New project"**
3. Give it a name: `devcollab`
4. Set a **database password** — SAVE THIS SOMEWHERE SAFE
5. Choose your nearest region → click **Create project**
6. Wait ~2 min for setup
7. Go to **Project Settings → Database**
8. Copy the **Connection string** (URI format) — looks like:
   `postgresql://postgres:[PASSWORD]@db.xxxx.supabase.co:5432/postgres`
9. Save this — it's your `DATABASE_URL`

#### 2b. Upstash (Redis)
1. Go to: https://upstash.com → Sign up free
2. Click **Create Database**
3. Name: `devcollab`, Region: nearest
4. After creation, go to **REST API** tab
5. Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
6. Save both values

#### 2c. Cloudinary (File uploads)
1. Go to: https://cloudinary.com → Sign up free
2. After login, go to your **Dashboard**
3. Copy: **Cloud Name**, **API Key**, **API Secret**
4. Save all three values

#### 2d. Resend (Email sending)
1. Go to: https://resend.com → Sign up free
2. Go to **API Keys** → click **Create API Key**
3. Name it `devcollab` → copy the key
4. Save it as `RESEND_API_KEY`

#### 2e. Google AI Studio (Gemini API)
1. Go to: https://aistudio.google.com
2. Sign in with Google account
3. Click **"Get API key"** → **"Create API key"**
4. Copy the key → save as `GEMINI_API_KEY`

#### 2f. Stripe (Payments — Test Mode)
1. Go to: https://stripe.com → Sign up free
2. Stay in **Test mode** (toggle at top right)
3. Go to **Developers → API keys**
4. Copy **Publishable key** and **Secret key**
5. Go to **Developers → Webhooks** → **Add endpoint**
6. URL: `http://localhost:4000/api/payments/webhook` (for local testing)
7. Select event: `checkout.session.completed`
8. Copy the **Webhook signing secret** → save as `STRIPE_WEBHOOK_SECRET`

---

### STEP 3 — Create the `.env` File

> I will generate all the code. You just need to fill in your actual values.

When I scaffold the project, I'll create a `.env.example` file. You copy it to `.env` and fill in:

```
# Database
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.xxxx.supabase.co:5432/postgres"

# Auth
JWT_SECRET="make-up-a-long-random-string-like-this-abc123xyz789"
JWT_REFRESH_SECRET="another-long-random-string"

# Redis
UPSTASH_REDIS_REST_URL="https://..."
UPSTASH_REDIS_REST_TOKEN="..."

# Cloudinary
CLOUDINARY_CLOUD_NAME="..."
CLOUDINARY_API_KEY="..."
CLOUDINARY_API_SECRET="..."

# Email
RESEND_API_KEY="re_..."
RESEND_FROM_EMAIL="noreply@yourdomain.com"

# AI
GEMINI_API_KEY="AI..."

# Stripe
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
STRIPE_PRO_PRICE_ID="price_..."   ← you create this in Stripe dashboard

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
SERVER_URL="http://localhost:4000"
NODE_ENV="development"
```

---

### STEP 4 — Create Stripe Product

1. In Stripe dashboard → **Products → Add product**
2. Name: `DevCollab Pro`
3. Pricing: **Recurring**, `$12.00 / month`
4. Click **Save product**
5. Copy the **Price ID** (starts with `price_...`)
6. Add it to your `.env` as `STRIPE_PRO_PRICE_ID`

---

### STEP 5 — Git Setup (No Push to Remote)

> Run these in your project folder (I'll tell you exactly when):

```bash
# Initialize repo (already done — your folder has .git)
git status

# After I scaffold the project:
git add .
git commit -m "feat: initial project scaffold"

# If you ever want to save progress:
git add .
git commit -m "feat: add kanban board"

# DO NOT run git push unless you set up a remote
# To check if you have a remote set:
git remote -v
# If nothing shows, you have no remote — safe
```

---

### STEP 6 — Run the Project

> I'll give exact commands when the code is scaffolded. The general flow:

```bash
# Install all dependencies
pnpm install

# Run database migrations
cd apps/server
pnpm prisma migrate dev --name init

# Run everything (frontend + backend simultaneously)
pnpm dev
```

- Frontend: http://localhost:3000
- Backend: http://localhost:4000

---

## Open Questions

> [!IMPORTANT]
> Please answer these before I start building so the code matches your needs:

1. **Your domain**: i will use localhost

2. **AI Free Tier Limits**: i want some tokens to be free and then make it paid 

3. **Phase priority**: 2 then 3 then 4

4. **Deployment**: i am going to deploy this project but for right now please make it for local

5. **Team size**: 3
