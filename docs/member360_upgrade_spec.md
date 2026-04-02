# Member 360 Upgrade Spec

## Mục tiêu
- Nhìn một user là biết đang ở bao nhiêu group.
- Thấy nhanh lịch sử ra/vào, campaign gần nhất và warning hiện tại.
- Chuẩn bị nền để lên hồ sơ 360 thật với session và moderation timeline.

## Phạm vi phase hiện tại
- Thêm menu mới `/member360`.
- Dựng UI prototype `Member 360` từ dữ liệu thành viên hiện có.
- Viết rõ checklist để triển khai phase dữ liệu thật sau đó.

## UI phase hiện tại
- Danh sách trái:
  - tìm theo tên, username, ID số, group
  - lọc theo group
  - badge nhanh:
    - số group active
    - số lần vào
    - số lần rời
    - tổng cảnh báo
- Panel phải:
  - `Tổng quan`
  - `Nhóm hiện tại`
  - `Lịch sử ra/vào`

## Nguồn dữ liệu phase hiện tại
- Dùng lại `GET /api/moderation/members`
- Gom nhóm theo `externalId`
- Timeline đang là timeline suy diễn từ:
  - `joinedAt`
  - `leftAt`
  - `warningCount`
  - `lastWarnedAt`

## Giới hạn phase hiện tại
- Chưa có session thật cho từng lần join/leave.
- Chưa có moderation timeline đầy đủ theo action log.
- Chưa có mapping invite link / campaign theo từng session join.
- Chưa có tab hành động nhanh ngay trong hồ sơ.

## Phase tiếp theo
1. Tạo model `TelegramUser`
2. Tạo model `GroupMember`
3. Tạo model `GroupMembershipSession`
4. Đổi API `/members` sang summary thật
5. Thêm API `/members/:telegramUserId/profile`
6. Thêm moderation timeline thật
7. Thêm campaign / invite timeline thật

## Checklist
- [x] Thêm route `/member360`
- [x] Thêm item menu `Member 360`
- [x] Tạo màn prototype từ dữ liệu hiện có
- [x] Hiển thị `ID số`
- [x] Hiển thị số group active
- [x] Hiển thị tổng warning
- [x] Có tab `Tổng quan`
- [x] Có tab `Nhóm hiện tại`
- [x] Có tab `Lịch sử ra/vào`
- [ ] Tách model `TelegramUser`
- [ ] Tách model `GroupMember`
- [ ] Tách model `GroupMembershipSession`
- [ ] API profile 360 thật
- [ ] Timeline moderation thật
- [ ] Timeline campaign / invite thật
- [ ] Action nhanh trong hồ sơ user
