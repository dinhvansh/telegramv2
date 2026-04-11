# RBAC Reorganization

## Mục tiêu

Thiết kế lại phân quyền để:

- dễ hiểu cho vận hành
- menu ẩn/hiện đúng theo quyền
- API và UI dùng chung một source of truth
- tách rõ quyền theo `organization`, `workspace`, `module`, `action`
- tránh tình trạng một quyền quá rộng như `settings.manage` hoặc `moderation.review` đang gánh nhiều thứ

## Vấn đề của bản hiện tại

RBAC hiện tại chạy được, nhưng có 5 vấn đề chính:

1. Quyền đang quá thô.
- `settings.manage` đang mở luôn nhiều màn khác nhau.
- `moderation.review` đang vừa là xem moderation, vừa có thể kéo theo các quyền gần admin.

2. Tên quyền chưa bám nghiệp vụ.
- Hiện có các quyền như:
  - `campaign.view`
  - `campaign.manage`
  - `moderation.review`
  - `settings.manage`
  - `autopost.execute`
  - `workspace.manage`
  - `organization.manage`
- Chưa có nhóm quyền riêng cho:
  - `members`
  - `member360`
  - `telegram`
  - `logs`
  - `roles`

3. Scope chưa thật sự rõ.
- User có `UserRole` toàn cục.
- Đồng thời lại có `WorkspaceMembership`.
- Điều này làm role toàn cục và role theo workspace bị chồng lên nhau.

4. Menu và API có thể lệch nhau.
- UI có chỗ ẩn theo permission.
- API có chỗ check guard, có chỗ check tay.
- Nếu không có permission matrix chuẩn thì rất dễ lệch.

5. Thiếu phân tầng thao tác.
- Chưa tách rõ:
  - xem
  - sửa cấu hình
  - chạy thao tác nguy hiểm
  - export
  - prune log

## Cách tổ chức mới

### 1. Nguyên tắc

- `Role` là gói quyền.
- `Permission` là quyền nguyên tử.
- `Membership` là nơi gán role cho user trong một scope cụ thể.
- Không dùng role tên đẹp để check logic. Chỉ check bằng `permission`.
- Menu, page guard, action button, API guard phải dùng cùng một permission map.

### 2. Scope chuẩn

Nên có 3 scope:

1. `organization`
- dành cho super admin / owner hệ thống
- quản lý nhiều workspace

2. `workspace`
- scope vận hành chính
- đa số user chỉ nên có quyền trong workspace

3. `resource override` nếu cần sau
- campaign cụ thể
- telegram group cụ thể
- member cụ thể

Ở giai đoạn hiện tại, đủ dùng nhất là:

- `OrganizationMembership`
- `WorkspaceMembership`

Và nên giảm vai trò của `UserRole` toàn cục.

## Data model đề xuất

### Nên giữ

- `User`
- `Role`
- `Permission`
- `RolePermission`
- `WorkspaceMembership`

### Nên thêm

- `OrganizationMembership`

Ví dụ:

```txt
User
OrganizationMembership(userId, organizationId, roleId)
WorkspaceMembership(userId, workspaceId, roleId)
Role
Permission
RolePermission(roleId, permissionId)
```

### Nên giảm dần / bỏ

- `UserRole` toàn cục

Lý do:

- role toàn cục làm mọi user dễ bị “vượt quyền” giữa các workspace
- sau này nhiều khách hàng / nhiều tenant sẽ rất khó kiểm soát

Nếu chưa refactor schema ngay, thì quy ước tạm:

- `UserRole` chỉ giữ cho `SuperAdmin`
- user thường chỉ lấy quyền từ `WorkspaceMembership`

## Permission naming convention

Permission nên đặt theo mẫu:

```txt
<domain>.<action>
```

Ví dụ:

