# Multi-Workspace Schema Draft

## Goal

Draft the minimum schema changes required to move from the current flat model to a scoped multi-workspace multi-bot model.

This is a draft, not an applied migration.

---

## New models

## Organization

Suggested fields:

- `id`
- `name`
- `slug`
- `status`
- `createdAt`
- `updatedAt`

## Workspace

Suggested fields:

- `id`
- `organizationId`
- `name`
- `slug`
- `description`
- `status`
- `createdAt`
- `updatedAt`

Indexes:

- unique `(organizationId, slug)`

## WorkspaceMembership

Suggested fields:

- `id`
- `workspaceId`
- `userId`
- `roleId`
- `status`
- `createdAt`
- `updatedAt`

Indexes:

- unique `(workspaceId, userId, roleId)` or unique `(workspaceId, userId)` if one role per workspace

## TelegramBot

Suggested fields:

- `id`
- `organizationId`
- `workspaceId`
- `externalBotId`
- `username`
- `displayName`
- `tokenEncrypted`
- `webhookSecretEncrypted`
- `publicBaseUrl`
- `webhookUrl`
- `isVerified`
- `webhookRegistered`
- `lastVerifiedAt`
- `lastSyncedAt`
- `isActive`
- `createdAt`
- `updatedAt`

Indexes:

- unique `(workspaceId, username)` when username exists
- unique `externalBotId` when verified

---

## Existing models to extend

## User

Keep the existing global user table.

Add optional:

- `organizationId` only if global tenancy needs direct ownership

Preferred scoping remains through `WorkspaceMembership`.

## TelegramGroup

Add:

- `organizationId`
- `workspaceId`
- `telegramBotId`

Keep:

- `externalId`
- `title`
- `username`
- `type`
- permission flags
- moderation settings relation

Add rule:

- active group mapping must be unique for the same real chat id

## Campaign

Add:

- `organizationId`
- `workspaceId`
- `telegramBotId`

Keep:

- `telegramGroupId`
- `assigneeUserId`

## TelegramUser

Keep as the global customer identity record.

No workspace field needed on the base identity itself.

Scope should come from:

- `CommunityMember`
- `GroupMembershipSession`
- `Campaign`

## CommunityMember

Keep as the current-state relationship per group.

Add or ensure:

- `organizationId`
- `workspaceId`
- `telegramBotId`

These can be denormalized for faster scoped queries if needed.

## GroupMembershipSession

Keep for historical session tracking.

Add or derive:

- `organizationId`
- `workspaceId`
- `telegramBotId`

If not stored directly, they must be resolvable through relations.

---

## Suggested relation graph

- `Organization` -> many `Workspace`
- `Workspace` -> many `WorkspaceMembership`
- `Workspace` -> many `TelegramBot`
- `Workspace` -> many `TelegramGroup`
- `Workspace` -> many `Campaign`
- `TelegramBot` -> many `TelegramGroup`
- `TelegramBot` -> many `Campaign`
- `TelegramGroup` -> many `Campaign`
- `TelegramUser` -> many `CommunityMember`
- `CommunityMember` -> many `GroupMembershipSession`

---

## Data ownership rules

1. A `TelegramBot` belongs to exactly one workspace.
2. A `TelegramGroup` belongs to exactly one active bot and one workspace at a time.
3. A `Campaign` belongs to exactly one workspace, one bot, and one group.
4. A `WorkspaceMembership` decides whether an internal user may act inside a workspace.
5. A `TelegramUser` is global; scope is applied through relationships, not by duplicating the user.

---

## Migration notes

Current singleton tables or flat models:

- `TelegramBotConfig`
- `TelegramGroup`
- `Campaign`

must be migrated carefully.

Recommended first migration rule:

- create one default `Organization`
- create one default `Workspace`
- create one first `TelegramBot` from the current singleton config
- assign all current groups and campaigns into that workspace and bot

---

## Questions to settle before implementation

- One role per workspace or many roles per workspace?
- Should `Workspace Admin` be allowed to create users by default?
- Do we need per-campaign scope grants beyond workspace membership?
- Should archived group ownership remain queryable in the main UI?

