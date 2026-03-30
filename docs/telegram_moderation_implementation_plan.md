# Telegram Moderation Implementation Plan

## 1. Purpose

This plan translates `docs/telegram_moderation_dev_spec_full.md` into an implementation sequence that fits the current repository.

Goals of this plan:

- keep the CRM-first moderation model
- reuse existing modules instead of creating duplicate architecture
- define delivery phases with low integration risk
- separate MVP from later hardening

## 2. High-Level Assessment of the Spec

The spec is directionally correct and matches the intended product model:

- bot config starts in CRM
- webhook and group discovery live in CRM
- moderation config is stored per group
- rule engine decides first
- AI is optional
- Telegram Bot API is execution only
- full debug trail is required

However, the spec is larger than what should be built in one pass.

Main reason:

- the current repo already has partial Telegram + moderation foundations
- some requested tables overlap with current Prisma models
- phase 1 in the spec includes too many concerns at once:
  - bot setup
  - group sync
  - moderation settings
  - warning engine
  - antiflood
  - AI
  - raw/process/action logs
  - debug UI

If built exactly as one block, the implementation risk will be high.

## 3. Current Repo Fit

Existing backend foundations already present:

- `telegram` module
  - config persistence
  - webhook registration
  - group discovery
  - webhook handling
- `moderation` module
  - policy config
  - rule evaluation
  - manual actions
- `telegram-actions` module
  - Telegram Bot API execution
- `settings` module
  - encrypted settings storage
  - AI config resolution
- `system-logs` module
  - audit trail

Existing data models already present:

- `TelegramGroup`
- `ModerationPolicy`
- `ModerationKeyword`
- `ModerationDomain`
- `SpamEvent`
- `SystemSetting`
- `SystemLog`

Conclusion:

- do not create a brand-new moderation subsystem
- extend the current one
- convert the current moderation model from "keyword/domain scoring" into a broader CRM-managed rule system

## 4. Gaps Between Spec and Repo

The current repo is missing these required capabilities:

### Backend gaps

- bot verification endpoint separate from config save
- persistent bot metadata/state model
- webhook state model richer than current settings-only storage
- group lifecycle sync from `my_chat_member` and `chat_member`
- per-group moderation settings screen contract
- content lock matrix
- warning counter table
- antiflood service using Redis
- raw webhook log model
- processing log model
- execution log model separated for filtering/debug
- trace ID per event
- richer normalized event parser
- explicit decision mapping like `delete_only`, `delete_and_warn`, `delete_and_kick`

### Frontend gaps

- Telegram bot config screen is not a real control center yet
- groups list screen does not exist as a real CRM screen
- group moderation settings screen does not exist in full form
- warnings screen does not exist
- logs list/detail debug screens do not exist

### Architecture gaps

- webhook pipeline still does too much synchronously
- current moderation logic is still score-centric
- current UI still mixes snapshot/demo concerns with real CRM workflows

## 5. Design Decisions Before Implementation

These should be treated as project decisions, not coding details.

### Decision 1: Reuse current tables where possible

Do this:

- keep `TelegramGroup`
- keep `ModerationPolicy`
- keep `SpamEvent`
- keep `SystemSetting`
- keep `SystemLog`

Add new tables only for data that is truly missing:

- bot config state
- warnings
- raw logs
- processing logs
- execution logs
- antiflood state stays in Redis, not PostgreSQL

### Decision 2: Keep AI out of core MVP

AI should not block the first usable moderation release.

MVP should work with:

- lock rules
- warning engine
- antiflood
- action executor
- logs/debug

AI should be added only after deterministic behavior is stable.

### Decision 3: Add queue only when webhook complexity becomes unsafe

Phase 1 can remain synchronous if:

- raw logs are stored first
- failures are isolated
- webhook always returns safely

But the code should be structured so that queue extraction is easy later.

Recommended approach:

- implement service boundaries as if async worker exists
- keep execution inline initially
- move to BullMQ in phase 4 or phase 5

### Decision 4: Use per-group settings table for the lock matrix

The spec's table `telegram_group_moderation_settings` is valid for the lock-oriented MVP.

Recommended position:

- keep current `ModerationPolicy` for higher-level policy
- add a dedicated per-group settings record for operational moderation controls

Reason:

- the spec needs many boolean lock toggles
- this maps directly to the CRM form
- it avoids overloading `ModerationPolicy` too early

## 6. Recommended Delivery Phases

## Phase 1: Bot Config + Group Sync Foundation

### Goal

Make CRM own bot setup and group registration lifecycle.

