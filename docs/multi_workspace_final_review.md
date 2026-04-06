# Multi-Workspace Final Review

## Review goal

Confirm whether the current codebase is ready to start the multi-workspace multi-bot refactor, and identify the minimum safe first step.

---

## Current-state findings

### 1. Bot model is still singleton-oriented

Current schema still contains:

- `TelegramBotConfig`

This is the clearest blocker for multiple active bots by workspace.

### 2. Group model has no workspace or bot ownership

`TelegramGroup` currently does not carry:

- organization scope
- workspace scope
- bot scope

This makes multi-bot ownership ambiguous.

### 3. Campaign model is still too flat

`Campaign` already has assignee support, but still lacks:

- workspace ownership
- bot ownership

This blocks proper team isolation.

### 4. Permission model is still mostly functional

Current roles and permissions are mainly code-based permissions.

Missing:

- workspace membership as a first-class scope table
- separation between global admin and workspace admin

### 5. Member360 direction is good, but scope is not complete yet

`TelegramUser` and `GroupMembershipSession` are useful groundwork.

However, they still need:

- workspace-aware querying
- bot-aware querying
- clearer scope ownership in related entities

---

## Recommendation

Do not start with UI changes.

Start with the minimum foundation in this order:

1. Add `Organization`
2. Add `Workspace`
3. Add `WorkspaceMembership`
4. Add `TelegramBot`
5. Backfill the current deployment into one default organization/workspace/bot

Only after that:

6. Add scope columns to `TelegramGroup`
7. Add scope columns to `Campaign`
8. Re-scope API queries
9. Re-scope UI

---

## Go / No-Go decision

### Go conditions

- schema draft approved
- migration plan approved
- role model approved
- default workspace migration strategy approved

### No-Go conditions

- if team still wants to keep singleton bot config
- if workspace ownership rules are not decided
- if role boundaries are still unclear

---

## Final conclusion

The refactor is feasible.

The codebase already has enough foundations in:

- campaign assignee model
- member360 groundwork
- scoped operator/viewer behavior

But the current schema is not yet ready for real multi-workspace multi-bot production use.

The correct next move is:

- approve the documentation set
- implement foundation schema
- migrate current flat production into one default scoped environment
- then switch reads and writes gradually

