# Live Debug Runbook

## Mục tiêu

Khi hệ thống chạy production hoặc staging, cần có cách lấy log đủ nhanh để:

- xác nhận Telegram action có được gọi thật hay không
- biết rule/AI đã chấm điểm ra sao
- biết lỗi nằm ở UI, API, Telegram API hay dữ liệu đầu vào
- xuất log có cấu trúc để gửi lại cho người hỗ trợ/debug

## Nguồn log hiện có

### 1. Spam event log

API:

- `GET /api/moderation/events`

Dùng để xem:

- `matchedRules`
- `ruleScore`
- `aiScore`
- `finalScore`
- `decision`
- `manualDecision`
- `manualNote`
- `actionLogs`
- `groupExternalId`
- `messageExternalId`

UI:

- mở `http://localhost:3000/spam`
- bảng `Nhật ký chấm điểm spam`

### 2. System log có cấu trúc

API:

- `GET /api/system-logs`
- `GET /api/system-logs?limit=200`
- `GET /api/system-logs?scope=telegram.enforcement`
- `GET /api/system-logs?scope=telegram.webhook`
- `GET /api/system-logs?scope=moderation.manual`
- `GET /api/system-logs?level=WARN`

UI:

- mở `http://localhost:3000/spam`
- xuống phần `Nhật ký hệ thống`
- bấm `Tải JSON` để xuất file log

File JSON tải từ UI rất phù hợp để gửi khi cần debug live.

## Ý nghĩa các scope log

- `telegram.webhook`
  - webhook Telegram đã vào hệ thống chưa
  - event nào đã được parse
- `telegram.enforcement`
  - hệ thống có cố gọi `deleteMessage`, `banChatMember`, `restrictChatMember`, `approveChatJoinRequest`, `declineChatJoinRequest` hay không
- `moderation.manual`
  - operator bấm `Allow / Review / Restrict / Ban` trên UI lúc nào
- `telegram.config`
  - thay đổi token, webhook, public URL
- `telegram.discovery`
  - bot đã discover group nào
- `telegram.invite`
  - tạo invite link thành công hay thất bại

## Cách debug nhanh khi có sự cố

### Case 1. Spam không bị chặn

Kiểm tra theo thứ tự:

1. `GET /api/moderation/events`
2. tìm event gần nhất theo `actorUsername` hoặc `groupTitle`
3. xem:
   - `matchedRules`
   - `finalScore`
   - `decision`
4. nếu `decision` đã là `BAN/RESTRICT` nhưng Telegram không xử lý:
   - xem `actionLogs`
   - xem `GET /api/system-logs?scope=telegram.enforcement&limit=20`

Ý nghĩa:

- có `decision` nhưng không có `actionLogs`: nhánh enforcement chưa chạy
- có `actionLogs` nhưng `ok=false`: đã gọi Telegram API nhưng Telegram từ chối
- lỗi kiểu `chat not found`: bot chưa ở đúng group hoặc chat id không đúng
- lỗi kiểu `not enough rights`: bot chưa đủ quyền admin

### Case 2. Bấm manual action trên UI nhưng không có tác dụng

Kiểm tra:

1. vào `/spam`
2. bấm action trên đúng row
3. xem banner phản hồi ngay trên đầu trang
4. xem row đó có:
   - `manualDecision`
   - `manualNote`
   - `Telegram: ...`
5. xem `GET /api/system-logs?scope=moderation.manual&limit=20`

### Case 3. Telegram group hoặc invite link không hoạt động

Kiểm tra:

1. `GET /api/telegram/status`
2. `POST /api/telegram/discover-groups`
3. `GET /api/system-logs?scope=telegram.discovery&limit=20`
4. `GET /api/system-logs?scope=telegram.invite&limit=20`

## Dữ liệu nên gửi khi cần hỗ trợ

Nếu một chức năng live không chạy, nên gửi:

1. file `system-logs.json` tải từ UI `/spam`
2. payload từ `GET /api/moderation/events?limit=20` nếu liên quan spam
3. `GET /api/telegram/status`
4. thời điểm xảy ra lỗi
5. username Telegram hoặc group bị ảnh hưởng

## Khuyến nghị production

- giữ DB persistent, không reset seed khi restart container
- bật public webhook URL chuẩn HTTPS
- bot phải có quyền admin phù hợp trong group mục tiêu
- định kỳ export `system logs` khi có incident lớn
- nếu cần observability sâu hơn, có thể nối thêm:
  - Sentry cho API/UI
  - Loki/Promtail hoặc ELK cho log tập trung
  - Grafana để xem theo scope và level
