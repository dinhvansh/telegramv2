# Master Checklist

Quy ước:

- `[x]` xong
- `[-]` đang làm hoặc đã có baseline nhưng chưa production-ready
- `[ ]` chưa làm

## Foundation

- [x] Docker local
- [x] Docker production
- [x] VPS CI/CD cơ bản
- [x] API healthcheck
- [-] Env production chuẩn hóa hoàn toàn
- [-] UTF-8 cleanup toàn repo

## Auth và RBAC

- [x] JWT login
- [x] `auth/me`
- [x] Page gating
- [x] API permission guard
- [x] RBAC theo workspace baseline
- [-] Data scope chặt hoàn toàn cho mọi query

## Telegram

- [x] Bot config
- [x] Verify bot
- [x] Register webhook
- [x] Discover groups
- [x] Telegram action service
- [-] Verify full end-to-end trên group thật cho mọi action

## Campaign

- [x] Campaign list/create cơ bản
- [x] Invite link create cơ bản
- [-] Invite link tracking production-ready

## Members

- [x] Member list
- [x] Active/left state
- [x] Member 360 baseline
- [-] Customer mapping hoàn chỉnh

## Moderation

- [x] Rule engine baseline
- [x] Spam log
- [x] Manual action
- [x] System log
- [-] Hardening score/rule tuning

## Autopost

- [x] Targets
- [x] Schedules
- [x] Dispatch baseline
- [-] Scheduler/hardening đầy đủ

## Contacts import

- [x] QR login baseline
- [x] JSON import mảng phẳng
- [x] JSON import `contacts.list`
- [-] Delay an toàn hơn để giảm risk
- [ ] Batch queue
- [ ] Progress UI
- [ ] Retry/cancel batch
- [ ] Mapping sang customer/lead
- [ ] Frequent contacts enrichment

## AI

- [x] AI settings
- [x] Load model baseline
- [x] AI moderation baseline
- [-] AI caption/autopost tách prompt riêng

## Vận hành

- [x] Live debug runbook
- [x] n8n webhook setup doc
- [x] VPS CI/CD doc
- [ ] Backup/restore doc hoàn chỉnh
