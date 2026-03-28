# TELEGRAM OPERATIONS PLATFORM
## AI EXECUTION WORKFLOW (ONE-CHAT BUILD PROTOCOL)

---

# 1. MỤC TIÊU CỦA FILE NÀY

File này không mô tả feature nữa.
File này mô tả **cách AI phải làm việc** để giảm lỗi, build có thứ tự, và cố gắng hoàn thành được nhiều nhất ngay trong **một lần chat**.

Mục tiêu:
- làm theo trình tự khoa học
- giảm sửa đi sửa lại
- tránh code trước rồi mới nghĩ kiến trúc sau
- tránh bỏ sót migration / env / seed / test
- đảm bảo sau mỗi phase hệ thống vẫn chạy được

---

# 2. NGUYÊN TẮC LÀM VIỆC CỦA AI

AI phải tuân thủ các nguyên tắc sau:

## 2.1 Không nhảy cóc
Không được code dashboard, UI đẹp, WebSocket, AI moderation trước khi hoàn thành:
- project structure
- env
- database
- auth
- RBAC cơ bản
- module nền tảng

## 2.2 Làm theo phase nhỏ nhưng hoàn chỉnh
Mỗi phase phải:
- code xong phần mình phụ trách
- tự kiểm tra dependency
- không làm vỡ phần cũ
- có thể chạy được ngay sau phase đó

## 2.3 Luôn ưu tiên khả năng chạy được
Ưu tiên:
1. chạy được
2. đúng luồng
3. dễ maintain
4. đẹp sau

Không ưu tiên UI cầu kỳ nếu backend chưa ổn định.

## 2.4 Không tạo giả định mơ hồ
Nếu thiếu thông tin, AI phải:
- chọn phương án mặc định hợp lý
- ghi rõ assumption trong README/spec
- không được tự ý đổi kiến trúc giữa chừng

## 2.5 Không overengineering
Chỉ build đúng scope MVP trước.
Không thêm quá nhiều abstraction nếu chưa cần.

---

# 3. CHIẾN LƯỢC BUILD TRONG 1 LẦN CHAT

Khi người dùng yêu cầu “build luôn trong 1 lần chat”, AI phải hiểu là:
- không hỏi lan man nhiều vòng
- tự chia phase
- tự chọn thứ tự hợp lý
- mỗi phase sinh ra output rõ ràng
- cố gắng tạo code/spec đủ để dev chạy tiếp

## Cách làm:
AI phải chia kết quả thành 4 lớp:

### Lớp 1 - Foundation
- monorepo structure
- docker compose
- env example
- database schema
- seed

### Lớp 2 - Core business
- auth
- RBAC
- campaign
- webhook receiver
- queue worker

### Lớp 3 - Smart features
- manual anti-spam
- AI moderation
- smart link analysis
- autopost
- WebSocket

### Lớp 4 - Hardening
- audit log
- validation
- error handling
- test
- README

AI phải hoàn thành lần lượt theo lớp này.

---

# 4. WORKFLOW CHUẨN CHO AI CODER

## STEP 1 - Read & lock scope
AI phải đọc toàn bộ spec trước khi code.
Sau đó tự chốt lại:
- mục tiêu hệ thống
- module cần build
- module nào là MVP
- module nào để phase sau

### Output cần có:
- danh sách module
- build order
- assumptions

---

## STEP 2 - Lock architecture
Trước khi viết code, AI phải khóa kiến trúc:
- Frontend: Next.js
- Backend: NestJS
- AI service: FastAPI
- DB: PostgreSQL
- Queue: Redis + BullMQ
- Realtime: Socket.IO

### Output cần có:
- architecture summary
- folder structure
- service boundaries

Sau khi khóa xong thì không được giữa chừng đổi sang stack khác.

---

## STEP 3 - Create project skeleton first
AI phải tạo skeleton trước:
- thư mục apps/
- packages/
- infra/
- docs/
- Docker Compose
- env.example
- package.json / requirements.txt

### Output cần có:
- cây thư mục
- file khởi tạo cơ bản
- command chạy local

---

## STEP 4 - Design database before API
AI phải tạo database schema trước khi viết API.

### Việc cần làm:
- xác định entity
- xác định relation
- xác định enum/status
- xác định unique/index cơ bản

### Output cần có:
- Prisma schema
- migration plan
- seed data plan

Không được viết API CRUD quá sâu khi schema chưa ổn.

---

## STEP 5 - Build auth + RBAC first
Auth là xương sống.
Phải build trước các module business.

