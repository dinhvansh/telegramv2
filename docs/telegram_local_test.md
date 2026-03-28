# Telegram Local Test Guide

## Mục tiêu

Test Telegram integration theo 2 lớp:

- local-only để kiểm tra logic webhook, event parsing và dashboard feed
- public tunnel để Telegram gọi webhook thật về máy local

## Local-only

Yêu cầu:

- Docker stack đang chạy
- API ở `http://localhost:4000`

Tài khoản local:

- `admin@nexus.local / admin123`
- `operator@nexus.local / operator123`

Endpoint dùng để test:

- `GET /api/telegram/status`
- `POST /api/telegram/mock`
- `POST /api/telegram/webhook`

Ví dụ mock event:

```powershell
$login = Invoke-RestMethod -Method Post `
  -Uri 'http://localhost:4000/api/auth/login' `
  -ContentType 'application/json' `
  -Body '{"email":"operator@nexus.local","password":"operator123"}'

$headers = @{ Authorization = "Bearer $($login.accessToken)" }

Invoke-RestMethod -Method Post `
  -Uri 'http://localhost:4000/api/telegram/mock' `
  -Headers $headers `
  -ContentType 'application/json' `
  -Body '{"type":"user_joined","campaignName":"Local Test","groupTitle":"Nexus Global","memberCount":2}'
```

Ví dụ webhook giả lập:

```powershell
Invoke-RestMethod -Method Post `
  -Uri 'http://localhost:4000/api/telegram/webhook' `
  -ContentType 'application/json' `
  -Body '{"message":{"chat":{"title":"Nexus Global"},"new_chat_members":[{"username":"member_1"}],"invite_link":{"name":"Growth Link"}}}'
```

Sau khi gọi, kiểm tra lại:

- `GET /api/platform`
- dashboard web tại `http://localhost:3000`

## Tunnel-ready

Nếu muốn Telegram gọi webhook thật, cần một URL HTTPS public trỏ về local API.

Ví dụ với `ngrok`:

```powershell
ngrok http 4000
```

Lấy URL HTTPS public, ví dụ:

```txt
https://demo-telegram.ngrok.app
```

Sau đó đăng nhập bằng admin và lưu config:

```powershell
$login = Invoke-RestMethod -Method Post `
  -Uri 'http://localhost:4000/api/auth/login' `
  -ContentType 'application/json' `
  -Body '{"email":"admin@nexus.local","password":"admin123"}'

$headers = @{ Authorization = "Bearer $($login.accessToken)" }

Invoke-RestMethod -Method Post `
  -Uri 'http://localhost:4000/api/telegram/config' `
  -Headers $headers `
  -ContentType 'application/json' `
  -Body '{"publicBaseUrl":"https://demo-telegram.ngrok.app","webhookSecret":"local-telegram-secret"}'
```

Nếu đã có bot token thật:

```powershell
Invoke-RestMethod -Method Post `
  -Uri 'http://localhost:4000/api/telegram/config' `
  -Headers $headers `
  -ContentType 'application/json' `
  -Body '{"botToken":"<telegram-bot-token>","botUsername":"<bot-username>","publicBaseUrl":"https://demo-telegram.ngrok.app","webhookSecret":"local-telegram-secret"}'
```

Đăng ký webhook:

```powershell
Invoke-RestMethod -Method Post `
  -Uri 'http://localhost:4000/api/telegram/register-webhook' `
  -Headers $headers
```

Webhook endpoint thật sẽ là:

```txt
https://demo-telegram.ngrok.app/api/telegram/webhook
```

## Biến môi trường hỗ trợ

Có thể set trực tiếp qua `.env`:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_BOT_USERNAME`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_PUBLIC_BASE_URL`

Nếu vừa có `.env` vừa có config trong database, giá trị trong database sẽ được ưu tiên.
