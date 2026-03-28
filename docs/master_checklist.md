# Telegram Operations Platform Master Checklist

## How To Use

- ÄÃ¡nh dáº¥u `[x]` khi hoÃ n thÃ nh vÃ  Ä‘Ã£ verify.
- DÃ¹ng `[-]` cho pháº§n Ä‘ang lÃ m.
- DÃ¹ng `[ ]` cho pháº§n chÆ°a báº¯t Ä‘áº§u.
- Má»—i láº§n xong má»™t háº¡ng má»¥c lá»›n thÃ¬ cáº­p nháº­t thÃªm ngÃ y hoáº·c ghi chÃº ngáº¯n ngay bÃªn dÆ°á»›i.

## 1. Foundation

- [x] Táº¡o `apps/web`
- [x] Táº¡o `apps/api`
- [x] Táº¡o `docs/`
- [x] Táº¡o local Docker stack vá»›i `web`, `api`, `postgres`, `redis`
- [x] Dá»±ng admin shell baseline
- [x] Táº¡o master execution plan
- [x] Táº¡o task tracker chi tiáº¿t
- [ ] Chuáº©n hÃ³a toÃ n bá»™ tÃ i liá»‡u tiáº¿ng Viá»‡t sang UTF-8

## 2. Frontend Admin

- [x] Dá»±ng layout command-center
- [x] Dá»±ng overview dashboard
- [x] Dá»±ng section campaigns
- [x] Dá»±ng section moderation
- [x] Dá»±ng section autopost
- [x] Dá»±ng section roles
- [x] Dá»±ng section settings
- [x] Ná»‘i frontend vá»›i API snapshot
- [x] TÃ¡ch thÃ nh routed pages riÃªng cho tá»«ng module
- [x] DÃ¹ng UI source tá»« `stitch/` cho cÃ¡c route chÃ­nh
- [ ] ThÃªm form táº¡o campaign tá»« UI
- [x] ThÃªm form táº¡o campaign tá»« UI
- [x] Nối live data và action vào các page `stitch/` chính
- [x] Thêm form tạo user từ UI phân quyền
- [x] Thêm block cấu hình AI vào settings
- [-] ThÃªm CRUD tháº­t trÃªn UI
- [ ] ThÃªm loading, empty state, error state hoÃ n chá»‰nh
- [x] ThÃªm auth UI

## 3. Backend API

- [x] Táº¡o NestJS app
- [x] ThÃªm health endpoint
- [x] ThÃªm platform snapshot endpoint
- [x] ThÃªm campaigns endpoint
- [x] ThÃªm roles endpoint
- [x] ThÃªm settings endpoint
- [x] ThÃªm users endpoint
- [x] ThÃªm auth endpoint
- [ ] ThÃªm autopost schedules endpoint
- [ ] ThÃªm moderation actions endpoint
- [ ] ThÃªm audit logs endpoint
- [x] ThÃªm AI model loading endpoint

## 4. Database

- [x] Táº¡o Prisma schema
- [x] Seed dá»¯ liá»‡u ná»n
- [x] Push schema lÃªn PostgreSQL local
- [ ] Bá»• sung migrations chuáº©n thay cho chá»‰ `db push`
- [ ] Bá»• sung báº£ng users chi tiáº¿t hÆ¡n
- [ ] Bá»• sung báº£ng invite_link_events
- [ ] Bá»• sung báº£ng autopost_schedules
- [ ] Bá»• sung báº£ng autopost_jobs
- [ ] Bá»• sung báº£ng spam_events
- [ ] Bá»• sung báº£ng audit_logs

## 5. Auth And RBAC

- [x] Login
- [x] JWT access token
- [ ] Refresh token
- [ ] Role guard
- [x] Permission guard
- [x] Route protection á»Ÿ frontend
- [x] Menu theo quyá»n
- [x] Action theo quyá»n

## 6. Telegram Integration

- [x] LÆ°u bot token an toÃ n
- [x] Telegram service wrapper
- [ ] Bind Telegram group/channel
- [x] Webhook receiver
- [-] Invite link generation tháº­t
- [x] Join event ingestion

## 7. Campaign And Tracking

- [x] CÃ³ model campaign cÆ¡ báº£n
- [x] CÃ³ API list/create campaign cÆ¡ báº£n
- [-] CRUD campaign Ä‘áº§y Ä‘á»§
- [x] Generate invite link tháº­t
- [-] Map user join vÃ o campaign
- [x] Ghi invite_link_events
- [ ] Cáº­p nháº­t campaign metrics tháº­t

