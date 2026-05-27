<div align="center">
  <!-- Replace the src below if you have a specific logo file -->
  <!-- <img src="./apps/web/public/logo.png" alt="DevCollab Logo" width="120" /> -->

  # DevCollab
  **A powerful, real-time collaboration platform designed specifically for developer teams.**
  
  [![Live Demo](https://img.shields.io/badge/Live_Demo-dev--collab--web.vercel.app-000000?style=for-the-badge&logo=vercel)](https://dev-collab-web.vercel.app/)
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
  [![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)

  Streamline project management, task tracking, team communication, and documentation in a single unified workspace.
</div>

---

## 🔗 Live Deployment
Experience the platform live: **[DevCollab Official Deployment](https://dev-collab-web.vercel.app/)**

> **Note:** The backend API is deployed on Render. If it has been inactive for a while, please allow up to 30-50 seconds for the backend to spin up on your first interaction.

---

## 🌟 Key Features

- **⚡ Real-time Collaboration:** Live updates for tasks, presence, and notifications powered by Socket.io.
- **📋 Kanban Task Boards:** Drag-and-drop task management engineered with `@dnd-kit`.
- **📝 Rich Text Wiki/Documentation:** Collaborative document editing natively supported via Tiptap.
- **👥 Team & Workspace Management:** Create multiple isolated workspaces, invite team members securely, and manage roles and permissions.
- **🤖 AI Assistant Engine:** Integrated AI capabilities powered by Google Gemini to analyze project data, generate code snippets, and optimize workflows.
- **📅 Calendar & Scheduling:** Fully integrated team calendar scheduling via `react-big-calendar`.
- **📁 Asset Management:** Seamless media and document handling built on top of Cloudinary.
- **💎 Pro Tier Subscription:** Premium feature unlocking handled securely through Stripe integration.

---

## 🛠 Tech Stack

DevCollab utilizes a modern architecture, managed as a **Turborepo** monorepo containing a high-performance Next.js web application and a scalable Node.js API server.

### Frontend (`apps/web`)
* **Framework:** Next.js 14 (App Router)
* **Language:** TypeScript, React 18
* **Styling:** Tailwind CSS, Radix UI primitives, Framer Motion
* **State Management:** Zustand
* **Connectivity:** Socket.io Client

### Backend (`apps/server`)
* **Core:** Node.js, Express
* **Database & ORM:** PostgreSQL, Prisma ORM
* **Real-time Engine:** Socket.io
* **Caching & Rate Limiting:** Upstash Redis
* **Integrations:** Stripe (Billing), Resend (Emails), Cloudinary (Storage)

---

## 🚀 Getting Started Locally

### Prerequisites
Make sure you have the following installed on your machine:
- [Node.js](https://nodejs.org/) (v20 or higher)
- [pnpm](https://pnpm.io/) (v9 or higher)
- A running instance of PostgreSQL (or a hosted remote database like Supabase/Neon)

### 1. Clone the repository
```bash
git clone https://github.com/Scorpion950/DevCollab.git
cd DevCollab
```

### 2. Install dependencies
```bash
pnpm install
```

### 3. Environment Configuration
You will need to create a `.env` file in `apps/server` and a `.env.local` file in `apps/web` based on their respective examples.

**`apps/server/.env` template:**
```env
# Server Configuration
SERVER_PORT=4000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development

# Database Connection
DATABASE_URL="postgresql://user:password@localhost:5432/devcollab?schema=public"

# Auth & Security
ACCESS_TOKEN_SECRET="your_access_token_secret_here"
REFRESH_TOKEN_SECRET="your_refresh_token_secret_here"

# External Services
CLOUDINARY_CLOUD_NAME="your_cloudinary_name"
CLOUDINARY_API_KEY="your_cloudinary_api_key"
CLOUDINARY_API_SECRET="your_cloudinary_api_secret"

UPSTASH_REDIS_REST_URL="your_upstash_url"
UPSTASH_REDIS_REST_TOKEN="your_upstash_token"

GEMINI_API_KEY="your_gemini_api_key"
RESEND_API_KEY="your_resend_api_key"

STRIPE_SECRET_KEY="your_stripe_secret_key"
STRIPE_WEBHOOK_SECRET="your_stripe_webhook_secret"
```

**`apps/web/.env.local` template:**
```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="your_stripe_publishable_key"
```
> ⚠️ **Warning:** Never commit your actual secrets and API keys to version control!

### 4. Database Setup
Apply the schema to your database and seed initial data if required.
```bash
cd apps/server

# Push schema directly
pnpm run db:push
# OR create a migration history
pnpm run db:migrate

# Optional: Seed the database with initial configurations/dummy data
pnpm run db:seed
```

### 5. Running the Application
Return to the root directory to spin up the monorepo concurrently.
```bash
cd ../../
pnpm dev
```
- **Frontend App:** Available at `http://localhost:3000`
- **Backend API:** Available at `http://localhost:4000`

---

## 📁 Architecture Overview

```text
DevCollab/
├── apps/
│   ├── web/          # Next.js 14 frontend application
│   └── server/       # Express.js REST API & WebSocket server
├── packages/
│   └── types/        # Cross-application shared TypeScript definitions
├── turbo.json        # Turborepo task pipeline configuration
└── package.json      # Monorepo root configuration
```

---

## 📜 License

This project is distributed under the MIT License.

<div align="center">
  <i>Built with ❤️ for developers, by developers.</i>
</div>