### Backend scope

- extend `telegram` module
- add persistent bot config state
- add `verify bot` endpoint
- add richer `register webhook` status persistence
- improve `discover groups`
- add `my_chat_member` and `chat_member` lifecycle sync
- auto-create default moderation settings for newly discovered groups

### Frontend scope

- build Telegram Bot Configuration screen
- build Telegram Groups list screen

### Data scope

Add:

- `TelegramBotConfig` table or equivalent strongly typed config model
- new fields on `TelegramGroup`:
  - chat type
  - username
  - active status
  - discovered source
  - last synced timestamp

### Acceptance

- admin can save bot config in CRM
- admin can verify bot
- admin can register webhook
- admin can discover groups
- bot add/remove updates sync group lifecycle automatically

### Why first

Nothing else should be built before the bot lifecycle is trustworthy in CRM.

## Phase 2: Group Moderation Settings MVP

### Goal

Store and edit per-group moderation rules from the CRM.

### Backend scope

- add `telegram_group_moderation_settings`
- add API:
  - `GET /api/telegram/groups`
  - `GET /api/telegram/groups/:groupId/moderation`
  - `PUT /api/telegram/groups/:groupId/moderation`
- add validation rules from the spec

### Frontend scope

- build Group Moderation Settings screen
- include:
  - moderation enabled
  - content locks
  - warning rules
  - antiflood config
  - AI config toggles
  - advanced logging toggles

### Acceptance

- every discovered group can have a saved moderation profile
- settings survive reload and are visible in CRM

### Why second

The runtime engine cannot be finalized before the CRM settings model is stable.

## Phase 3: Runtime Parser + Lock Engine + Warning Engine

### Goal

Make incoming Telegram message moderation actually follow CRM settings.

### Backend scope

- add trace ID generation
- add raw log persistence first
- normalize Telegram update into a structured event
- handle:
  - `message`
  - `edited_message`
  - `my_chat_member`
  - `chat_member`
- build lock detectors:
  - url
  - invitelink
  - forward
  - email
  - phone
  - bot sender
  - photo
  - video
  - document
  - sticker
- build warning engine:
  - increment warning count
  - escalate at warn limit
  - reset after escalation

### Data scope

Add:

- `telegram_group_user_warnings`
- `telegram_webhook_raw_logs`
- `telegram_message_processing_logs`

### Execution scope

Map decisions to executor:

- `delete_only`
- `delete_and_warn`
- `delete_and_mute`
- `delete_and_tmute`
- `delete_and_kick`
- `delete_and_ban`
- `delete_and_tban`

### Acceptance

- a locked URL is deleted according to config
- warnings increment and reset correctly
- every event has raw log + processing log + trace ID

### Why third

This is the first end-to-end moderation milestone that behaves like a real product.

## Phase 4: Antiflood + Execution Log Hardening

### Goal

Add burst protection and make runtime debug reliable.

### Backend scope

- implement antiflood service with Redis
- support:
  - message count threshold
  - time window
  - action mapping
  - delete current only vs delete burst
- add dedicated `telegram_action_execution_logs`
- save request/response payloads for each action
- guarantee webhook does not crash on action failure

### Frontend scope

- build Warnings screen
- build Moderation Logs list

### Acceptance

- repeated burst messages trigger configured flood action
- failed Telegram API calls are visible in logs

### Why fourth

Antiflood and execution reliability are operational concerns that should land after the deterministic lock flow is already correct.

## Phase 5: Debug Workbench

### Goal

Allow operators to trace a single moderation event from raw Telegram input to final Telegram action.

### Backend scope

- add `GET /api/telegram/groups/:groupId/logs`
- add `GET /api/telegram/logs/:traceId`
- filters:
  - date range
  - user id
  - message id
  - event type
  - matched rule
  - decision
  - status
  - AI used

### Frontend scope

- build logs list screen
- build trace detail/debug screen

### Acceptance

- an operator can inspect raw payload, normalized event, config snapshot, decision, and action execution under one trace

### Why fifth

The debug surface becomes valuable only after logging and runtime flow are already in place.

## Phase 6: Optional AI Moderation

### Goal

Add AI only where rule engine is insufficient.

### Backend scope

- use current AI config resolution from `settings`
- add AI call policy:
  - `off`
  - `fallback_only`
  - `suspicious_only`
- store normalized AI result in processing logs
- support threshold and optional override action

### Acceptance

- AI is called only under configured conditions
- AI output never removes the raw rule-based explanation

### Why sixth

AI before deterministic moderation will make the system harder to trust and debug.