## 8. Autopost

- [x] CÃ³ capability model cÆ¡ báº£n
- [ ] Táº¡o message template model
- [x] Táº¡o schedule model
- [x] Táº¡o job dispatch flow
- [x] Táº¡o send log
- [x] UI quáº£n lÃ½ schedule
- [-] Retry / fail / success state

## 9. Moderation And Anti-Spam

- [x] CÃ³ moderation rules seed
- [x] Moderation dashboard hiá»ƒn thá»‹ member state `active/left`
- [x] Táº£i CSV danh sÃ¡ch member tá»« UI moderation
- [ ] Rule engine cÆ¡ báº£n
- [x] Rule engine cÆ¡ báº£n
- [ ] Keyword blacklist
- [x] Keyword blacklist
- [ ] Domain blacklist
- [x] Domain blacklist
- [ ] Risk scoring
- [x] Risk scoring
- [ ] Ban / mute / warning actions
- [x] Ban / mute / warning actions
- [x] Moderation dashboard tháº­t
- [x] Manual review flow
- [x] Manual `Allow / Restrict / Ban` action from `/spam`
- [x] Action log history per spam event
- [x] System log panel and JSON export for live debug

## 10. Realtime

- [ ] WebSocket gateway
- [ ] Room strategy
- [ ] Authenticated socket connection
- [ ] Live dashboard metrics
- [ ] Live moderation alerts
- [ ] Live autopost logs

## 11. AI Moderation

- [x] UI cấu hình `AI base URL`, token, model và prompt
- [x] API load model có fallback `mock://catalog`
- [x] AI URL mặc định từ env và token lưu DB dạng mã hóa
- [ ] AI moderation service contract
- [x] AI moderation service contract
- [ ] Message classification
- [x] Message classification
- [ ] Link analysis
- [x] Link analysis
- [ ] Hybrid score manual + AI
- [x] Hybrid score manual + AI
- [ ] Feedback loop tá»« admin

## 12. Security

- [x] Encrypt bot token
- [ ] 2FA tháº­t
- [ ] IP whitelist
- [ ] Audit log Ä‘áº§y Ä‘á»§
- [ ] Rate limiting
- [x] Sensitive data masking

## 13. Local Verification

- [x] `apps/web -> npm run lint`
- [x] `apps/web -> npm run build`
- [x] `apps/api -> npm run lint`
- [x] `apps/api -> npm run build`
- [x] `apps/api -> npm run test:e2e -- --runInBand`
- [x] `docker compose up -d --build`
- [x] `GET /api/health`
- [x] `GET /api/platform`
- [x] `GET /api/campaigns`
- [x] `GET /api/roles`
- [x] `GET /api/settings`
- [x] `POST /api/auth/login`
- [x] `GET /api/auth/me`
- [x] Verify create campaign via API in Docker
- [x] Verify frontend reflects live created campaign
- [x] Verify Telegram status endpoint in Docker
- [x] Verify Telegram groups discovery endpoint in Docker
- [x] Verify Telegram invite-link endpoint in Docker
- [x] Verify Telegram mock event in Docker
- [x] Verify Telegram webhook endpoint in Docker
- [x] Verify Telegram webhook join/left updates member state in Docker
- [x] Verify Telegram webhook spam enforcement attempts Telegram actions in Docker
- [x] Verify moderation members endpoint in Docker
- [x] Verify system logs endpoint in Docker
- [x] Verify moderation CSV download in browser automation
- [x] Verify spam manual action from browser automation
- [x] Verify spam keyword add/remove path from browser automation
- [x] Verify system log JSON download in browser automation
- [x] Verify create user flow on roles page
- [x] Verify AI model loading and prompt save on settings page

## 14. Release Readiness

- [ ] Seed strategy cho dev/staging
- [ ] Env file strategy
- [ ] Production Docker hardening
- [x] Monitoring / logging plan
- [ ] Backup / restore plan
- [ ] Deployment runbook

## Current Focus

- [x] Auth + RBAC
- [-] Telegram integration
- [-] Campaign CRUD Ä‘áº§y Ä‘á»§
- [-] UI actions thay cho dashboard chá»‰ Ä‘á»c
