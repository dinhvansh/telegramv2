# Backend Regression Checklist

Ngày cập nhật: `2026-04-06`

## Mục tiêu

Checklist này dùng để:

- test backend sau mỗi đợt thay đổi lớn
- chốt nhanh pass/fail theo role
- tránh bỏ sót các flow quan trọng như auth, campaign, moderation, autopost, Telegram, member360, multi-workspace

## 1. Build và Runtime

- [ ] `apps/api -> npm run prisma:generate`
- [ ] `apps/api -> npm run prisma:push`
- [ ] `apps/api -> npm run prisma:seed`
- [ ] `apps/api -> npm run build`
- [ ] `apps/web -> npm run build`
- [ ] `docker compose up -d --build api web`
- [ ] `GET /api/health` trả `200`
- [ ] `telegram-api` trạng thái `Up`
- [ ] `telegram-web` trạng thái `Up`
- [ ] `telegram-postgres` trạng thái `Healthy`
- [ ] `telegram-redis` trạng thái `Healthy`

## 2. Auth và Profile

Tài khoản local:

- `superadmin@nexus.local / superadmin123`
- `admin@nexus.local / admin123`
- `operator@nexus.local / operator123`
- `viewer@nexus.local / viewer123`

Checklist:

- [ ] `POST /api/auth/login` pass cho từng user
- [ ] `GET /api/auth/me` pass cho từng user
- [ ] `auth/me` trả đúng:
  - `permissions`
  - `defaultWorkspaceId`
  - `defaultOrganizationId`
  - `workspaces`

## 3. Scope Theo Role

### SuperAdmin

- [ ] Xem được `/api/platform`
- [ ] Xem được `/api/campaigns`
- [ ] Xem được `/api/moderation/members`
- [ ] Xem được `/api/moderation/member360`
- [ ] Xem được `/api/autopost`
- [ ] Xem được `/api/telegram/status`
- [ ] Xem được `/api/workspaces/overview`
- [ ] Xem được `/api/workspaces/catalog`
- [ ] Tạo được `/api/workspaces/onboard`

### Admin

- [ ] Xem được `/api/platform`
- [ ] Xem được `/api/campaigns`
- [ ] Xem được `/api/moderation/members`
- [ ] Xem được `/api/moderation/member360`
- [ ] Xem được `/api/autopost`
- [ ] Xem được `/api/telegram/status`
- [ ] Không thấy `SuperAdmin` trong `/api/users`
- [ ] Không thấy role `SuperAdmin` trong `/api/roles`

### Operator

- [ ] Xem được `/api/platform`
- [ ] Xem được `/api/campaigns`
- [ ] Xem được `/api/moderation/members`
- [ ] Xem được `/api/moderation/member360`
- [ ] Xem được `/api/autopost`
- [ ] Bị chặn `/api/telegram/status` với `403`
- [ ] Bị chặn `/api/workspaces/overview` với `403`

### Viewer

- [ ] Xem được `/api/platform`
- [ ] Xem được `/api/campaigns`
- [ ] Xem được `/api/moderation/members`
- [ ] Xem được `/api/moderation/member360`
- [ ] Bị chặn `/api/autopost` với `403`
- [ ] Bị chặn `/api/telegram/status` với `403`
- [ ] Bị chặn `/api/workspaces/overview` với `403`

## 4. Campaign

- [ ] `GET /api/campaigns` trả `200`
- [ ] Admin tạo campaign mới pass
- [ ] Campaign có `assigneeUserId` khi được gán người phụ trách
- [ ] Operator chỉ thấy campaign được giao cho mình
- [ ] Viewer chỉ thấy campaign được giao cho mình
- [ ] Admin thấy toàn bộ campaign trong workspace của mình

## 5. Members

- [ ] `GET /api/moderation/members` trả `200`
- [ ] Filter theo group pass
- [ ] Filter theo campaign pass
- [ ] Export theo filter hiện tại pass
- [ ] Operator không bị lỗi `403` do load danh sách owner
- [ ] Viewer xem được list nhưng không có thao tác sửa

## 6. Member 360

- [ ] `GET /api/moderation/member360` trả `200`
- [ ] `GET /api/moderation/member360/:externalId` trả `200`
- [ ] Có dữ liệu `TelegramUser`
- [ ] Có dữ liệu `GroupMembershipSession`
- [ ] Có cột:
  - `ID số`
  - `SĐT`
  - `Nguồn khách`
- [ ] Import Excel map theo `ID số` pass
- [ ] Template import tải xuống được
- [ ] Drawer chi tiết lưu được:
  - `owner`
  - `ghi chú`
  - `SĐT`
  - `Nguồn khách`

## 7. Telegram và Moderation

- [ ] `GET /api/telegram/status` trả `200` với superadmin/admin
- [ ] `Bot & Moderation` load được:
  - cấu hình bot
  - tổng quan bot
  - danh sách group
