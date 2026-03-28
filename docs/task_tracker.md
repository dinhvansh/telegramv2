# Telegram Operations Platform Task Tracker

## Legend

- `[x]` done and verified
- `[-]` in progress
- `[ ]` not started

## Phase 0. Documentation and normalization

- [ ] Normalize all Vietnamese architecture documents to UTF-8.
- [x] Consolidate implementation scope into a master execution file.
- [x] Extract UI direction from the current design system and mockups.
- [x] Create a task tracker that can be updated as work progresses.

## Phase 1. Repo and local environment

- [x] Create `apps/web`.
- [x] Create `apps/api`.
- [x] Add Dockerfiles for local build and run.
- [x] Add `docker-compose.yml` with `web`, `api`, `postgres`, and `redis`.
- [x] Verify local Docker stack boots successfully.

## Phase 2. Data and backend foundation

- [x] Add Prisma schema for baseline domain entities.
- [x] Add PostgreSQL seed data.
- [x] Add API health endpoint.
- [x] Add platform snapshot endpoint for the admin dashboard.
- [x] Split the API into module-specific endpoints instead of one aggregated snapshot.
- [ ] Add migrations strategy beyond `db push`.

## Phase 3. Frontend shell and UX baseline

- [x] Replace the default Next.js page with a Telegram operations admin shell.
- [x] Apply the command-center visual language.
- [x] Add responsive dashboard sections for overview, campaigns, moderation, autopost, roles, and settings.
- [x] Connect the frontend to the backend via live fetch with fallback handling.
- [x] Add dedicated routed pages per module.
- [x] Render the main admin routes from the approved `stitch/` screens instead of ad-hoc shells.
- [x] Hydrate stitched `dashboard`, `campaigns`, `autopost`, `roles`, and `settings` pages with live API data.

## Phase 4. Auth and RBAC

- [x] Add login flow.
- [x] Add JWT-based auth.
- [x] Add permission-based guards.
- [x] Add role-aware navigation.
- [x] Add action-level permission handling in the UI.
- [x] Add live user management flow with create-user action from the stitched roles page.

## Phase 5. Telegram integration

- [x] Add Telegram bot configuration storage.
- [x] Add Telegram service wrapper.
- [x] Add webhook receiver.
- [-] Add invite-link generation against Telegram API.

## Phase 6. Campaigns and tracking

- [x] Add campaign data model and seed data.
- [x] Add dedicated campaign API routes.
- [-] Add campaign create/update/delete flow in the UI.
- [x] Add campaign create flow directly inside the stitched campaigns page.
- [-] Add invite link event tracking pipeline.

## Phase 7. Autopost and moderation

- [x] Add autopost capability domain model and seed data.
- [x] Add moderation rule domain model and seed data.
- [ ] Add autopost schedule/job entities and API routes.
- [x] Add live moderation member tracking with current `active/left` state.
- [x] Add moderation CSV export from the stitched UI.
- [x] Add manual moderation actions from the stitched `/spam` UI.
- [x] Add structured system logs for Telegram enforcement and moderation actions.
- [x] Add JSON export for system logs from the stitched `/spam` UI.
- [x] Add moderation action logs back onto spam-event rows.

## Phase 8. Realtime, AI, and hardening

- [ ] Add WebSocket gateway.
- [ ] Add queue/worker architecture.
- [x] Add AI settings fields for base URL, token, model selection, and prompt.
- [x] Add AI model loading endpoint with mock-compatible fallback.
- [x] Add env-backed AI defaults with secure DB secret storage and masked reads.
- [x] Add AI moderation service contract.
- [x] Add baseline two-layer anti-spam scoring with rule score + AI score.
- [ ] Add production-grade security hardening.

## Verified Commands

- [x] `apps/web -> npm run lint`
- [x] `apps/web -> npm run build`
- [x] `apps/api -> npm run lint`
- [x] `apps/api -> npm run build`
- [x] `apps/api -> npm run test:e2e -- --runInBand`
- [x] `docker compose up -d --build`
- [x] `GET http://localhost:4000/api/health`
- [x] `GET http://localhost:4000/api/platform`
- [x] `GET http://localhost:4000/api/campaigns`
- [x] `GET http://localhost:4000/api/roles`
- [x] `GET http://localhost:4000/api/settings`
- [x] `POST http://localhost:4000/api/auth/login`
- [x] `GET http://localhost:4000/api/auth/me`
- [x] `operator@nexus.local` is forbidden on `GET http://localhost:4000/api/settings`
- [x] `POST http://localhost:4000/api/campaigns` with bearer token creates a live campaign
- [x] Browser flow: login as operator and create campaign from UI
- [x] `GET http://localhost:4000/api/telegram/status`
- [x] `GET http://localhost:4000/api/telegram/groups`
- [x] `POST http://localhost:4000/api/telegram/discover-groups`
- [x] `POST http://localhost:4000/api/telegram/invite-links`
- [x] `POST http://localhost:4000/api/telegram/mock`
- [x] `POST http://localhost:4000/api/telegram/webhook`
- [x] Webhook join/left payload updates `CommunityMember` live state
- [x] Webhook spam payload returns Telegram enforcement operations (`deleteMessage`, `banChatMember`, `restrictChatMember`, `declineChatJoinRequest`) when applicable
- [x] `GET http://localhost:3000`
- [x] Browser flow: login, load stitched dashboard live data, and navigate to campaigns
- [x] Browser flow: create campaign from stitched campaigns page
- [x] Browser flow: save settings from stitched settings page
- [x] `GET http://localhost:4000/api/moderation/members`
- [x] `GET http://localhost:4000/api/system-logs`
- [x] Browser flow: moderation page shows current member `active/left` state
- [x] Browser flow: moderation CSV download writes `.playwright-cli/moderation-members.csv`
- [x] Browser flow: spam page manual `Ban / Restrict / Allow` updates log and returns Telegram operations banner
- [x] Browser flow: spam page add keyword from UI and persist it
- [x] Browser flow: spam page downloads `.playwright-cli/system-logs.json`
- [x] `GET http://localhost:4000/api/users`
- [x] `POST http://localhost:4000/api/users`
- [x] `POST http://localhost:4000/api/settings/ai/models`
- [x] Browser flow: create user from stitched roles page
- [x] Browser flow: load AI models and save AI prompt from stitched settings page
