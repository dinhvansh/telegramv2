# Contacts Module Upgrade Plan

## Phạm vi

Tài liệu này áp dụng cho module:

- Web: `https://tele.blogthethao.org/contacts`
- API: `/api/contacts/*`
- Dịch vụ MTProto dùng để resolve Telegram user ID từ số điện thoại

Mục tiêu là nâng cấp module từ mức `dùng được để test` sang mức `chịu được file lớn, an toàn hơn cho tài khoản Telegram, và có thể vận hành dài hạn`.

## Hiện trạng đang có

### Web

Màn `/contacts` hiện có 2 tab:

- `Import Contacts`
- `QR Session`

Luồng UI hiện tại:

1. Đăng nhập bằng user có quyền `contacts.manage`
2. Tạo QR session
3. Quét QR bằng tài khoản Telegram thật
4. Upload file JSON
5. Bấm `Import & Resolve`
6. Web gọi `POST /api/contacts/import`
7. Request chờ đến khi backend xử lý xong

### API

Các endpoint đang có:

- `POST /api/contacts/auth/qr/start`
- `GET /api/contacts/auth/qr/poll`
- `GET /api/contacts/auth/qr/confirm`
- `GET /api/contacts/auth/status`
- `POST /api/contacts/import`

### Dữ liệu JSON đang hỗ trợ

Hệ thống hiện chấp nhận 2 kiểu:

1. Array phẳng:

```json
[
  {
    "phone_number": "+84...",
    "first_name": "Tên",
    "last_name": "..."
  }
]
```

2. Telegram export object:

```json
{
  "contacts": {
    "list": [
      {
        "phone_number": "+84...",
        "first_name": "Tên",
        "last_name": "..."
      }
    ]
  }
}
```

Lưu ý:

- `frequent_contacts.list` hiện chưa được import như một luồng riêng
- hệ thống hiện chỉ dùng `contacts.list`

### Cách resolve hiện tại

Backend đang làm như sau:

1. Parse contacts từ body
2. Gọi `contacts.service.importContacts(...)`
3. Nếu MTProto chưa authenticated:
   - vẫn import contact vào DB
   - trả trạng thái chưa resolve
4. Nếu MTProto đã authenticated:
   - resolve tuần tự từng contact
   - gọi Telegram `contacts.ImportContacts`
   - nếu tìm được Telegram user:
     - upsert vào `telegramUser`
   - nếu không tìm được:
     - đánh dấu failed hoặc unresolved

### Delay bảo vệ hiện tại

Code đã có nhịp xử lý an toàn hơn:

- `CONTACT_RESOLVE_MIN_DELAY_MS`
- `CONTACT_RESOLVE_MAX_DELAY_MS`
- `CONTACT_RESOLVE_BATCH_SIZE`
- `CONTACT_RESOLVE_BATCH_COOLDOWN_MS`

Mặc định hiện tại:

- chờ ngẫu nhiên `4-7 giây` mỗi số
- cứ `20` số thì nghỉ `60 giây`

Mục đích:

- giảm nguy cơ `FLOOD_WAIT`
- giảm nguy cơ Telegram đánh dấu tài khoản là import quá mạnh

## Vấn đề hiện tại

### 1. Request chạy đồng bộ quá lâu

Đây là vấn đề lớn nhất.

`POST /api/contacts/import` hiện xử lý cả file trong cùng một request. Khi upload vài nghìn contact:

- tab web chờ rất lâu
- browser có thể treo hoặc crash
- reverse proxy có thể timeout
- khó quan sát progress thật

### 2. Chưa có batch job nền

Hệ thống chưa có:

- batch import
- queue worker
- progress state
- retry failed item
- cancel batch

### 3. Rủi ro với tài khoản Telegram

Dù đã tăng delay, việc import vài nghìn số liên tiếp vẫn có rủi ro:

