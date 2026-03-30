# Telegram Operations Platform

CRM-first platform để vận hành Telegram group, campaign, moderation, autopost và quản trị nội bộ.

## Mục tiêu hệ thống

Hệ thống này đi theo hướng:

- Toàn bộ cấu hình nằm trên web CRM.
- Bot Telegram chỉ là execution layer.
- Khi bot được add vào group, CRM ghi nhận group đó.
- Moderation engine đọc config từ CRM để quyết định xử lý.
- Telegram Bot API chỉ được gọi ở bước thực thi cuối cùng.

Domain production đã chốt:

- `https://tele.blogthethao.org`

## Trạng thái hiện tại

Repository hiện đã có các phần chạy thật:

- Đăng nhập JWT và phân quyền RBAC.
- Quản lý user và role.
- Telegram bot config, verify bot, register webhook, discover groups.
- Sync group Telegram vào CRM.
- Campaign gắn với group Telegram thật.
- Tạo invite link Telegram thật khi tạo campaign.
- Tracking members theo campaign.
- Moderation engine với lock rules, antiflood, warning ladder.
- Telegram execution cho `warn`, `mute`, `tmute`, `kick`, `ban`, `tban`.
- Announcement lên group sau khi xử lý.
- Autopost targets, schedules, dispatch và logs.
- Docker local stack.
- GitHub Actions chạy CI trước khi deploy VPS.

## Cấu trúc monorepo

```text
.
|-- apps/
|   |-- api/        NestJS API, Prisma schema, Telegram integration, moderation logic
|   `-- web/        Next.js admin CRM UI
|-- docs/           Tài liệu phân tích, kế hoạch triển khai, handover
|-- infra/          Nginx, deploy script, VPS setup
|-- stitch/         Nguồn tham chiếu UI cũ
|-- docker-compose.yml
`-- docker-compose.prod.yml
```

## Các module chính

### `apps/api`

Backend hiện được tổ chức theo domain:

- `auth`: đăng nhập, JWT, profile
- `campaigns`: campaign, invite link, member stats
- `telegram`: bot config, webhook, group sync, invite links
- `telegram-actions`: lớp gọi Telegram Bot API
- `moderation`: rule engine, warning ladder, antiflood, manual actions
- `autopost`: target, schedule, dispatch, logs
- `roles`, `users`: RBAC và user administration
- `settings`: system settings, encrypted secrets
- `system-logs`: audit/execution logs
- `platform`: dashboard snapshot và dữ liệu tổng hợp

### `apps/web`

Frontend hiện có các màn chính:

- đăng nhập
- tổng quan
- campaign
- thành viên
- chống spam
- autopost
- phân quyền
- Telegram
- cài đặt

## Luồng chính đang chạy

### 1. Telegram CRM-first

- User nhập bot token và cấu hình Telegram trên web.
- CRM lưu token đã mã hóa trong settings.
- Có thể verify bot bằng `getMe`.
- Có thể register webhook.
- Khi bot được add vào group hoặc đổi quyền, CRM sync group qua webhook `my_chat_member` và `chat_member`.

### 2. Campaign

Luồng tạo campaign hiện tại:

1. User tạo campaign từ web.
2. Không nhập tay channel.
3. Bắt buộc chọn từ danh sách `TelegramGroup` đã sync.
4. Backend tạo record campaign.
5. Backend gọi Telegram `createChatInviteLink` thật.
6. Nếu Telegram thành công:
   - cập nhật `inviteCode`
   - lưu mapping invite link theo campaign/group
7. Nếu Telegram lỗi:
   - rollback campaign
   - không để lại record rác

### 3. Members

- Thành viên được ghi nhận theo campaign/group.
- Có thống kê:
  - đã tham gia
  - đang ở lại
  - đã rời đi
- Có thể gán `owner` và `note` cho từng member trong CRM.

### 4. Moderation

Moderation hiện đã có:

- lock `url`
- lock `invitelink`
- lock `forward`
- lock `email`
- lock `phone`
- lock `bot`
- lock `photo`
- lock `video`
- lock `document`
- lock `sticker`
- `antiflood`
- `warning ladder`
- exemption cho trusted user, owner, admin
- manual action từ CRM
- command workflow cơ bản

Action matrix hiện có:

- `warn`
- `mute`
- `tmute`
- `kick`
- `ban`
- `tban`

### 5. Execution layer

Khi CRM quyết định xử lý:

