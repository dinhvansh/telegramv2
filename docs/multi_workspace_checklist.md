# Multi-Workspace Delivery Checklist

## Architecture

- [ ] Approve target tenant/workspace/bot model
- [ ] Approve role model with `Super Admin` and `Workspace Admin`
- [ ] Approve ownership rules for groups and campaigns

## Schema

- [ ] Add `Organization`
- [ ] Add `Workspace`
- [ ] Add `WorkspaceMembership`
- [ ] Add `TelegramBot`
- [ ] Extend `TelegramGroup`
- [ ] Extend `Campaign`
- [ ] Extend member-related tables as needed

## Migration

- [ ] Create default organization
- [ ] Create default workspace
- [ ] Migrate current singleton bot config to first `TelegramBot`
- [ ] Backfill existing groups
- [ ] Backfill existing campaigns
- [ ] Backfill workspace memberships

## RBAC

- [ ] Add `Super Admin`
- [ ] Add `Workspace Admin`
- [ ] Re-scope `Moderator`
- [ ] Re-scope `Operator`
- [ ] Re-scope `Viewer`

## API

- [ ] Scope dashboard APIs
- [ ] Scope campaign APIs
- [ ] Scope member APIs
- [ ] Scope member360 APIs
- [ ] Scope moderation APIs
- [ ] Scope autopost APIs

## UI

- [ ] Add workspace selector
- [ ] Add bot selector
- [ ] Update dashboard
- [ ] Update Bot & Moderation
- [ ] Update campaigns
- [ ] Update members
- [ ] Update member360

## Validation

- [ ] Super Admin sees all
- [ ] Workspace Admin sees only owned workspace
- [ ] Operator sees only assigned scope
- [ ] Viewer is read-only
- [ ] Bot sync does not leak across workspace
- [ ] Moderation does not act outside scope
- [ ] Autopost only targets the selected bot/group scope

