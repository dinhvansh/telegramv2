# RBAC Workspace Operating Model

## 1. Nguyên tắc

- Mỗi nhóm vận hành là một `workspace`
- Workspace này không thấy dữ liệu workspace khác
- Role là role trong workspace, không phải global role thuần

## 2. Role chuẩn

### Quản trị hệ thống

- Toàn tenant
- Quản lý organization, workspace, membership
- Thấy mọi workspace

### Quản trị workspace

- Full quyền trong workspace của mình
- Tạo user
- Gán role trong workspace
- Quản lý settings, bot, campaign, moderation, autopost

### Vận hành

- Full quyền vận hành trong workspace
- Không tạo user
- Không đổi membership

### Kiểm duyệt viên

- Review moderation
- Xử lý spam

### Cộng tác viên

- Chỉ xem campaign/link/kết quả được giao
- Không thấy dữ liệu quản trị

## 3. Permission code đang dùng

- `organization.manage`
- `workspace.manage`
- `campaign.view`
- `campaign.manage`
- `moderation.review`
- `settings.manage`
- `autopost.execute`
- `contacts.manage`

## 4. Quy tắc menu

- Menu chỉ hiện nếu user có permission cần thiết
- Không chỉ ẩn menu, API cũng phải chặn tương ứng

## 5. Quy tắc dữ liệu

- Không có `organization.manage` thì phải bị scope theo workspace hiện tại
- Không dùng `campaign.manage` để mở rộng trái phép sang member/moderation nếu không có spec rõ ràng
