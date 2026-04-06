# Multi-Workspace Bot Architecture

## Goal

Extend the current system from:

- one CRM deployment
- one primary bot configuration
- many Telegram groups and campaigns

to a model that supports:

- one company or many tenants
- many workspaces or teams
- one or more bots per workspace
- many groups, campaigns, operators, and moderators per workspace
- clear data scoping for dashboard, moderation, autopost, and members

---

## Why the current model will not scale

The current codebase is still close to a single-environment model:

- `TelegramBotConfig` is effectively a singleton
- `TelegramGroup` is not scoped by tenant/workspace/bot
- `Campaign` is not scoped by tenant/workspace/bot
- permissions are mostly functional, not scope-aware
- dashboard and member queries assume a mostly flat operating space

This becomes fragile when one company wants:

- multiple teams
- multiple bots
- different moderation policies per team
- operators who must only see their own workspace or assigned campaigns

---

## Design principles

1. Every business object must have an explicit scope.
2. Bot configuration must become a first-class entity, not a singleton.
3. Groups must belong to one workspace and one active bot at a time.
4. Campaigns must belong to one workspace and one bot context.
5. Internal-user permissions must combine:
   - functional permissions
   - scope permissions
6. Dashboard, moderation, autopost, and member views must always resolve data inside the active scope.

---

## Target model

## 1. Organization

Represents a tenant or company.

Examples:

- Company A
- Company B

## 2. Workspace

Represents one working unit inside an organization.

Examples:

- Sales
- Support
- Affiliate
- Community Ops

Relationships:

- one `Organization` has many `Workspace`
- one `Workspace` has many bots, groups, campaigns, and users

## 3. TelegramBot

Replaces the singleton `TelegramBotConfig`.

Each bot becomes its own record:

- token
- username
- display name
- external bot id
- webhook secret
- public base URL
- verification status
- webhook status
- ownership by workspace

Relationships:

- one `Workspace` has many `TelegramBot`
- one `TelegramBot` manages many `TelegramGroup`

## 4. TelegramGroup

Every Telegram group must belong to:

- one organization
- one workspace
- one active bot

Rules:

- one real Telegram group can only have one active management record at a time
- when the same group is moved to another bot, the old managed record must become inactive or archived

## 5. Campaign

Every campaign must belong to:

- one organization
- one workspace
- one bot
- one Telegram group
- one internal assignee

This ensures:

- the campaign is owned by a team
- the correct bot creates and tracks invite links
- operators only see the campaigns they own or are assigned to

## 6. Member / Customer

Each Telegram user must be traceable through:

- organization
- workspace
- bot
- group
- campaign
- session history

`Member360` must support:

- one Telegram user in multiple groups
- repeated join/leave cycles
- moderation history scoped to the correct bot/group/workspace

---

## RBAC model

## Global role

### Super Admin

Global scope across the entire system.

Can:

- create organizations
- create workspaces
- create bots for any workspace
- create internal accounts for any organization/workspace
- assign roles
- move users between workspaces
- view all dashboards, groups, campaigns, members, moderation, autopost
- manage global settings

## Workspace roles

### Workspace Admin

Admin inside one workspace, not globally.

Can:

- manage campaigns in that workspace
- assign campaign owners in that workspace
- configure bots, groups, moderation, and autopost in that workspace
- manage members, owners, notes, and operations in that workspace
- view workspace dashboard and member360
- create workspace-level users if policy allows

Cannot:

- create organizations
- touch other workspaces
- view other workspace data
- change global settings

### Moderator

Can:

- review moderation queue
- inspect campaigns and members in workspace scope
- perform moderation actions in workspace scope

### Operator

Can:

- view assigned campaigns
- view members belonging to assigned campaigns or workspace scope
- perform approved operational tasks if granted

### Viewer

Can:

- view only
- no edit actions
- scope limited to assigned workspace or campaigns

---

## Permission model

Functional permission alone is not enough.

The target model must combine:

- permission code
- scope type
- scope id

Examples:

- `campaign.manage` in workspace `sales`
- `moderation.review` in workspace `support`
- `campaign.view` for assigned campaigns only

Recommended support model:

- `User`
- `Role`
- `WorkspaceMembership`
- optional future `UserScopeGrant`

---

## Operational flows

## Bot onboarding

1. Super Admin or Workspace Admin chooses a workspace
2. Bot token is entered
3. Bot is verified
4. Bot is attached to the workspace
5. Groups are synced for that bot
6. Existing active records for the same real group under another bot become inactive

## Group sync

1. Bot fetches or receives groups
2. Each group is mapped to `Organization + Workspace + Bot`
3. If an older active mapping exists for the same chat, the old mapping is archived

## Campaign creation

1. Choose workspace
2. Choose bot
3. Choose group
4. Choose assignee
5. Create invite link or join-request flow

## Operator view

Operator only sees:

- the workspace they belong to
- the bot(s) inside that workspace
- the groups in that workspace
- the campaigns assigned to them or visible in their scope

---

## Dashboard model

Dashboard should support 3 levels:

- organization-wide
- workspace-level
- bot-level

Recommended widgets:

- active bots by workspace
- active groups by bot
- member growth by group
- user activity rate by group
- campaign ownership and workload by assignee

---

## Moderation and Autopost

## Moderation

Moderation policy remains per-group, but each group is already scoped by workspace and bot.

This allows:

- team A to have policy A
- team B to have policy B

without data mixing.

## Autopost

Autopost schedules must be scoped by:

- workspace
- bot
- target groups

This guarantees:

- bot A only posts into bot A groups
- bot B only posts into bot B groups

---

## UI implications

## Bot & Moderation

Must add selectors for:

- Organization
- Workspace
- Bot

The page should answer:

- which bot is active for this workspace
- how many groups it manages
- which groups have moderation enabled

## Campaigns

Campaign list should include:

- Workspace
- Bot
- Assignee

## Member360

Must show:

- which workspace the member belongs to
- which bot/group currently owns the relationship

---

## Implementation phases

### Phase 1. Foundation scope

- add `Organization`
- add `Workspace`
- add `WorkspaceMembership`

### Phase 2. Multi-bot model

- create `TelegramBot`
- replace singleton `TelegramBotConfig`
- migrate the current bot config into the first bot record

### Phase 3. Scope groups and campaigns

- add `organizationId`, `workspaceId`, `telegramBotId` to `TelegramGroup`
- add `organizationId`, `workspaceId`, `telegramBotId` to `Campaign`
- migrate existing data

### Phase 4. Scope RBAC

- add `Super Admin`
- add `Workspace Admin`
- scope API queries and UI visibility

### Phase 5. UI rollout

- workspace-aware Bot & Moderation
- workspace-aware Campaigns
- workspace-aware Dashboard
- workspace-aware Member360

---

## Risks

1. Existing data is still flat, so migration must be explicit.
2. Group ownership transfer between bots needs a clear archive policy.
3. Dashboard snapshot logic must be rewritten around scope.
4. Autopost and moderation queries must be rechecked to prevent cross-workspace leakage.

---

## Done criteria

- one organization can have many workspaces
- one workspace can have many bots
- one bot can manage many groups
- every campaign belongs to the correct workspace, bot, and group
- operators only see the correct workspace/campaign data
- Workspace Admin only manages their own workspace
- Super Admin has system-wide power
- dashboard can be filtered by workspace and bot

