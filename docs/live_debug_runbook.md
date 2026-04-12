# Live Debug Runbook

## 1. Kiểm tra nhanh

```bash
cd /opt/telegramv2/app
cp /opt/telegramv2/shared/.env.production .env.production
docker compose --env-file .env.production -f docker-compose.prod.yml ps
curl http://127.0.0.1:4000/api/health
```

## 2. Xem log

```bash
cd /opt/telegramv2/app
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f api
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f web
```

## 3. Restart an toàn

```bash
cd /opt/telegramv2/app
cp /opt/telegramv2/shared/.env.production .env.production
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build api web
```

## 4. Các lỗi hay gặp

### `Missing required permission`

Nguyên nhân:

- user không có permission đúng
- token/profile cũ
- role bootstrap chưa cập nhật

Xử lý:

- đăng xuất, đăng nhập lại
- kiểm tra `/api/auth/me`
- kiểm tra role chuẩn trong DB

### `AUTH_KEY_UNREGISTERED`

Nguyên nhân:

- session MTProto cũ không còn hợp lệ

Xử lý:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec postgres psql -U postgres -d telegram_ops -c "delete from \"TelegramSession\" where \"phoneNumber\" = 'MTPROTO_SESSION';"
```

Sau đó QR login lại.

### QR `expires in 177592...s`

Nguyên nhân:

- server đang chạy code cũ, chưa có fix `expiresIn`

Xử lý:

- pull commit mới
- rebuild API/web

### Contacts import làm tab đơ hoặc trắng trang

Nguyên nhân:

- request đồng bộ quá dài
- file import quá lớn

Xử lý tạm:

- dùng file nhỏ để test
- restart web/api nếu cần

Giải pháp dài hạn:

- chuyển sang batch queue
