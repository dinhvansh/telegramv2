# Telegram Operations Platform
## AI Build Spec

## 1. Mục tiêu build

Build và duy trì một hệ thống CRM vận hành Telegram với các yêu cầu:

- Chạy được local bằng Docker
- Chạy production trên VPS
- Có RBAC theo workspace
- Có Telegram bot integration thật
- Có MTProto contact resolve
- Có moderation và autopost
- Có logging và khả năng debug khi live

## 2. Stack chuẩn

### Frontend

- Next.js
- TypeScript
- CSS/Tailwind theo hiện trạng repo

### Backend

- NestJS
- TypeScript
- Prisma

### Data / Infra

- PostgreSQL
- Redis
- Docker Compose

### Telegram

- Bot API
- MTProto qua `gramjs`

## 3. Cấu trúc repo chuẩn

```text
apps/
  api/
  web/
docs/
infra/
stitch/
```

## 4. Chức năng bắt buộc

### Auth và quyền

- Login
- JWT
- `auth/me`
- Page gating
- API permission guard
- Workspace scoping

### Telegram core

- Bot config
- Verify bot
- Register webhook
- Discover groups
- Execute moderation actions

### Campaign

- CRUD campaign
- Create invite link
- Track joins cơ bản

### Moderation

- Rule-based score
- Spam log
- Manual action

### Contacts

- QR login
- JSON import
- Phone resolve sang Telegram user

### Autopost

- Target
- Schedule
- Dispatch
- Logs

## 5. Yêu cầu kỹ thuật bắt buộc

- Build sạch `apps/api`
- Build sạch `apps/web`
- Docker local lên được
- Docker production lên được
- Secrets không hardcode trong code
- Token/secret nhạy cảm phải đi qua env hoặc settings encrypt
- Không dùng request dài cho khối batch nặng trong production-ready design

## 6. Yêu cầu dữ liệu

Mọi dữ liệu nghiệp vụ cần gắn `workspaceId` nếu có thể:

- telegram bot
- group
- campaign
- member
- spam event
- autopost target/schedule
- imported contact batch

## 7. Quy tắc cho AI coder

- Không thêm abstraction thừa
- Không thay stack giữa chừng
- Không triển khai UI trước khi backend path chính chưa rõ
- Không merge dữ liệu cross-workspace
- Không coi contacts import hiện tại là production-ready cho file vài nghìn record

## 8. Definition of done

Một module chỉ được coi là hoàn tất khi:

- code build pass
- lint pass
- chạy được qua Docker
- có tài liệu vận hành tối thiểu
- có cách kiểm tra khi live bị lỗi
