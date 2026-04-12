# Telegram Operations Platform
## AI Execution Workflow

## 1. Mục tiêu

File này mô tả cách triển khai thay đổi trong repo theo thứ tự an toàn, để:

- không phá runtime đang chạy
- không build nửa chừng rồi bỏ
- luôn có cách kiểm tra lại local/live

## 2. Thứ tự chuẩn khi làm việc

### Bước 1. Đọc trạng thái thật

Trước khi sửa:

- đọc code hiện tại
- đọc docs canonical
- xác định đang là local hay production
- xác định fix ở web, api, data hay deploy

### Bước 2. Sửa nguồn gốc trước

Không vá triệu chứng ở UI nếu lỗi nằm ở:

- permission guard
- env
- DB
- session Telegram
- runtime mapping

### Bước 3. Build thật

Sau khi sửa:

- `apps/api -> npm run build`
- `apps/web -> npm run build`
- `docker compose up -d --build`

### Bước 4. Verify thật

Tối thiểu phải kiểm tra:

- `GET /api/health`
- route web liên quan
- luồng nghiệp vụ chính liên quan đến fix

## 3. Thứ tự triển khai tính năng lớn

### Phase A. Foundation

- env
- Docker
- schema
- auth
- RBAC

### Phase B. Business core

- workspace
- telegram bot
- campaigns
- members
- moderation

### Phase C. Smart features

- AI moderation
- contacts import
- match webhook
- autopost

### Phase D. Hardening

- logging
- CI/CD
- runbook
- production rollout

## 4. Quy trình xử lý bug

Khi có bug production:

1. kiểm tra `api/health`
2. kiểm tra `system logs`
3. kiểm tra Docker logs
4. xác định do:
   - permission
   - env
   - session Telegram
   - timeout
   - payload shape
5. sửa nguồn gốc
6. build lại
7. redeploy
8. ghi lại vào runbook nếu là bug mới

## 5. Quy trình xử lý contacts import

Hiện tại:

- chỉ phù hợp file nhỏ hoặc trung bình
- chưa phù hợp file vài nghìn contact

Khi xử lý vấn đề contacts import:

1. kiểm tra MTProto session
2. kiểm tra `TELEGRAM_API_ID/HASH`
3. kiểm tra payload là:
   - array
   - hay `contacts.list`
4. kiểm tra Telegram error:
   - `AUTH_KEY_UNREGISTERED`
   - `FLOOD_WAIT`
   - timeout

## 6. Quy tắc trước khi push Git

- chỉ commit phần đã build pass
- commit message phải mô tả đúng thay đổi
- nếu fix live issue thì ưu tiên patch nhỏ, đúng chỗ
- không đẩy file env hoặc secret

## 7. Quy tắc trước khi deploy VPS

1. `git pull origin main`
2. copy env từ `shared` sang `app`
3. `docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build api web`
4. kiểm tra `api/health`
5. test màn liên quan
