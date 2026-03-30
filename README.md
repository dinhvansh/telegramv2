# Telegram Operations Platform

CRM-first Telegram operations platform for:

- campaign tracking
- Telegram group integration
- anti-spam moderation
- invite link management
- autopost planning
- RBAC-based admin workflow

Current repository status:

- `apps/api`: NestJS + Prisma + PostgreSQL
- `apps/web`: Next.js App Router + Tailwind CSS
- local stack: PostgreSQL + Redis + API + Web
- moderation architecture direction: CRM is the source of truth, Telegram bot is only the execution layer

## Monorepo Structure

```text
.
|-- apps/
|   |-- api/        NestJS API, Prisma schema, Telegram integration, moderation logic
|   `-- web/        Next.js admin CRM UI
|-- docs/           Project docs, local test notes, implementation plans
|-- infra/          Nginx and VPS deployment files
|-- stitch/         Design/source references for UI screens
|-- docker-compose.yml
`-- docker-compose.prod.yml
```

## Main Modules

### API

The backend is organized by domain modules:

- `auth`: login, JWT, profile, permission guards
- `campaigns`: campaign CRUD and invite-link related data
- `telegram`: Telegram config, webhook handling, group discovery, invite links
- `telegram-actions`: Telegram Bot API execution layer
- `moderation`: moderation config, evaluation engine, manual actions
- `roles` and `users`: RBAC and user administration
- `settings`: encrypted system settings and AI config
- `system-logs`: audit and execution logging
- `platform`: dashboard snapshot endpoint

### Web

The frontend currently provides:

- login flow for seeded local users
- dashboard shell
- campaign creation flow
- moderation, roles, autopost, Telegram, and settings pages

Current UI state:

- functional for local demo and API integration
- still partially driven by fallback snapshot data
- needs refactor into feature-based data screens for production readiness

## Current Architecture Direction

The target moderation model is:

- all moderation config lives in the CRM
- bot token and webhook setup live in CRM
- when the bot is added to a Telegram group, CRM should register that group
- moderation engine reads CRM config and decides what to do
- Telegram bot only executes actions through Telegram Bot API

Design document:

- [docs/crm_first_moderation_architecture.md](d:\OneDrive - ANDROS\Documents\telegram v2\telegramv2\docs\crm_first_moderation_architecture.md)

## Local Development

### Requirements

- Node.js 24+
- npm 11+
- Docker Desktop

### Environment

Copy `.env.example` to `.env` and adjust values if needed.

Important variables:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/telegram_ops?schema=public
REDIS_URL=redis://localhost:6379
API_PORT=4000
WEB_PORT=3000
JWT_SECRET=local-dev-secret
SETTINGS_ENCRYPTION_KEY=change-me-to-a-long-random-secret
NEXT_PUBLIC_API_URL=http://localhost:4000/api
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_PUBLIC_BASE_URL=
```

### Start with Docker

From repo root:

```bash
docker compose up --build
```

Services:

- Web: `http://localhost:3000`
- API: `http://localhost:4000/api`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

### Start manually

1. Start PostgreSQL and Redis
2. Install dependencies
3. Generate Prisma client
4. Start API
5. Start Web

API:

```bash
cd apps/api
npm ci
npm run prisma:generate
npm run start:dev
```

Web:

```bash
cd apps/web
npm ci
npm run dev
```

Important note:

- after a fresh clone, run `npm run prisma:generate` in `apps/api` before build/lint/test

## Local Accounts

Seeded local accounts used by the current local flow:

- `admin@nexus.local / admin123`
- `operator@nexus.local / operator123`

## Useful Endpoints

### Platform

- `GET /api/health`
- `GET /api/platform`

### Auth

- `POST /api/auth/login`
- `GET /api/auth/me`

### Campaigns

- `GET /api/campaigns`
- `POST /api/campaigns`
- `GET /api/campaigns/:campaignId/invite-links`

### Telegram

- `GET /api/telegram/status`
- `POST /api/telegram/config`
- `POST /api/telegram/register-webhook`
- `POST /api/telegram/mock`
- `POST /api/telegram/webhook`
- `POST /api/telegram/discover-groups`

### Moderation

- `GET /api/moderation/config`
- `PUT /api/moderation/config`
- `GET /api/moderation/events`
- `POST /api/moderation/analyze`
- `POST /api/moderation/events/:eventId/action`

## Telegram Local Testing

There are two supported local testing modes:

1. local-only testing with mock or manual webhook payloads
2. public tunnel testing with a real HTTPS URL

Recommended doc:

- [docs/telegram_local_test.md](d:\OneDrive - ANDROS\Documents\telegram v2\telegramv2\docs\telegram_local_test.md)

Typical local-only checks:

- login from CRM
- inspect `GET /api/telegram/status`
- send `POST /api/telegram/mock`
- send `POST /api/telegram/webhook`
- inspect `GET /api/platform`

For real Telegram webhook testing:

- expose local API with `ngrok http 4000`
- save `publicBaseUrl` and `webhookSecret` in CRM
- register webhook

## Quality Checks

Verified on the current repository state:

- `apps/web`: `npm run build` passes
- `apps/web`: `npm run lint` passes
- `apps/api`: `npm run prisma:generate` passes
- `apps/api`: `npm run build` passes
- `apps/api`: `npm run lint` passes
- `apps/api`: `npm run test:e2e -- --runInBand` passes

Notes:

- `apps/api` unit test command `npm test` currently reports `No tests found`
- some docs and UI fallback text still contain encoding issues from older content

## Current Gaps

This repo is already a working MVP foundation, but not yet the final CRM-first moderation system.

Main gaps still open:

- group lifecycle sync when bot is added/removed from Telegram
- Rose-like lock matrix by content type
- warning counter and escalation ladder
- queue-first processing for Telegram updates
- richer moderation workbench UI
- cleaner feature-based frontend architecture
- UTF-8 cleanup for older docs and fallback data

## Recommended Next Step

If the next priority is anti-spam moderation, build in this order:

1. Telegram group registration from `my_chat_member`
2. CRM group management screen
3. moderation config per group
4. lock rules for `url`, `invitelink`, `forward`, `command`
5. warning ladder and execution audit logs
6. queue-based moderation pipeline

## Related Docs

- [docs/crm_first_moderation_architecture.md](d:\OneDrive - ANDROS\Documents\telegram v2\telegramv2\docs\crm_first_moderation_architecture.md)
- [docs/telegram_local_test.md](d:\OneDrive - ANDROS\Documents\telegram v2\telegramv2\docs\telegram_local_test.md)
- [docs/implementation_master_plan.md](d:\OneDrive - ANDROS\Documents\telegram v2\telegramv2\docs\implementation_master_plan.md)
- [docs/live_debug_runbook.md](d:\OneDrive - ANDROS\Documents\telegram v2\telegramv2\docs\live_debug_runbook.md)

