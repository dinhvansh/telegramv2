# Telegram Operations Platform
## Architecture And Business Flow

## 1. Mục tiêu sản phẩm

Xây dựng một CRM vận hành Telegram theo mô hình `workspace-first`:

- Mỗi nhóm vận hành là một workspace
- Workspace này không thấy dữ liệu workspace khác
- Mọi cấu hình và thao tác được quản lý trên web CRM
- Telegram bot chỉ là execution layer ở bước cuối

## 2. Phạm vi chức năng

### Khối vận hành

- Dashboard
- Campaign
- Invite link
- Members
- Member 360
- Moderation
- Spam
- Autopost
- Settings
- Contacts import

### Khối quản trị

- Users
- Roles
- Workspace memberships
- Bot config
- System logs

## 3. Kiến trúc tổng thể

```text
Next.js Admin
    |
    +-- REST API
    |
    +-- optional realtime
    v
NestJS API
    |
    +-- PostgreSQL
    +-- Redis
    +-- Telegram Bot API
    +-- Telegram MTProto
```

### Thành phần chính

- `apps/web`: giao diện quản trị
- `apps/api`: backend nghiệp vụ
- `PostgreSQL`: dữ liệu nghiệp vụ
- `Redis`: nền cho queue/cache
- `Telegram Bot API`: moderation, invite link, message send
- `Telegram MTProto`: QR login, contact resolve theo phone

## 4. Mô hình dữ liệu nghiệp vụ

Các entity cốt lõi:

- `Organization`
- `Workspace`
- `User`
- `Role`
- `Permission`
- `WorkspaceMembership`
- `TelegramBot`
- `TelegramGroup`
- `Campaign`
- `CampaignInviteLink`
- `InviteLinkEvent`
- `CommunityMember`
- `ModerationPolicy`
- `ModerationKeyword`
- `ModerationDomain`
- `SpamEvent`
- `AutopostTarget`
- `AutopostSchedule`
- `AutopostLog`
- `SystemSetting`
- `SystemLog`
- `TelegramSession`
- `TelegramUser`

## 5. Quy tắc workspace

- User có thể thuộc một hoặc nhiều workspace
- Khi không có `organization.manage`, dữ liệu phải bị giới hạn trong workspace đang hoạt động
- Bot, group, campaign, member, spam log, autopost, contacts import đều phải gắn `workspaceId`

## 6. RBAC hiện tại

### Quản trị hệ thống

- Toàn quyền toàn tenant
- Quản lý organization, workspace, membership
- Xem và cấu hình mọi workspace

### Quản trị workspace

- Toàn quyền trong workspace của mình
- Tạo user trong workspace
- Gán role trong workspace
- Quản lý settings, bot, campaign, moderation, autopost

### Vận hành

- Full quyền vận hành trong workspace
- Không tạo user
- Không sửa membership/role

### Kiểm duyệt viên

- Tập trung moderation
- Review spam
- Manual action

### Cộng tác viên

- Chỉ xem campaign/link/kết quả được giao
- Không thấy dữ liệu quản trị

## 7. Luồng nghiệp vụ chính

### 7.1 Campaign + invite link

1. User tạo campaign trên web
2. Chọn group Telegram đã sync
3. Backend tạo campaign
4. Backend gọi Telegram tạo invite link thật
5. Lưu mapping `campaign -> invite link -> group`

### 7.2 Join tracking

1. Telegram gửi event
2. Backend map event vào group/campaign
3. Cập nhật member state:
   - joined
   - active
   - left
4. Ghi thống kê theo campaign/link

### 7.3 Moderation

1. Event message/join vào hệ thống
2. Rule engine chấm điểm
3. Có thể cộng thêm AI score
4. Quyết định:
   - allow
   - review
   - warn
   - restrict
   - ban
5. Nếu có quyền Telegram phù hợp thì gọi action thật

### 7.4 Contacts import

1. User đăng nhập MTProto bằng QR
2. Upload file JSON
3. Hệ thống nhận:
   - mảng phẳng
   - Telegram export object có `contacts.list`
4. Với mỗi số:
   - normalize phone
   - kiểm tra DB
   - resolve sang Telegram user nếu có
5. Upsert vào `TelegramUser`

Lưu ý: hiện luồng này vẫn là synchronous request, chưa phải batch queue production-ready.

### 7.5 Autopost match webhook

1. Nguồn ngoài hoặc n8n gửi payload trận đấu vào webhook
2. Hệ thống tạo schedule
3. Nếu bật AI thì dùng AI viết caption
4. Đến giờ thì dispatch bài sang Telegram

## 8. Rủi ro hiện tại

- Contacts import file lớn có thể làm nặng tab hoặc timeout
- MTProto session có thể invalid và cần QR login lại
- Một số text cũ vẫn còn mojibake ở một số nơi
- Queue nền cho contacts import chưa có

## 9. Hướng hoàn thiện tiếp

Ưu tiên theo thứ tự:

1. Contacts import batch + queue + progress
2. Customer mapping sau khi resolve
3. Hardening MTProto và rate limit
4. Dọn sạch UTF-8
5. Realtime/WebSocket nếu cần