### Việc cần làm:
- login
- JWT
- refresh token
- current user
- role guard
- permission guard

### Output cần có:
- auth module
- user module cơ bản
- roles/permissions seed
- protected route example

---

## STEP 6 - Build campaign core next
Sau auth mới tới business core.

### Việc cần làm:
- campaign CRUD
- telegram group entity
- invite link entity
- campaign detail API

### Output cần có:
- campaign module hoàn chỉnh mức cơ bản
- DB mapping ổn định

---

## STEP 7 - Add webhook ingestion before intelligence
Phải nhận event được trước rồi mới chống spam thông minh.

### Việc cần làm:
- Telegram webhook endpoint
- save raw event
- push queue
- worker consume queue

### Output cần có:
- event ingestion flow chạy được end-to-end

---

## STEP 8 - Build manual anti-spam first
Không làm AI anti-spam trước rule-based.

### Việc cần làm:
- blocked keywords
- blocked domains
- link detection
- join-and-spam detection
- moderation action log

### Output cần có:
- rule engine chạy được không cần AI

---

## STEP 9 - Add AI moderation as enhancement
Sau khi manual anti-spam chạy ổn mới thêm AI.

### Việc cần làm:
- FastAPI moderate endpoint
- message classification
- risk scoring
- combine manual + AI result
- manual review queue

### Output cần có:
- AI contract
- fallback logic nếu AI fail

Rất quan trọng:
Nếu AI service lỗi, hệ thống vẫn phải hoạt động với manual rules.

---

## STEP 10 - Add WebSocket after event flow is stable
Không làm realtime trước khi event flow ổn định.

### Việc cần làm:
- socket gateway
- JWT socket auth
- room strategy
- emit từ worker/service

### Output cần có:
- dashboard nhận event real-time
- moderation panel nhận spam alert real-time

---

## STEP 11 - Build autopost after queue foundation exists
Autopost phụ thuộc queue nên làm sau.

### Việc cần làm:
- template CRUD
- schedule CRUD
- BullMQ job
- retry logic
- send log

### Output cần có:
- autopost flow chạy được end-to-end

---

## STEP 12 - Build dashboard last
Dashboard chỉ là lớp hiển thị.
Không được làm trước các module nền.

### Việc cần làm:
- summary API
- widget UI
- live charts nếu có
- recent events

### Output cần có:
- dashboard hiển thị dữ liệu thật
- không mock nếu backend đã có dữ liệu thật

---

## STEP 13 - Harden before declaring done
Trước khi nói “xong”, AI phải rà lại:
- env
- validation
- error handling
- logs
- README
- run command
- migration
- seed

---

# 5. CƠ CHẾ TỰ KIỂM TRA LỖI CỦA AI

AI phải tự kiểm tra theo checklist sau sau mỗi phase.

## 5.1 Dependency check
- import có tồn tại không
- package/library đã khai báo chưa
- file path có đúng không
- env variable có thiếu không

## 5.2 Runtime check
- module có boot được không
- Docker có chạy được không
- DB có migrate được không
- seed có chạy được không

## 5.3 Contract check
- API response có khớp DTO không
- WebSocket event name có thống nhất không
- AI service request/response có đúng contract không

## 5.4 Data check
- relation có đúng không
- foreign key có hợp lý không
- enum/status có nhất quán không
- delete/update có ảnh hưởng dữ liệu liên quan không

## 5.5 Fallback check
- nếu Telegram API fail thì sao
- nếu AI moderation fail thì sao
- nếu Redis down thì sao
- nếu WebSocket disconnect thì sao

---

# 6. QUY TẮC GIẢM LỖI KHI AI CODE

## 6.1 Không code file dài vô hạn
Mỗi module nên tách:
- controller
- service
- dto
- entity/schema
- gateway nếu cần

## 6.2 Không nhét logic vào controller
Controller chỉ:
- nhận request
- validate
- gọi service
- trả response

## 6.3 Không nhét logic vào gateway
WebSocket gateway chỉ:
- auth connect
- join room
- emit event

## 6.4 Business logic ở service / worker
Các xử lý như:
- spam check
- autopost dispatch
- invite tracking
- moderation decision
phải nằm ở service hoặc worker.

## 6.5 Có fallback rõ ràng
Ví dụ:
- AI fail => dùng manual rule
- WebSocket fail => dữ liệu vẫn lưu DB
- autopost fail => retry queue

## 6.6 Không phá backward compatibility trong cùng 1 lần build
Nếu đã đặt tên event/API thì giữ ổn định.
Không tự đổi giữa chừng.

---

