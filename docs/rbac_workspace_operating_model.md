# Mô Hình Phân Quyền Theo Workspace

## Mục tiêu

Hệ thống được tổ chức theo nhiều `workspace`.

- Mỗi nhóm/công ty con/vùng vận hành là một `workspace`.
- Người dùng trong workspace A không được thấy dữ liệu của workspace B.
- Quyền được cấp theo `workspace membership`, không cấp kiểu toàn hệ thống cho user vận hành thường ngày.

## Phạm vi dữ liệu

Mọi dữ liệu vận hành phải gắn với `workspaceId`:

- bot Telegram
- group Telegram
- campaign
- invite link
- member/join log
- spam log
- autopost schedule
- settings vận hành
- user membership trong workspace

Nguyên tắc:

- `Quản trị hệ thống` có thể thấy nhiều workspace.
- Các role còn lại chỉ thấy workspace mình được gán.
- `Cộng tác viên` còn bị siết thêm theo dữ liệu cá nhân được giao.

## Vai trò chuẩn

### 1. Quản trị hệ thống

Phạm vi:

- toàn hệ thống
- nhiều workspace

Quyền:

- tạo organization/workspace
- quản lý bot, workspace, membership toàn cục
- xem và thao tác mọi dữ liệu
- gán role cấp cao

Permission chính:

- `organization.manage`
- `workspace.manage`
- `campaign.view`
- `campaign.manage`
- `moderation.review`
- `settings.manage`
- `autopost.execute`

### 2. Quản trị workspace

Phạm vi:

- chỉ trong workspace của mình

Quyền:

- toàn quyền vận hành trong workspace
- tạo user trong workspace
- gán role trong workspace
- xem log, settings, moderation, campaign, autopost

Permission chính:

- `workspace.manage`
- `campaign.view`
- `campaign.manage`
- `moderation.review`
- `settings.manage`
- `autopost.execute`

Không có:

- `organization.manage`

### 3. Vận hành

Phạm vi:

- chỉ trong workspace của mình

Quyền:

- vận hành campaign
- moderation/spam
- autopost
- settings vận hành
- xem member và member 360 trong workspace

Không có:

- tạo user
- sửa role
- đổi membership
- thao tác cấp tổ chức

Permission chính:

- `campaign.manage`
- `moderation.review`
- `settings.manage`
- `autopost.execute`

Không có:

- `workspace.manage`
- `organization.manage`

### 4. Cộng tác viên

Phạm vi:

- chỉ campaign/link được giao cho chính họ

Quyền:

- xem campaign được giao
- xem kết quả link mời của mình
- xem kết quả cá nhân

Không có:

- member list toàn workspace
- member 360 toàn workspace
- moderation
- settings
- user management

Permission nền:

- `campaign.view`

Ghi chú:

- permission `campaign.view` phải kết hợp thêm filter dữ liệu theo `ownerUserId`, `assigneeUserId` hoặc `inviteLinkIds` được giao.

## Map menu

### Quản trị hệ thống

- Tổng quan
- Campaign
- Thành viên
- Member 360
- Bot & Moderation
- Autopost
- Phân quyền
- Cài đặt
- Workspaces

### Quản trị workspace

- Tổng quan
- Campaign
- Thành viên
- Member 360
- Bot & Moderation
- Autopost
- Phân quyền
- Cài đặt

### Vận hành

- Tổng quan
- Campaign
- Thành viên
- Member 360
- Bot & Moderation
- Autopost
- Cài đặt

Không thấy:

- Phân quyền
- Workspaces

### Cộng tác viên

- Tổng quan
- Campaign của tôi

Không thấy:

- Thành viên
- Member 360
- Bot & Moderation
- Autopost
- Phân quyền
- Cài đặt
- Workspaces

## Quy tắc kỹ thuật cần áp dụng

### 1. Page/Menu gating

- `roles` dùng `workspace.manage`
- `settings` dùng `settings.manage`
- `workspaces` dùng `organization.manage`
- `members` và `member360` không mở cho `campaign.view`

### 2. API gating

- quản lý user/role dùng `workspace.manage`
- settings dùng `settings.manage`
- moderation dùng `moderation.review`
- campaign read cho `campaign.view` hoặc `campaign.manage`
- member data không mở cho `campaign.view`

### 3. Data scope

- mọi query phải lọc theo `workspaceIds` của user
- `Cộng tác viên` phải lọc thêm theo dữ liệu được giao

## Kế hoạch triển khai

### Phase 1

- chuẩn hóa tên role tiếng Việt
- cập nhật seed và fallback permission
- đổi page/menu gating theo role mới
- chuyển `Phân quyền` sang `workspace.manage`
- bỏ `campaign.view` khỏi `members` và `member360`

### Phase 2

- siết API member theo role mới
- lọc dữ liệu `Cộng tác viên` theo campaign/link được giao
- tách rõ trang quản trị workspace và trang quản trị hệ thống

### Phase 3

- bổ sung audit log theo workspace
- bổ sung UI switch workspace an toàn
- hoàn thiện seed/runtime để role test khớp 100%