- `AUTH_KEY_UNREGISTERED`
- `FLOOD_WAIT`
- session invalid
- Telegram hạn chế account tạm thời

### 4. Chưa map hoàn chỉnh sang customer/lead

Sau khi resolve được Telegram user ID, hệ thống hiện chủ yếu upsert vào `telegramUser`.

Chưa có flow chuẩn để:

- match theo phone vào `customer` hoặc `lead`
- tạo lead mới khi chưa có customer
- link batch import với owner hoặc workspace scope chi tiết

### 5. Chưa có trang kết quả import

Hiện người dùng chỉ biết:

- request xong hay chưa
- resolved/skipped/failed tổng quát

Chưa có:

- lịch sử batch
- chi tiết từng item
- export kết quả

## Mục tiêu nâng cấp

Sau khi nâng cấp, module `/contacts` phải đạt các tiêu chí sau:

1. Upload file lớn không làm treo tab
2. Xử lý nền bằng queue
3. Có progress rõ ràng
4. Giảm rủi ro rate-limit Telegram
5. Có thể retry failed items
6. Có thể cancel batch
7. Kết quả resolve được link vào dữ liệu khách hàng
8. Có audit/log đủ để debug khi live lỗi

## Kiến trúc đề xuất

### 1. Tách thành batch import

Thay vì xử lý ngay trong request, API sẽ:

1. nhận file
2. parse contacts
3. tạo `batch`
4. tạo `items`
5. enqueue job
6. trả `batchId` ngay

### 2. Dùng queue worker

Khuyến nghị dùng:

- `BullMQ`
- `Redis`

Worker sẽ:

- lấy từng batch
- chia item thành chunk
- resolve lần lượt
- cập nhật progress

### 3. Chunking và cooldown

Khuyến nghị mặc định:

- `chunk size`: `20-50`
- `delay/contact`: `4-7s`
- `cooldown/chunk`: `60-120s`
- `max concurrent worker`: `1`

Mục tiêu là giữ hệ thống chậm có kiểm soát thay vì nhanh nhưng dễ chết session.

### 4. Kết quả lưu thành item riêng

Mỗi contact phải có trạng thái riêng:

- `pending`
- `processing`
- `resolved`
- `skipped`
- `failed`

Và có thêm:

- `errorMessage`
- `attemptCount`
- `processedAt`
- `telegramExternalId`
- `telegramUsername`

## Thiết kế dữ liệu đề xuất

### contact_import_batches

- `id`
- `workspaceId`
- `createdByUserId`
- `sourceType`
- `sourceFileName`
- `status`
- `totalCount`
- `processedCount`
- `resolvedCount`
- `skippedCount`
- `failedCount`
- `startedAt`
- `finishedAt`
- `errorMessage`

### contact_import_items

- `id`
- `batchId`
- `phoneNumber`
- `firstName`
- `lastName`
- `displayName`
- `status`
- `telegramExternalId`
- `telegramUsername`
- `errorMessage`
- `attemptCount`
- `processedAt`

### frequent_contact_items

Tùy chọn, dùng cho enrichment:

- `id`
- `batchId`
- `telegramId`
- `type`
- `name`
- `rating`

## Luồng chuẩn sau nâng cấp

### Luồng upload

1. User upload file JSON
2. API parse:
   - array phẳng
   - hoặc `contacts.list`
3. API tạo batch
4. API tạo items
5. API enqueue job
6. API trả:
   - `batchId`
   - `totalCount`
   - `status = queued`

### Luồng worker

1. Worker lấy batch
2. Worker đánh dấu `processing`
3. Worker resolve từng item theo chunk
4. Sau mỗi item:
   - cập nhật item state
   - cập nhật counters ở batch
5. Hết batch:
   - `completed`
   - hoặc `failed`

### Luồng UI

1. UI tạo batch
2. UI poll:
   - `GET /api/contacts/import-batches/:id`
3. UI hiện:
   - progress
   - resolved
   - skipped
   - failed