- Bot sẽ gọi Telegram Bot API để xóa tin, mute, ban, decline join request, approve request.
- Nếu thiếu quyền admin, hệ thống sẽ map lỗi Telegram sang quyền cần cấp cho bot.
- Nếu action chạy được, hệ thống có thể gửi announcement vào group.

### 6. Autopost

- Tạo target.
- Tạo schedule.
- Dispatch thủ công hoặc dispatch lịch đến hạn.
- Ghi log gửi bài.

## Local development

### Yêu cầu

- Node.js 24+
- npm 11+
- Docker Desktop

### Biến môi trường

Tạo `.env` từ `.env.example`.

Các biến quan trọng:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/telegram_ops?schema=public
REDIS_URL=redis://localhost:6379
API_PORT=4000
WEB_PORT=3000
JWT_SECRET=local-dev-secret
SETTINGS_ENCRYPTION_KEY=change-me-to-a-long-random-secret
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_PUBLIC_BASE_URL=
```

Lưu ý:

- `SETTINGS_ENCRYPTION_KEY` nên khác `JWT_SECRET`.
- Token Telegram hiện hỗ trợ 1 bot active.

### Chạy bằng Docker

Từ root repo:

```bash
docker compose up --build
```

Services:

- Web: `http://localhost:3000`
- API: `http://localhost:4000/api`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

### Chạy thủ công

API:

```bash
cd apps/api
npm ci
npm run prisma:generate
npm run start:dev
```

Web:

```bash
cd apps/web
npm ci
npm run dev
```

## Tài khoản local

- `admin@nexus.local / admin123`
- `operator@nexus.local / operator123`

## Các endpoint quan trọng

### Auth

- `POST /api/auth/login`
- `GET /api/auth/me`

### Campaigns

- `GET /api/campaigns`
- `POST /api/campaigns`
- `GET /api/campaigns/:campaignId/invite-links`

### Telegram

- `GET /api/telegram/status`
- `POST /api/telegram/config`
- `POST /api/telegram/verify-bot`
- `POST /api/telegram/register-webhook`
- `GET /api/telegram/groups`
- `POST /api/telegram/discover-groups`
- `POST /api/telegram/mock`
- `POST /api/telegram/webhook`
- `POST /api/telegram/commands/execute`

### Moderation

- `GET /api/moderation/config`
- `PUT /api/moderation/config`
- `GET /api/moderation/events`
- `POST /api/moderation/analyze`
- `POST /api/moderation/events/:eventId/action`
- `GET /api/moderation/debug`

### Autopost

- `GET /api/autopost/targets`
- `POST /api/autopost/targets`
- `GET /api/autopost/schedules`
- `POST /api/autopost/schedules`
- `POST /api/autopost/dispatch`

## Kiểm tra chất lượng đã chạy

Ở trạng thái repo hiện tại, các bước sau đã pass trong các vòng làm việc gần nhất:

- `apps/api`: `npm run prisma:generate`
- `apps/api`: `npm run lint`
- `apps/api`: `npm run build`
- `apps/web`: `npm run lint`
- `apps/web`: `npm run build`
- `docker compose up -d --build`

Ghi chú:

- `apps/api` hiện không có unit test kiểu `npm test` chuẩn, nên lệnh đó có thể báo `No tests found`.

## Production

Production đang đi theo:

- web qua Nginx tại `https://tele.blogthethao.org/`
- API qua `https://tele.blogthethao.org/api/`
- webhook Telegram dự kiến:
  - `https://tele.blogthethao.org/api/telegram/webhook`

File liên quan:

- `infra/nginx/tele.blogthethao.org.conf`
- `docker-compose.prod.yml`
- `.github/workflows/deploy-vps.yml`

## Phần còn cần hoàn thiện thêm

Những gap còn lại chủ yếu là live validation và polish:

- verify live `CampaignInviteLink` end-to-end với bot token thật
- test moderation thật trên group Telegram thật
- test announcement thật trong group
- test autopost thật trên production
- dọn thêm text tiếng Việt lỗi mã hóa ở vài màn cũ
- làm UX lỗi rõ hơn ở một số form như tạo campaign

## Tài liệu liên quan

- [docs/crm_first_moderation_architecture.md](docs/crm_first_moderation_architecture.md)
- [docs/telegram_moderation_implementation_plan.md](docs/telegram_moderation_implementation_plan.md)
- [docs/telegram_moderation_dev_spec_full.md](docs/telegram_moderation_dev_spec_full.md)
- [docs/handover_2026-03-30.md](docs/handover_2026-03-30.md)