- [ ] Toggle `Bật/Tắt kiểm duyệt` theo group hoạt động đúng
- [ ] `Cấu hình chống spam` điều hướng đúng vào page group moderation
- [ ] `join_request + REVIEW` chỉ vào queue, không tự decline
- [ ] `join_request + ALLOW` approve đúng
- [ ] `join_request + RESTRICT/BAN` decline đúng

## 8. Autopost

- [ ] `GET /api/autopost` trả `200` với admin/operator
- [ ] Viewer bị chặn `403`
- [ ] Tạo lịch một lần pass
- [ ] Tạo lịch lặp pass
- [ ] Nhiều khung giờ pass
- [ ] `Gửi ngay` pass
- [ ] Scheduler tự dispatch lịch đến hạn
- [ ] Status `COMPLETED` không chạy lại

## 9. Dashboard

- [ ] `/api/platform` trả `200`
- [ ] Dashboard load được:
  - metrics
  - bot summary
  - group insights
- [ ] Scope theo workspace thay đổi đúng khi đổi selector
- [ ] Scope theo operator/viewer phản ánh đúng campaign được giao

## 10. Multi-Workspace Foundation

- [ ] Có `Organization` mặc định
- [ ] Có `Workspace` mặc định
- [ ] Có `TelegramBot` mặc định
- [ ] `TelegramGroup.organizationId` không còn null
- [ ] `TelegramGroup.workspaceId` không còn null
- [ ] `TelegramGroup.telegramBotId` không còn null
- [ ] `Campaign.organizationId` không còn null
- [ ] `Campaign.workspaceId` không còn null
- [ ] `Campaign.telegramBotId` không còn null
- [ ] `WorkspaceMembership` đã backfill từ `UserRole`

## 11. Workspace/Bot CRUD

- [ ] `GET /api/workspaces/overview` trả dữ liệu organization/workspace/bot
- [ ] `GET /api/workspaces/catalog` trả dữ liệu catalog
- [ ] `POST /api/workspaces/organizations` tạo organization pass
- [ ] `POST /api/workspaces` tạo workspace pass
- [ ] `PATCH /api/workspaces/:workspaceId` cập nhật workspace pass
- [ ] `DELETE /api/workspaces/:workspaceId` archive workspace pass
- [ ] `POST /api/workspaces/:workspaceId/bots` tạo bot pass
- [ ] `PATCH /api/workspaces/bots/:botId` cập nhật bot pass
- [ ] `PATCH /api/workspaces/bots/:botId` đặt `isPrimary=true` pass
- [ ] `DELETE /api/workspaces/bots/:botId` archive bot pass
- [ ] `POST /api/workspaces/:workspaceId/memberships` gán user vào workspace pass
- [ ] `PATCH /api/workspaces/memberships/:membershipId` bật/tắt membership pass
- [ ] `POST /api/workspaces/onboard` tạo trọn bộ organization/workspace/admin/bot pass

## 12. Vòng Smoke Local 2026-04-06

### Pass

- [x] `GET /api/health`
- [x] `superadmin` login + `auth/me`
- [x] `admin` login + `auth/me`
- [x] `operator` login + `auth/me`
- [x] `viewer` login + `auth/me`
- [x] `superadmin`:
  - `/api/platform`
  - `/api/campaigns`
  - `/api/moderation/members`
  - `/api/moderation/member360`
  - `/api/autopost`
  - `/api/telegram/status`
  - `/api/workspaces/overview`
- [x] `admin`:
  - `/api/platform`
  - `/api/campaigns`
  - `/api/moderation/members`
  - `/api/moderation/member360`
  - `/api/autopost`
  - `/api/telegram/status`
- [x] `operator`:
  - `/api/platform`
  - `/api/campaigns`
  - `/api/moderation/members`
  - `/api/moderation/member360`
  - `/api/autopost`
- [x] `viewer`:
  - `/api/platform`
  - `/api/campaigns`
  - `/api/moderation/members`
  - `/api/moderation/member360`

### Expected 403

- [x] `operator -> /api/telegram/status`
- [x] `operator -> /api/workspaces/overview`
- [x] `viewer -> /api/autopost`
- [x] `viewer -> /api/telegram/status`
- [x] `viewer -> /api/workspaces/overview`

## 13. Chưa Test Hết

Những phần này vẫn cần regression live riêng:

- [ ] webhook Telegram live end-to-end
- [ ] invite link thật với Telegram API
- [ ] moderation action live trên group thật
- [ ] autopost gửi live bằng bot thật
- [ ] import Excel Member 360 bằng file thật
- [ ] full permission matrix cho mọi endpoint mutation
- [ ] browser flow đầy đủ cho `superadmin`, `admin`, `operator`, `viewer`
