# Multi-Workspace Migration Plan

## Goal

Move from the current flat production model to the target multi-workspace multi-bot model with minimal downtime and clear rollback points.

---

## Migration strategy

Use phased expansion, not a big-bang rewrite.

The guiding rule:

- add new scope models first
- backfill data
- switch reads gradually
- switch writes last

---

## Phase 0. Pre-migration review

Before any schema change:

- inventory current bots, groups, campaigns, and active users
- confirm current production assumptions:
  - how many real bots are active
  - how many groups are managed
  - whether campaign assignees are already used in practice
- capture DB backup
- capture current deploy and rollback path

Deliverable:

- signed migration checklist

---

## Phase 1. Add new models without changing reads

Create:

- `Organization`
- `Workspace`
- `WorkspaceMembership`
- `TelegramBot`

Do not yet switch production logic to these tables.

Backfill:

- one default organization
- one default workspace
- one first bot record from `TelegramBotConfig`

Rollback:

- schema additive only, no read path changed

---

## Phase 2. Add scope columns to current business tables

Extend:

- `TelegramGroup`
- `Campaign`
- optionally `CommunityMember`
- optionally `GroupMembershipSession`

Backfill:

- assign the default organization
- assign the default workspace
- assign the first bot record

Rollback:

- read path still old, new columns can remain unused

---

## Phase 3. Dual-read validation

Introduce internal validation queries:

- old query result vs new scoped query result
- compare counts for:
  - campaigns
  - groups
  - members
  - active members

Do not yet switch UI.

Deliverable:

- parity report

Rollback:

- no user-visible change

---

## Phase 4. Switch read paths

Switch API reads for:

- campaigns
- members
- member360
- dashboard
- moderation group lists
- autopost target lists

Rules:

- Super Admin sees all
- Workspace Admin sees assigned workspaces
- others see scoped data only

Rollback:

- feature flag or branch revert to old query layer

---

## Phase 5. Switch write paths

All create/update actions must now require scope context:

- create bot
- sync groups
- create campaign
- create invite link
- autopost
- moderation actions

Rollback:

- revert writes to default workspace only if necessary

---

## Phase 6. Decommission singleton bot model

After stability:

- stop reading from `TelegramBotConfig`
- migrate settings into `TelegramBot`
- archive or remove old singleton path

Rollback:

- only after a stable period, because this is the first destructive phase

---

## Data mapping rules

## Existing bot config

Map the current singleton config to:

- one `Organization`
- one `Workspace`
- one `TelegramBot`

## Existing groups

Map all active groups to:

- the default workspace
- the migrated bot record

## Existing campaigns

Map all campaigns to:

- the default workspace
- the migrated bot record
- their existing group relation when available

## Existing users

Create `WorkspaceMembership` for current internal users based on:

- current roles
- current assignee relations
- current operational scope assumptions

---

## Rollback plan

Each phase must have an exit point:

### Safe rollback phases

- Phase 1
- Phase 2
- Phase 3

These are additive and can be rolled back at code level while keeping DB changes.

### Controlled rollback phases

- Phase 4
- Phase 5

Requires:

- restore previous code
- preserve additive schema
- keep data written into new scope fields

### Hard rollback phase

- Phase 6

Do not execute until stable and fully validated.

---

## Validation checklist

- Can Super Admin see all workspaces?
- Can Workspace Admin see only their workspace?
- Can Operator only see assigned campaigns?
- Do group syncs assign the correct bot?
- Does dashboard show the correct scoped metrics?
- Does autopost only target groups for the selected bot?
- Does moderation only act inside the correct workspace context?

