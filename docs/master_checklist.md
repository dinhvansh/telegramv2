# Telegram Operations Platform Master Checklist

## How To Use

- Đánh dấu `[x]` khi hoàn thành và đã verify.
- Dùng `[-]` cho phần đang làm.
- Dùng `[ ]` cho phần chưa bắt đầu.
- Mỗi lần xong một hạng mục lớn thì cập nhật thêm ngày hoặc ghi chú ngắn ngay bên dưới.

## 1. Foundation

- [x] Tạo `apps/web`
- [x] Tạo `apps/api`
- [x] Tạo `docs/`
- [x] Tạo local Docker stack với `web`, `api`, `postgres`, `redis`
- [x] Dựng admin shell baseline
- [x] Tạo master execution plan
- [x] Tạo task tracker chi tiết
- [x] Chuẩn hóa toàn bộ tài liệu tiếng Việt sang UTF-8

## 2. Frontend Admin

- [x] Dựng layout command-center
- [x] Dựng overview dashboard
- [x] Dựng section campaigns
- [x] Dựng section moderation
- [x] Dựng section autopost
- [x] Dựng section roles
- [x] Dựng section settings
- [x] Nối frontend với API snapshot
- [x] Tách thành routed pages riêng cho từng module
- [x] Dùng UI source từ `stitch/` cho các route chính
- [x] Thêm form tạo campaign từ UI
- [x] Nối live data và action vào các page `stitch/` chính
- [x] Thêm form tạo user từ UI phân quyền
- [x] Thêm block cấu hình AI vào settings
- [x] Thêm CRUD thật trên UI
- [x] Thêm loading, empty state, error state hoàn chỉnh
- [x] Thêm auth UI

## 3. Backend API

- [x] Tạo NestJS app
- [x] Thêm health endpoint
- [x] Thêm platform snapshot endpoint
- [x] Thêm campaigns endpoint
- [x] Thêm roles endpoint
- [x] Thêm settings endpoint
- [x] Thêm users endpoint
- [x] Thêm auth endpoint
- [x] Thêm autopost schedules endpoint
- [x] Thêm moderation actions endpoint
- [x] Thêm audit logs endpoint
- [x] Thêm AI model loading endpoint

## 4. Database

- [x] Tạo Prisma schema
- [x] Seed dữ liệu nền
- [x] Push schema lên PostgreSQL local
- [ ] Bổ sung migrations chuẩn thay cho chỉ `db push`
- [ ] Bổ sung bảng users chi tiết hơn
- [ ] Bổ sung bảng invite_link_events
- [ ] Bổ sung bảng autopost_schedules
- [ ] Bổ sung bảng autopost_jobs
- [ ] Bổ sung bảng spam_events
- [ ] Bổ sung bảng audit_logs

## 5. Auth And RBAC

- [x] Login
- [x] JWT access token
- [ ] Refresh token
- [ ] Role guard
- [x] Permission guard
- [x] Route protection ở frontend
- [x] Menu theo quyền
- [x] Action theo quyền

## 6. Telegram Integration

- [x] Lưu bot token an toàn
- [x] Telegram service wrapper
- [ ] Bind Telegram group/channel
- [x] Webhook receiver
- [x] Invite link generation thật
- [x] Join event ingestion

## 7. Campaign And Tracking

- [x] Có model campaign cơ bản
- [x] Có API list/create campaign cơ bản
- [x] CRUD campaign đầy đủ
- [x] Generate invite link thật
- [x] Map user join vào campaign
- [x] Ghi invite_link_events
- [ ] Cập nhật campaign metrics thật

## 8. Autopost

- [x] Có capability model cơ bản
- [ ] Tạo message template model
- [x] Tạo schedule model
- [x] Tạo job dispatch flow
- [x] Tạo send log
- [x] UI quản lý schedule
- [x] Retry / fail / success state

## 9. Moderation And Anti-Spam

- [x] Có moderation rules seed
- [x] Moderation dashboard hiển thị member state `active/left`
- [x] Tải CSV danh sách member từ UI moderation
- [x] Rule engine cơ bản
- [x] Keyword blacklist
- [x] Domain blacklist
- [x] Risk scoring
- [x] Ban / mute / warning actions
- [x] Moderation dashboard thật
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
- [x] AI moderation service contract
- [x] Message classification
- [x] Link analysis
- [x] Hybrid score manual + AI
- [ ] Feedback loop từ admin

## 12. Security

- [x] Encrypt bot token
- [ ] 2FA thật
- [ ] IP whitelist
- [ ] Audit log đầy đủ
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
- [x] Telegram integration
- [x] Campaign CRUD đầy đủ
- [x] UI actions thay cho dashboard chỉ đọc
