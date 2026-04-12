# Task Tracker

## Current Focus

### T1. Contacts import an toàn cho file lớn

- [x] Hỗ trợ `contacts.list`
- [x] Sửa QR `expiresIn`
- [x] Tăng delay giữa các lần resolve
- [ ] Tạo import batch
- [ ] Tạo worker nền
- [ ] Tạo màn progress

### T2. Contacts mapping

- [ ] Tạo mô hình `customer/lead` rõ ràng
- [ ] Map phone sang customer
- [ ] Link `telegramUser` với customer

### T3. Production cleanup

- [x] Fix missing `TELEGRAM_API_ID/HASH` trong env example
- [x] Fix `contacts.manage` cho role chuẩn
- [ ] Dọn sạch text mojibake còn sót

## Notes

- Không dùng màn import hiện tại cho file vài nghìn contact trên production.
- Nếu live báo `AUTH_KEY_UNREGISTERED`, phải xóa session MTProto cũ và QR login lại.