# 7. FORMAT OUTPUT TỐT NHẤT CHO 1 LẦN CHAT

Khi AI trả lời để build trong 1 lần chat, nên trả theo format này:

## Part A - Architecture lock
- stack
- module
- assumptions

## Part B - File/folder structure
- monorepo tree
- infra files

## Part C - Database schema
- entity list
- relation
- Prisma schema

## Part D - Backend core
- NestJS modules
- auth
- campaign
- webhook
- queue

## Part E - AI + spam
- manual rule engine
- AI moderation contract
- fallback

## Part F - Realtime
- socket gateway
- room strategy
- emitted events

## Part G - Frontend
- pages
- layout
- data flow

## Part H - Run/Test
- docker command
- migrate
- seed
- dev run
- smoke test

Như vậy người dùng sẽ nhận được output đầy đủ, ít thiếu sót hơn.

---

# 8. PROMPT MẪU ĐỂ ÉP AI LÀM VIỆC ĐÚNG QUY TRÌNH

Dưới đây là prompt mẫu nên dùng cho AI coder:

```md
Bạn là lead engineer kiêm AI coding agent.
Hãy build hệ thống theo đúng thứ tự kỹ thuật, hạn chế tối đa lỗi runtime và dependency.

Yêu cầu bắt buộc:
1. Không hỏi lại nhiều vòng.
2. Tự chia phase và tự chọn assumption hợp lý nếu thiếu thông tin.
3. Ưu tiên code chạy được trước, đẹp sau.
4. Không được nhảy cóc làm dashboard hoặc UI đẹp khi backend foundation chưa xong.
5. Sau mỗi phase phải tự check consistency giữa schema, DTO, API, queue, websocket event.
6. Nếu AI moderation service lỗi, hệ thống vẫn phải chạy bằng manual rule.
7. Nếu websocket lỗi, dữ liệu vẫn phải lưu DB đầy đủ.
8. Output phải gồm: project tree, Prisma schema, backend modules, API endpoints, queue flow, websocket flow, AI moderation contract, env example, docker compose, local run commands, smoke test checklist.
9. Làm theo thứ tự: infra -> schema -> auth -> RBAC -> campaign -> webhook -> queue -> manual anti-spam -> AI anti-spam -> websocket -> autopost -> dashboard -> hardening.
10. Khi có assumption, ghi rõ trong phần Assumptions, không tự đổi giữa chừng.

Hãy trả kết quả như một bản build spec/dev-ready spec có thể dùng để code luôn.
```

---

# 9. PROMPT MẪU ĐỂ AI CODE TỪNG PHASE NHƯNG VẪN ÍT LỖI

```md
Bây giờ hãy thực hiện Phase 1 đến Phase 3 trước.
Mỗi phase phải có:
- mục tiêu
- file cần tạo
- code skeleton
- env cần thiết
- command chạy thử
- checklist verify

Không được bỏ qua migration, seed, validation và error handling cơ bản.
Sau khi xong mỗi phase, tự rà soát import/dependency trước khi chuyển phase tiếp theo.
```

---

# 10. CÁCH ĐỂ “LÀM HẾT TRONG 1 LẦN CHAT” THỰC TẾ

Thực tế, “làm hết trong 1 lần chat” nên hiểu đúng là:
- AI tạo được spec đủ sâu
- AI tạo được skeleton đủ chuẩn
- AI tạo được phần code nền quan trọng nhất
- AI đưa ra build order rất rõ
- AI không để kiến trúc lộn xộn

Không nên ép AI trong 1 lần chat phải:
- viết toàn bộ production code hàng chục nghìn dòng hoàn hảo
- full test 100%
- full UI hoàn chỉnh
- không có bug nào

Cách làm đúng là:
- 1 lần chat để tạo bản thiết kế + skeleton + phase plan + phần code nền quan trọng
- sau đó AI/dev chỉ việc đi tiếp đúng trục, không bị loạn

---

# 11. KẾT LUẬN

Nếu muốn AI làm việc khoa học, ít lỗi, và hiệu quả trong một lần chat, thì phải ép AI theo 5 nguyên tắc:

1. **Khóa kiến trúc trước**
2. **Khóa schema trước API**
3. **Làm foundation trước UI**
4. **Làm manual rules trước AI thông minh**
5. **Mỗi phase phải tự kiểm tra lại dependency, runtime, contract, fallback**

Mô hình đúng nhất cho project này là:
**Spec rõ -> skeleton chuẩn -> core flow chạy được -> smart feature -> realtime -> hardening**

---

# END

