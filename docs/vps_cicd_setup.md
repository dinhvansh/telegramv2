# VPS CI/CD Setup

## Production target

- Domain: `https://tele.blogthethao.org`
- VPS: `206.189.152.115`

## Thư mục trên VPS

- Code: `/opt/telegramv2/app`
- Env chuẩn: `/opt/telegramv2/shared/.env.production`

## Nguyên tắc env

- File chuẩn phải sửa ở `shared/.env.production`
- File trong `app/.env.production` chỉ là bản copy runtime
- Mỗi lần deploy script sẽ copy lại từ `shared` sang `app`

## Build/redeploy

```bash
cd /opt/telegramv2/app
git pull origin main
cp /opt/telegramv2/shared/.env.production .env.production
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build api web
```

## Restart nhanh

```bash
cd /opt/telegramv2/app
cp /opt/telegramv2/shared/.env.production .env.production
docker compose --env-file .env.production -f docker-compose.prod.yml restart api web
```

## Kiểm tra

```bash
curl http://127.0.0.1:4000/api/health
```

## GitHub Actions secrets

- `TELEGRAM_VPS_HOST`
- `TELEGRAM_VPS_USER`
- `TELEGRAM_VPS_SSH_KEY`

## Lưu ý env quan trọng cho contacts/MTProto

- `TELEGRAM_API_ID`
- `TELEGRAM_API_HASH`

Nếu thiếu 2 biến này:

- QR login MTProto sẽ lỗi
- contacts import sẽ không chạy đúng
