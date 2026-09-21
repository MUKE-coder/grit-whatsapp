# WhatsApp, built with Grit

A working WhatsApp-style messenger on the web, a phone and the desktop, sharing one Go API: direct and
group chats, live messages, typing indicators, online status, read receipts, unread counts, mute, photos
and push notifications. The first [Grit UI](https://gritframework.dev) blueprint.

- **[BLUEPRINT.md](BLUEPRINT.md)**: how to run it, how it works, and how it differs from WhatsApp at scale.
- **[BUILD-ALONG.md](BUILD-ALONG.md)**: the build step by step, from `grit new` to three clients.

## Run it

You need Go 1.21+, Node 20+, pnpm 10.33.4 and the [Grit CLI](https://gritframework.dev) 3.301.0 or later.
No Docker: it runs on SQLite.

```bash
grit env        # .env from .env.example, with every secret generated
pnpm install
grit migrate
grit seed
grit start
```

Open http://localhost:3000/register in two browsers, create two accounts, and start a chat.

---

The rest of this file is the standard README of a Grit project.

## Quick Start

```bash
# 1. Install Air for Go hot reloading
go install github.com/air-verse/air@latest

# 2. Start infrastructure (PostgreSQL, Redis, MinIO, Mailhog)
docker compose up -d

# 3. Install frontend dependencies
pnpm install

# 4. Start all services (API auto-reloads on file changes)
pnpm dev
```

## Project Structure

```
whatsapp/
├── apps/
│   ├── api/          # Go backend (Gin + GORM)
│   ├── web/          # Next.js frontend
│   └── admin/        # Next.js admin panel
├── packages/
│   └── shared/       # Shared types, schemas, constants
├── docker-compose.yml
└── turbo.json
```

## Services

| Service       | URL                          |
|---------------|------------------------------|
| API           | http://localhost:8080         |
| GORM Studio   | http://localhost:8080/studio  |
| Web App       | http://localhost:3000         |
| Admin Panel   | http://localhost:3001         |
| PostgreSQL    | localhost:5434               |
| Redis         | localhost:6380               |
| MinIO Console | http://localhost:9003         |
| Mailhog       | http://localhost:8025         |

## Development

```bash
# Run Go API with hot reload
cd apps/api && air

# Run Next.js web app
cd apps/web && pnpm dev

# Run admin panel
cd apps/admin && pnpm dev

# Run all services via Turborepo
pnpm dev
```

## No Docker? No Problem

If you can't run Docker, use cloud services instead:

```bash
cp .env.cloud.example .env
```

Then fill in your keys for:
- **[Neon](https://neon.tech)** — PostgreSQL (free tier)
- **[Upstash](https://upstash.com)** — Redis (free tier)
- **[Cloudflare R2](https://dash.cloudflare.com)** — File storage (free tier)
- **[Resend](https://resend.com)** — Email (free tier)

No Docker needed — just your API keys and ``go run``.

## Tech Stack

- **Backend:** Go + Gin + GORM
- **Frontend:** Next.js 14+ (App Router) + React + TypeScript
- **Styling:** Tailwind CSS + shadcn/ui
- **Database:** PostgreSQL
- **Cache:** Redis
- **Monorepo:** Turborepo + pnpm
- **Validation:** Zod (shared schemas)
- **Data Fetching:** React Query (TanStack Query)

---

*Built with Grit v3.296.0*
