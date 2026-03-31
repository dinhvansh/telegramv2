# Go-Live Checklist

Domain production: `https://tele.blogthethao.org`

Webhook production:
- `https://tele.blogthethao.org/api/telegram/webhook`

## 1. Secret và env

Phải có đủ các biến sau trên production:

- `DATABASE_URL`
- `JWT_SECRET`
- `SETTINGS_ENCRYPTION_KEY`
- `TELEGRAM_PUBLIC_BASE_URL=https://tele.blogthethao.org`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_BOT_TOKEN`

Nếu bật AI moderation thật thì thêm:

- `OPENAI_API_KEY` hoặc cấu hình `ai.api_token` trong CRM
- `OPENAI_BASE_URL=https://api.openai.com/v1` hoặc `ai.base_url`
- `OPENAI_MODEL=gpt-5-mini` hoặc `ai.model`

Lưu ý:
- Không dùng chung `SETTINGS_ENCRYPTION_KEY` với `JWT_SECRET`.
- Không log bot token hoặc AI token ra terminal/script deploy.

## 2. Deploy code

```bash
git config --global --add safe.directory /opt/telegramv2/app
cd /opt/telegramv2/app
git checkout main
git pull --ff-only origin main
APP_ROOT=/opt/telegramv2 APP_DIR=/opt/telegramv2/app SHARED_DIR=/opt/telegramv2/shared ./infra/deploy/deploy-vps.sh
```

Nếu có đổi schema Prisma:

```bash
docker exec -it telegramv2-api sh -lc "cd /app && npx prisma db push"
```

## 3. Kiểm tra container

```bash
docker compose ps
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep telegramv2
```

Phải thấy:
- `telegramv2-api`
- `telegramv2-web`
- `telegramv2-postgres`
- `telegramv2-redis`

## 4. Cấu hình bot trên CRM

Vào:
- `https://tele.blogthethao.org/telegram`

Thực hiện:
1. Nhập bot token
2. Bấm `Tạo secret`
3. Lưu config
4. Bấm `Verify bot`
5. Bấm `Register webhook`

Kỳ vọng:
- Bot verify thành công
- Webhook registered thành công
- `bot username` và `bot display name` hiển thị đúng

## 5. Kiểm tra webhook thật

Thêm bot vào group test hoặc đổi quyền bot để Telegram bắn update mới.

Kỳ vọng:
- Group xuất hiện trong `Telegram Groups`
- CRM ghi nhận đúng:
  - `chat id`
  - `title`
  - quyền admin bot

## 6. Test campaign thật

1. Tạo campaign mới
2. Chọn group từ danh sách sync
3. Tùy chọn:
   - `Số lượng mục tiêu chiến dịch`
   - `Giới hạn số người`
   - `Cần admin duyệt`

Kỳ vọng:
- Campaign tạo thành công
- Invite link Telegram được tạo thật
- Có thể copy ngay link mời

## 7. Test join tracking

1. Cho user vào nhóm bằng invite link của campaign
2. Kiểm tra:
   - màn `Campaign`
   - màn `Thành viên`
   - màn `Telegram / group moderation`

Kỳ vọng:
- Member gắn đúng campaign
- Có `Ngày vào`
- Khi rời nhóm có `Ngày rời`

## 8. Test moderation thật

Checklist nên chạy:

- link thường
- link Telegram invite
- forward từ channel
- inline button có link
- antiflood
- warning ladder
- exempt user

Kỳ vọng:
- Event vào `Chống spam`
- Có `matchedRules`
- Có timeline xử lý
- Nếu bot thiếu quyền thì UI/log báo đúng quyền còn thiếu

## 9. Test action thật

Test từng action:

- `warn`
- `tmute`
- `tban`
- `ban`

Kỳ vọng:
- Telegram API thực thi đúng
- Announcement lên group đúng
- Không bị lặp spam announcement
- `ALLOW` không bao giờ được phép thực thi `kick/ban/mute`

## 10. Test autopost thật

1. Vào `Autopost`
2. Chọn một hoặc nhiều group
3. Tạo lịch với:
   - text
   - ảnh upload hoặc URL ảnh
4. Dispatch thử

Kỳ vọng:
- Log dispatch ghi đúng trạng thái
- Telegram nhận message hoặc photo

## 11. Dọn dữ liệu test

Nếu cần xóa data vận hành/sample:

```bash
docker exec -it telegramv2-api sh -lc "cd /app && node prisma/clear-live-data.js"
```

Script này giữ lại:
- users
- roles
- permissions
- system settings

## 12. Smoke test cuối

Trước khi chốt live:

- Login / logout
- Create / edit / pause / delete campaign
- Copy invite link
- Filter members và export Excel
- Roles: active / inactive / reset password
- Telegram group moderation settings save thành công
- Dashboard load không lỗi

## 13. Nếu có lỗi

Xem nhanh:

```bash
docker logs telegramv2-api --tail 200
docker logs telegramv2-web --tail 200
```

Và trong CRM:
- `Chống spam > Debug / Audit`
- `Webhook JSON thô`
- `Nhật ký hệ thống`