## Phase 7: Queue Extraction

### Goal

Move runtime processing out of webhook when throughput and reliability require it.

### Backend scope

- add BullMQ
- enqueue webhook processing after raw log persistence
- separate worker for moderation processing
- optionally separate execution worker for Telegram API calls

### Acceptance

- webhook returns quickly
- processing is resilient to slow AI or Telegram action latency

### Why last

Do this when needed, not before the business logic is stable.

## 7. Module-Level Work Breakdown

## `apps/api/src/telegram`

Add or extend:

- bot config state service
- verify bot use case
- register webhook use case
- group sync use case
- lifecycle sync handler for `my_chat_member` / `chat_member`
- webhook raw logging entrypoint
- normalized event parser

## `apps/api/src/moderation`

Add or extend:

- per-group settings service
- lock detectors
- warning engine
- decision mapper
- antiflood orchestration
- AI moderation orchestration
- processing log writer

## `apps/api/src/telegram-actions`

Add or extend:

- explicit support for:
  - temporary mute
  - temporary ban
  - kick wrapper
  - send warning message
- dedicated execution log persistence
- robust error capture

## `apps/api/src/system-logs`

Keep for audit-level logs, but do not use it as the only debug store.

Use dedicated moderation log tables for:

- raw webhook
- processing
- action execution

## `apps/web`

Recommended route rollout:

- `/telegram`
  - bot config
  - groups list
- `/telegram/groups/[id]/moderation`
- `/telegram/groups/[id]/warnings`
- `/telegram/groups/[id]/logs`
- `/telegram/logs/[traceId]`

## 8. Suggested Prisma Data Model Strategy

Recommended model changes:

### Add new models

- `TelegramBotConfig`
- `TelegramGroupModerationSettings`
- `TelegramGroupUserWarning`
- `TelegramWebhookRawLog`
- `TelegramMessageProcessingLog`
- `TelegramActionExecutionLog`

### Extend existing models

- `TelegramGroup`
  - type
  - username
  - isActive
  - discoveredFrom
  - lastSyncedAt
- optionally `SpamEvent`
  - either keep for aggregate moderation history
  - or reduce its role once detailed logs exist

### Keep but do not over-expand immediately

- `ModerationPolicy`
- `ModerationKeyword`
- `ModerationDomain`

Reason:

- these can still power higher-level rule enrichment
- phase 1 lock matrix should not be blocked by redesigning the whole current policy model

## 9. Main Risks

### Risk 1: Too much in one phase

The provided spec groups too many features into phase 1.

Mitigation:

- split into the phases defined above

### Risk 2: Duplicate data models

The spec defines SQL tables that overlap conceptually with current Prisma models.

Mitigation:

- adapt the spec into Prisma extensions, not raw parallel schema design

### Risk 3: Webhook becomes too heavy

If raw logging, parsing, moderation, AI, and Telegram execution all stay inline, latency and reliability will degrade.

Mitigation:

- store raw log first
- keep service boundaries async-ready
- extract queue later if needed

### Risk 4: AI muddies product behavior

If AI decides too early, moderation will become hard to predict.

Mitigation:

- ship deterministic lock/warn/flood first

### Risk 5: Telegram permission mismatch

Bot may be present in the group but missing required admin rights.

Mitigation:

- store rights snapshot per group
- show degraded status in CRM
- avoid silent execution failures

## 10. Recommended First Sprint

If starting now, the first sprint should be:

### Backend

- add bot verification endpoint
- add richer bot config persistence
- extend `TelegramGroup` with lifecycle fields
- handle `my_chat_member` and `chat_member`
- create default moderation settings record for new groups
- add `GET /api/telegram/groups`

### Frontend

- build Telegram Bot Configuration screen
- build Telegram Groups list screen

### Outcome

- CRM becomes the real control plane for Telegram onboarding
- groups appear automatically after discovery or lifecycle sync
- project is ready for per-group moderation settings in the next sprint

## 11. Recommended Second Sprint

- add moderation settings model and API
- build Group Moderation Settings screen
- implement lock detectors and warning engine
- add raw log + processing log persistence

This is the first sprint where moderation becomes operational.

## 12. Final Recommendation

The provided spec should be implemented, but not as a single large phase.

Best path for this repo:

1. Bot config and group sync foundation
2. Per-group moderation settings
3. Lock engine and warning engine
4. Antiflood and execution hardening
5. Debug workbench
6. AI moderation
7. Queue extraction

That order preserves the CRM-first architecture, keeps reuse of current modules, and minimizes rewrite risk.