4. UI cho xem chi tiết item phân trang

## API đề xuất

- `POST /api/contacts/import-batches`
- `GET /api/contacts/import-batches`
- `GET /api/contacts/import-batches/:id`
- `GET /api/contacts/import-batches/:id/items?page=1&pageSize=50`
- `POST /api/contacts/import-batches/:id/retry`
- `POST /api/contacts/import-batches/:id/cancel`

API cũ `POST /api/contacts/import` nên giữ thêm một thời gian rồi chuyển sang deprecated.

## Xử lý MTProto và session

### Quy tắc bắt buộc

1. `TELEGRAM_API_ID` và `TELEGRAM_API_HASH` phải có ở production
2. QR login phải trả `expiresIn` đúng theo số giây còn lại
3. Nếu gặp `AUTH_KEY_UNREGISTERED`:
   - dừng batch
   - đánh dấu batch failed
   - yêu cầu user QR login lại

### Các lỗi cần bắt riêng

- `AUTH_KEY_UNREGISTERED`
- `FLOOD_WAIT`
- session expired
- Telegram import error

### Hành vi mong muốn

- `AUTH_KEY_UNREGISTERED`: stop ngay
- `FLOOD_WAIT`: pause batch theo thời gian Telegram trả về
- lỗi tạm thời: retry item giới hạn

## Mapping sang customer/lead

Sau khi resolve được Telegram ID, hệ thống không nên dừng ở `telegramUser`.

Flow đúng:

1. upsert `telegramUser`
2. tìm customer/lead theo `phoneNumber`
3. nếu có:
   - link `customerId`
4. nếu chưa có:
   - tạo lead/customer mới
5. gắn:
   - `workspaceId`
   - `source = telegram_contact_import`
   - `importBatchId`

## Vai trò và quyền

Module này chỉ nên mở cho user có:

- `contacts.manage`

Scope theo workspace:

- chỉ import vào workspace đang chọn
- không được nhìn batch của workspace khác

## Nâng cấp UI

Màn `/contacts` nên có 3 khối:

### 1. Telegram Session

- trạng thái session
- QR code
- reconnect
- logout session

### 2. Tạo batch import

- upload file
- nhận cả `contacts.list`
- preview tổng số contact
- nút `Bắt đầu import`

### 3. Lịch sử batch

- file name
- created by
- total
- processed
- resolved
- failed
- status
- action

### 4. Chi tiết batch

- bảng item phân trang
- filter theo trạng thái
- retry failed
- export CSV/JSON

## Lộ trình triển khai

### Phase 1

- giữ importer hiện tại
- fix QR expires
- fix parse `contacts.list`
- fix pacing an toàn hơn

Trạng thái: đã có một phần.

### Phase 2

- thêm `contact_import_batches`
- thêm `contact_import_items`
- thêm API create/list/detail
- thêm UI batch history

### Phase 3

- thêm BullMQ worker
- chuyển `/contacts/import` sang enqueue job
- thêm progress poll

### Phase 4

- thêm retry, cancel, export result
- thêm customer/lead mapping

### Phase 5

- import thêm `frequent_contacts.list`
- dùng như nguồn enrichment, không merge cứng

## Khuyến nghị vận hành hiện tại

Trước khi hoàn tất batch queue, không nên:

- import vài nghìn contact một lượt trên live

Nên:

- test với `20-50` contact
- nếu cần import lớn, chia file nhỏ
- theo dõi log API trong lúc chạy

## Kết luận

Module `/contacts` hiện đã có giá trị để:

- kết nối tài khoản Telegram bằng QR
- import JSON contacts
- resolve user ID cơ bản

Nhưng chưa đủ an toàn để xử lý batch lớn trên production. Ưu tiên tiếp theo phải là:

1. batch import nền
2. queue worker
3. progress UI
4. customer mapping
5. `frequent_contacts` enrichment
