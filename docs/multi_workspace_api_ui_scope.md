# Multi-Workspace API and UI Scope Notes

## Goal

Define how API and UI should behave when the system moves to multi-workspace multi-bot scope.

---

## Scope resolution order

Every request should resolve scope in this order:

1. Is the user `Super Admin`?
2. Which workspace memberships does the user have?
3. Is the page or API selecting one workspace explicitly?
4. Is there a bot selector inside that workspace?
5. Is there an assignee-only restriction?

---

## API guidelines

## Dashboard

Inputs:

- optional `organizationId`
- optional `workspaceId`
- optional `telegramBotId`

Behavior:

- Super Admin may query all
- Workspace Admin only for owned workspaces
- Operator/Viewer only for allowed scope

## Campaign APIs

All list/detail APIs must be scope-aware.

Required write inputs:

- `workspaceId`
- `telegramBotId`
- `telegramGroupId`

## Member APIs

List and detail APIs must resolve:

- workspace
- bot
- campaign assignee rules

## Moderation APIs

Moderation actions must validate:

- the current user may act in that workspace
- the target group belongs to the current bot/workspace scope

## Autopost APIs

Autopost schedules must only accept:

- target groups from the selected workspace and bot

---

## UI guidelines

## Navigation

The shell should support:

- organization selector for Super Admin
- workspace selector where applicable
- bot selector in bot-centric pages

## Bot & Moderation

This page should answer:

- which bot is active
- which workspace it belongs to
- how many groups it manages
- which groups have moderation enabled

## Campaign UI

Add visible scope columns:

- workspace
- bot
- assignee

## Member UI

Every member-focused screen should clearly show:

- workspace
- group
- campaign
- assignee

## Member360 UI

The profile should never mix records from different scopes without showing where they belong.

---

## Security rules

1. Never rely on UI-only hiding.
2. Scope must be enforced in API queries.
3. Super Admin bypass must be explicit, not accidental.
4. Workspace Admin must never inherit global admin power.
5. Cross-workspace joins must be blocked unless explicitly allowed.