- `organization.view`
- `organization.manage`
- `workspace.view`
- `workspace.manage`
- `campaign.view`
- `campaign.manage`
- `campaign.assign`
- `member.view`
- `member.edit`
- `member.export`
- `member360.view`
- `member360.edit`
- `moderation.view`
- `moderation.review`
- `moderation.config`
- `moderation.enforce`
- `spam.view`
- `spam.config`
- `spam.review`
- `spam.enforce`
- `autopost.view`
- `autopost.manage`
- `autopost.dispatch`
- `telegram.view`
- `telegram.manage`
- `telegram.webhook`
- `settings.view`
- `settings.manage`
- `role.view`
- `role.manage`
- `user.view`
- `user.manage`
- `log.view`
- `log.export`
- `log.prune`
```

## Permission catalog đề xuất

### A. Organization

- `organization.view`
- `organization.manage`

### B. Workspace

- `workspace.view`
- `workspace.manage`

### C. Campaign

- `campaign.view`
- `campaign.manage`
- `campaign.assign`

### D. Member

- `member.view`
- `member.edit`
- `member.export`

### E. Member 360

- `member360.view`
- `member360.edit`

### F. Moderation / Spam

- `moderation.view`
- `moderation.review`
- `moderation.config`
- `moderation.enforce`
- `spam.view`
- `spam.config`
- `spam.review`
- `spam.enforce`

### G. Autopost

- `autopost.view`
- `autopost.manage`
- `autopost.dispatch`

### H. Telegram

- `telegram.view`
- `telegram.manage`

### I. Settings

- `settings.view`
- `settings.manage`

### J. Roles / Users

- `role.view`
- `role.manage`
- `user.view`
- `user.manage`

### K. Logs

- `log.view`
- `log.export`
- `log.prune`

## Role chuẩn đề xuất

### 1. SuperAdmin

Scope:
- organization

Quyền:
- tất cả

Use case:
- owner hệ thống
- setup nhiều workspace
- hardening / recovery / debug

### 2. OrganizationAdmin

Scope:
- organization

Quyền:
- `organization.view`
- `workspace.view`
- `workspace.manage`
- `role.view`
- `user.view`
- `log.view`

Use case:
- admin tổng của khách hàng

### 3. WorkspaceAdmin

Scope:
- workspace

Quyền:
- `workspace.view`
- `campaign.view`
- `campaign.manage`
- `campaign.assign`
- `member.view`
- `member.edit`
- `member.export`
- `member360.view`
- `member360.edit`
- `moderation.view`
- `moderation.review`
- `moderation.config`
- `moderation.enforce`
- `spam.view`
- `spam.config`
- `spam.review`
- `spam.enforce`
- `autopost.view`
- `autopost.manage`
- `autopost.dispatch`
- `telegram.view`
- `telegram.manage`
- `settings.view`
- `settings.manage`
- `role.view`
- `user.view`
- `user.manage`
- `log.view`
- `log.export`
- `log.prune`

### 4. CampaignManager

Scope:
- workspace

Quyền:
- `campaign.view`
- `campaign.manage`
- `campaign.assign`
- `member.view`
- `member.export`
- `member360.view`
- `autopost.view`
- `autopost.manage`
- `autopost.dispatch`

### 5. Moderator

Scope:
- workspace hoặc group

Quyền:
- `member.view`
- `member360.view`
- `moderation.view`
- `moderation.review`
- `moderation.enforce`
- `spam.view`
- `spam.review`
- `spam.enforce`
- `log.view`

### 6. ContentOperator

Scope:
- workspace

Quyền:
- `campaign.view`
- `autopost.view`
- `autopost.manage`
- `autopost.dispatch`

### 7. Viewer / Auditor

Scope:
- workspace

Quyền:
- `campaign.view`
- `member.view`
- `member360.view`
- `moderation.view`
- `spam.view`
- `autopost.view`
- `telegram.view`
- `settings.view`
- `role.view`
- `user.view`
- `log.view`

## Menu visibility map

Menu phải ẩn hoàn toàn nếu user không có ít nhất 1 quyền hợp lệ của màn đó.

### Dashboard

Luôn hiện nếu đã login.

### Campaigns

Hiện khi có:

- `campaign.view`
- hoặc `campaign.manage`

### Members

Hiện khi có:

- `member.view`
- `member.edit`
- `campaign.view`
- `campaign.manage`

### Member360

Hiện khi có:

- `member360.view`
- hoặc `member360.edit`

### Moderation

Hiện khi có:

- `moderation.view`
- `moderation.review`
- `moderation.config`
- `moderation.enforce`

### Spam

Hiện khi có:

- `spam.view`
- `spam.review`
- `spam.config`
- `spam.enforce`

### Autopost

Hiện khi có:

- `autopost.view`
- `autopost.manage`
- `autopost.dispatch`

### Telegram

Hiện khi có:

- `telegram.view`
- hoặc `telegram.manage`

### Roles

Hiện khi có:

- `role.view`
- `role.manage`
- `user.view`
- `user.manage`

### Settings

Hiện khi có:

- `settings.view`
- hoặc `settings.manage`

### Workspaces

Hiện khi có:

- `workspace.view`
- `workspace.manage`
- `organization.view`
- `organization.manage`

## Action-level permission map

### Campaigns

- xem danh sách: `campaign.view`
- tạo/sửa/xóa: `campaign.manage`
- gán người phụ trách: `campaign.assign`

### Members

- xem danh sách: `member.view`
- sửa owner/note/source: `member.edit`
- export CSV: `member.export`

### Member360

- xem profile: `member360.view`
- sửa dữ liệu CRM: `member360.edit`

### Moderation / Spam

- xem log: `moderation.view` hoặc `spam.view`
- review case: `moderation.review` hoặc `spam.review`
- sửa policy/rule: `moderation.config` hoặc `spam.config`
- ban/restrict/allow/delete thật: `moderation.enforce` hoặc `spam.enforce`

### Autopost

- xem lịch: `autopost.view`
- tạo/sửa schedule: `autopost.manage`
- dispatch ngay: `autopost.dispatch`

### Telegram

- xem bot/group status: `telegram.view`
- đăng ký webhook, discover group, config token: `telegram.manage`

### Settings

- xem settings: `settings.view`
- sửa settings: `settings.manage`

### Roles / Users

- xem role/user: `role.view`, `user.view`
- sửa role/user: `role.manage`, `user.manage`

### Logs

- xem log: `log.view`
- tải JSON/CSV: `log.export`
- prune logs: `log.prune`

## Quy tắc check ở backend

Backend nên thống nhất:

1. page/list endpoint:
- dùng `*.view`

2. mutation endpoint:
- dùng `*.manage`, `*.config`, `*.enforce`, `*.dispatch`

3. hành động nguy hiểm:
- không dùng quyền xem thay cho quyền chạy
- ví dụ:
  - `Ban`, `Restrict`, `Delete message`, `Decline join request`
  - phải cần `moderation.enforce` hoặc `spam.enforce`

4. endpoint đa module:
- check theo action thực tế
- ví dụ export log:
  - không dùng `moderation.review`
  - dùng `log.export`

## Quy tắc check ở frontend

Frontend nên có 1 file duy nhất kiểu:

```txt
page-access.ts
action-access.ts
```

### `page-access.ts`

Chỉ quyết định:

- menu nào hiện
- route nào được vào

### `action-access.ts`

Chỉ quyết định:

- nút nào hiện
- form nào editable
- nút submit nào enabled

Ví dụ:

```txt
canViewCampaigns
canManageCampaigns
canReviewSpam
canEnforceSpam
canExportLogs
canManageSettings
```

## Trạng thái refactor đề xuất

### Pha 1: Chuẩn hóa permission ngay, ít đổi schema

Làm ngay:

- bổ sung permission mới
- sửa menu map
- sửa guard map theo permission mới
- tách `settings.manage` và `moderation.review` đang quá rộng

Giữ tạm:

- `UserRole`
- `WorkspaceMembership`

Nhưng quy ước:

- user thường lấy quyền theo workspace
- `UserRole` chủ yếu chỉ giữ cho `SuperAdmin`

### Pha 2: Tách membership chuẩn

Làm sau:

- thêm `OrganizationMembership`
- giảm vai trò `UserRole`
- toàn bộ quyền runtime lấy từ membership theo scope

## Mapping từ quyền cũ sang quyền mới

### Hiện tại

- `organization.manage`
- `workspace.manage`
- `campaign.view`
- `campaign.manage`
- `moderation.review`
- `settings.manage`
- `autopost.execute`

### Mapping đề xuất

- `organization.manage` -> `organization.view`, `organization.manage`
- `workspace.manage` -> `workspace.view`, `workspace.manage`
- `campaign.view` -> `campaign.view`
- `campaign.manage` -> `campaign.view`, `campaign.manage`, `campaign.assign`
- `moderation.review` -> `moderation.view`, `moderation.review`, `spam.view`, `spam.review`
- `settings.manage` -> `settings.view`, `settings.manage`, `telegram.view`, `telegram.manage`, `role.view`, `user.view`
- `autopost.execute` -> `autopost.view`, `autopost.manage`, `autopost.dispatch`

Nếu user hiện tại đang là admin tổng workspace, có thể gán thêm:

- `member.view`
- `member.edit`
- `member.export`
- `member360.view`
- `member360.edit`
- `moderation.config`
- `moderation.enforce`
- `spam.config`
- `spam.enforce`
- `log.view`
- `log.export`
- `log.prune`

## Đề xuất áp dụng cho project này

Để chạy ổn ngay, nên chốt matrix như sau:

### `SuperAdmin`

- full quyền

### `Admin`

- full quyền trong workspace
- không có `organization.manage`

### `Operator`

- `campaign.view`
- `campaign.manage`
- `member.view`
- `member360.view`
- `autopost.view`
- `autopost.manage`
- `autopost.dispatch`

### `Moderator`

- `member.view`
- `member360.view`
- `moderation.view`
- `moderation.review`
- `moderation.enforce`
- `spam.view`
- `spam.review`
- `spam.enforce`
- `log.view`

### `Viewer`

- chỉ quyền xem

## Kết luận

Cách tổ chức tốt nhất cho hệ thống này là:

- role để đóng gói
- permission để thực thi
- membership để gán theo scope
- menu/page/action đều dựa trên cùng permission map
- bỏ kiểu một quyền rộng gánh nhiều module

Nếu triển khai đúng theo cấu trúc này, bạn sẽ có:

- ít bug “thấy menu nhưng bấm không được”
- ít bug “API chặn nhưng UI vẫn hiện”
- dễ thêm module mới
- dễ audit khi release production

## Việc nên làm tiếp

1. Chuẩn hóa lại permission catalog trong seed và bootstrap.
2. Tạo `action-access.ts` ở frontend.
3. Sửa `page-access.ts` theo matrix mới.
4. Tách dần `UserRole` toàn cục khỏi user thường.
5. Thêm `OrganizationMembership` nếu xác định đi multi-tenant lâu dài.
