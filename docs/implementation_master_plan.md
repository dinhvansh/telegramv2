# Telegram Operations Platform Implementation Master Plan

## Objective

Build a production-ready Telegram operations platform in a scientific order, starting from product and system foundations, then shipping the operational modules in dependency order:

- Dashboard and analytics
- Campaign and invite link management
- User join tracking
- Anti-spam and moderation
- Autopost scheduling
- RBAC and system settings
- Real-time monitoring
- AI moderation expansion

## Source Inputs

- `telegram_operations_platform_architecture_business_flow.md`
- `telegram_operations_platform_ai_build_spec.md`
- `telegram_operations_platform_ai_execution_workflow.md`
- `stitch/nexus_terminal/DESIGN.md`
- UI mockups under `stitch/*/code.html`

## Delivery Principles

- Build foundations first, not features in isolation.
- Treat the system as a modular monolith in the first stage.
- Keep UX aligned with the "Digital Command" design system.
- Push event-heavy and slow work to background jobs.
- Verify every implemented step with lint, build, and smoke checks.

## Phase Plan

### Phase 0. Documentation and input normalization

- [ ] Normalize all Vietnamese documents to UTF-8.
- [ ] Consolidate the final product scope.
- [ ] Extract reusable design tokens and UX rules from `DESIGN.md`.
- [ ] Convert the current HTML mockups into a single module map.
- [ ] Mark what is MVP versus later-phase scope.

### Phase 1. Repo and environment foundation

- [ ] Create the project workspace structure.
- [ ] Add `apps/web` for the admin frontend.
- [ ] Add `apps/api` for the backend service.
- [ ] Add `packages/ui`, `packages/types`, and shared config as needed.
- [ ] Set up local infrastructure targets: PostgreSQL and Redis.
- [ ] Define `.env.example` files.
- [ ] Add lint, build, and test scripts.

### Phase 2. Product architecture and schema design

- [ ] Finalize module boundaries: auth, campaigns, telegram, autopost, spam, analytics, settings.
- [ ] Design the core database schema.
- [ ] Add migration tooling.
- [ ] Add seed data for local development.
- [ ] Document event contracts and queue routing.

### Phase 3. Frontend shell and design system implementation

- [ ] Build the admin shell with sidebar, topbar, search, notifications, and content canvas.
- [ ] Implement the surface hierarchy and no-line rule.
- [ ] Implement shared primitives: buttons, cards, tables, badges, forms.
- [ ] Port the current mockup modules into a coherent application UI.
- [ ] Add responsive behavior for desktop and mobile.

### Phase 4. Auth and RBAC

- [ ] Add login, logout, token refresh, and session flows.
- [ ] Implement users, roles, permissions, user-role mappings, and role-permission mappings.
- [ ] Apply permission checks in the backend.
- [ ] Apply permission-based navigation and actions in the frontend.

### Phase 5. Telegram core integration

- [ ] Configure bot token handling.
- [ ] Add Telegram group and account binding.
- [ ] Add webhook receiver endpoints.
- [ ] Add Telegram Bot API service wrappers.
- [ ] Log important integration failures and retries.

### Phase 6. Campaign and invite links

- [ ] Implement campaign CRUD.
- [ ] Generate and store invite links per campaign.
- [ ] Bind invite links to target Telegram groups.
- [ ] Build list and detail pages for campaigns.
- [ ] Show performance snapshots by campaign and by link.

### Phase 7. User join tracking

- [ ] Receive join events from Telegram webhook flows.
- [ ] Push join events into queue processing.
- [ ] Map join events to campaigns and invite links.
- [ ] Update campaign metrics.
- [ ] Expose recent joins and member history in the admin UI.

### Phase 8. Dashboard and analytics

- [ ] Build KPI cards for joins, active links, autopost volume, and spam prevention.
- [ ] Build campaign performance tables and growth visualizations.
- [ ] Build recent activity and system health panels.
- [ ] Aggregate metrics in dedicated analytics tables or jobs.

### Phase 9. Autopost

- [ ] Implement template management.
- [ ] Implement autopost schedule CRUD.
- [ ] Add worker-based dispatch.
- [ ] Add send logs and failure handling.
- [ ] Show execution state in the admin UI.

### Phase 10. Anti-spam and moderation

- [ ] Implement rule-based moderation.
- [ ] Add blacklist management for keywords and domains.
- [ ] Add rate limits and new-user restrictions.
- [ ] Add moderation actions: warning, delete, mute, ban.
- [ ] Build the moderation dashboard and audit trail.

### Phase 11. Real-time events

- [ ] Add WebSocket gateway.
- [ ] Add authenticated subscriptions and room strategy.
- [ ] Emit events for joins, metrics, spam, autopost, and system alerts.
- [ ] Update dashboard and moderation UI in real time.

### Phase 12. AI moderation

- [ ] Add AI moderation service contract.
- [ ] Score suspicious content using message text, links, and history.
- [ ] Combine rule-based and AI-based risk scoring.
- [ ] Add manual review feedback loop.

### Phase 13. Hardening and production readiness

- [ ] Encrypt sensitive tokens.
- [ ] Add audit logs and security controls.
- [ ] Add queue retry and dead-letter handling.
- [ ] Add indexing and performance tuning.
- [ ] Add monitoring, backups, and deployment documentation.

## Definition of Done

A phase is done only when:

- The code compiles.
- Lint passes.
- The local build passes.
- The feature has a visible UI or API entrypoint.
- Basic error states are handled.
- The change is reflected in documentation.
