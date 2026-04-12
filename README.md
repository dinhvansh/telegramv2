# Telegram Operations Platform

Nền tảng CRM-first để vận hành Telegram theo mô hình nhiều workspace, gồm:

- Campaign và invite link
- Thành viên và Member 360
- Moderation và anti-spam
- Autopost
- RBAC theo workspace
- Settings, bot config, AI config
- Contacts import và Telegram MTProto resolve

## Trạng thái hiện tại

Repo này đang ở giai đoạn `beta nội bộ`, đã có các phần chạy được:

- Web admin bằng Next.js
- API bằng NestJS
- PostgreSQL + Redis + Docker Compose
- Đăng nhập JWT và RBAC cơ bản
- Workspace, role, user, membership
- Campaign, invite link, member tracking cơ bản
- Moderation rule engine + manual action
- Telegram bot config, webhook, discover groups
- MTProto QR login để resolve contacts
- Contacts import từ:
  - mảng JSON phẳng
  - Telegram export object có `contacts.list`
- Deploy VPS bằng Docker + GitHub Actions

Các phần còn thiếu hoặc chưa production-ready hoàn toàn:

- Contacts import nền theo batch/queue
- Customer mapping hoàn chỉnh sau khi resolve
- Realtime/WebSocket đồng bộ toàn hệ thống
- Hardening đầy đủ cho batch lớn
- Dọn sạch toàn bộ lỗi UTF-8 còn sót ở mọi màn hình và seed

## Cấu trúc repo

```text
.
├─ apps/
│  ├─ api/
│  └─ web/
├─ docs/
├─ infra/
├─ stitch/
├─ docker-compose.yml
├─ docker-compose.prod.yml
└─ README.md
```

## Apps

### `apps/api`

Các module chính:

- `auth`
- `users`
- `roles`
- `workspaces`
- `campaigns`
- `telegram`
- `telegram-actions`
- `telegram-mtproto`
- `moderation`
- `contacts`
- `autopost`
- `settings`
- `system-logs`
- `platform`

### `apps/web`

Các route chính:

- `/dashboard`
- `/campaigns`
- `/members`
- `/member360`
- `/moderation`
- `/spam`
- `/autopost`
- `/contacts`
- `/roles`
- `/settings`
- `/telegram`
- `/workspaces`

## Local development

### Yêu cầu

- Node.js 24+
- npm 11+
- Docker Desktop

### Chạy local bằng Docker

```powershell
cd e:\2.CODE\telegram
docker compose up -d --build
```

Endpoints:

- Web: `http://localhost:3000`
- API health: `http://localhost:4000/api/health`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

### Tài khoản local mặc định

- `superadmin@nexus.local / superadmin123`
- `admin@nexus.local / admin123`
- `operator@nexus.local / operator123`
- `moderator@nexus.local / moderator123`
- `viewer@nexus.local / viewer123`

## Production

Production hiện chốt:

- Domain: `https://tele.blogthethao.org`
- VPS: `206.189.152.115`
- Env chuẩn:
  - `/opt/telegramv2/shared/.env.production`

Deploy/restart:

```bash
cd /opt/telegramv2/app
git pull origin main
cp /opt/telegramv2/shared/.env.production .env.production
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build api web
```

## Tài liệu chuẩn nên đọc trước

Từ thời điểm này, các file dưới đây là bộ tài liệu chính:

- [docs/README.md](e:/2.CODE/telegram/docs/README.md)
- [telegram_operations_platform_architecture_business_flow.md](e:/2.CODE/telegram/telegram_operations_platform_architecture_business_flow.md)
- [telegram_operations_platform_ai_build_spec.md](e:/2.CODE/telegram/telegram_operations_platform_ai_build_spec.md)
- [telegram_operations_platform_ai_execution_workflow.md](e:/2.CODE/telegram/telegram_operations_platform_ai_execution_workflow.md)
- [docs/implementation_master_plan.md](e:/2.CODE/telegram/docs/implementation_master_plan.md)
- [docs/master_checklist.md](e:/2.CODE/telegram/docs/master_checklist.md)
- [docs/live_debug_runbook.md](e:/2.CODE/telegram/docs/live_debug_runbook.md)

Các file handover hoặc draft cũ trong `docs/` vẫn được giữ lại để tra cứu lịch sử, nhưng không còn là nguồn chân lý chính.
