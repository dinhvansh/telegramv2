# TELEGRAM OPERATIONS PLATFORM
## Architecture + Business Flow (Full Guide)

---

# 1. OVERVIEW

## 1.1 Mục tiêu hệ thống
Xây dựng một platform quản trị Telegram (có thể mở rộng đa nền tảng) phục vụ:
- Quản lý chiến dịch (campaign)
- Quản lý link mời (invite link)
- Tracking user join
- Anti-spam / moderation
- Autopost (đăng bài tự động)
- Dashboard & analytics
- Phân quyền người dùng

---

# 2. TECH STACK RECOMMENDED

## Frontend
- Next.js (TypeScript)
- TailwindCSS
- shadcn/ui

## Backend
- NestJS (TypeScript)

## Database
- PostgreSQL

## Queue / Background Job
- Redis + BullMQ

## Infrastructure
- Docker + VPS

---

# 3. HIGH-LEVEL ARCHITECTURE

```
[Frontend - Next.js]
        |
        |---- REST API
        |
        |---- WebSocket (real-time)
        v
[API - NestJS]
        |
        |---- PostgreSQL (data)
        |
        |---- Redis (queue/cache/socket adapter)
        |
        |---- Worker (BullMQ)
        |
        |---- Telegram Webhook
        |
        |---- AI Moderation Service (FastAPI / Python)
```

## Kiến trúc tổng thể
Hệ thống nên được thiết kế theo hướng **modular monolith** ở giai đoạn đầu, sau đó có thể tách dần thành nhiều service khi scale.

### Thành phần chính:
- **Frontend Admin**: dashboard, campaign, moderation, autopost, settings
- **Core API**: auth, campaign, telegram integration, spam, analytics
- **Worker**: xử lý job nền, spam check, autopost, sync metrics
- **AI Moderation Service**: phân tích spam, link độc hại, scam detection, behavioral scoring
- **WebSocket Gateway**: đẩy event real-time cho dashboard và moderation panel

---- PostgreSQL (data)
        |
        |---- Redis (queue/cache)
        |
        |---- Worker (BullMQ)
        |
        |---- Telegram Webhook
```

---

# 4. CORE MODULES

## 4.1 Auth & Permission
- Users
- Roles
- Permissions
- RBAC

## 4.2 Campaign Management
- Campaign
- Invite Links
- Tracking

## 4.3 Telegram Integration
- Webhook receiver
- Bot API handler

## 4.4 Autopost
- Schedule
- Message templates
- Send logs

## 4.5 Anti-Spam (Manual + AI)
- Rule engine (manual rules)
- AI moderation engine
- Risk scoring
- Ban / mute / captcha

## 4.6 Analytics
- Growth tracking
- Campaign performance

## 4.7 System Settings
- Bot token
- Config

---

# 4.5.1 ANTI-SPAM STRATEGY (ADVANCED)

Hệ thống anti-spam nên gồm 2 layer:

## Layer 1 - Manual Rules (Rule-based)

### Các rule cơ bản:
- Chặn link (http, https, t.me, bit.ly...)
- Chặn keyword blacklist
- Giới hạn số message / thời gian
- Chặn user mới spam trong X phút đầu
- Chặn user có tên/username nghi ngờ

### Action:
- Delete message
- Mute user
- Ban user
- Warning

---

## Layer 2 - AI Moderation

### Mục tiêu:
- Detect spam tinh vi
- Phân loại nội dung
- Đánh giá risk user

### Các use case AI:
- Phân loại message: spam / normal / quảng cáo / scam
- Detect link độc hại
- Detect nội dung lừa đảo
- Phát hiện bot user

### AI Input:
- Message text
- Link trong message
- User history
- Join source (invite link nào)

### AI Output:
- label: spam | suspicious | normal
- risk_score: 0 - 100

---

## Risk Scoring System

Score dựa trên:
- Có link (+20)
- Keyword spam (+30)
- User mới (+10)
- Spam history (+40)
- AI prediction (+50)

### Action theo score:
- < 30: Allow
- 30 - 60: Warning
- 60 - 80: Mute
- > 80: Ban

---

## Hybrid Logic (Manual + AI)

```
Event -> Rule Engine -> AI Engine -> Combine Score -> Action
```

---

## Smart Link Detection

### Các loại link cần xử lý:
- URL rút gọn (bit.ly, tinyurl)
- Telegram link
- Domain blacklist

### Flow:
1. Extract link
2. Expand link (resolve short URL)
3. Check domain reputation
4. Send AI analyze content

---

## Spam Pattern Detection

- Gửi nhiều message giống nhau
- Copy paste nội dung
- Spam nhiều group
- Join rồi spam ngay

---

## CAPTCHA / Verification

- User mới phải verify
- Nếu fail -> kick

---

## Manual Moderation Dashboard

### Chức năng:
- Xem danh sách spam
- Approve / Reject
- Ban / Unban user
- Thêm keyword blacklist
- Thêm domain blacklist

---

## AI Service Architecture

```
API (NestJS)
   |
   v
AI Service (FastAPI / Python)
   |
   v
Model (OpenAI / local model)
```

---

## AI API Example

POST /ai/moderate

Request:
{
  "message": "Buy now cheap crypto...",
  "user_id": "123",
  "links": ["bit.ly/abc"]
}

Response:
{
  "label": "spam",
  "risk_score": 85
}

---

## Storage

- spam_events
- user_risk_scores
- moderation_logs

---

## Improvement

- Feedback loop (admin label lại)
- Train model lại

---

## 4.1 Auth & Permission
- Users
- Roles
- Permissions
- RBAC

## 4.2 Campaign Management
- Campaign
- Invite Links
- Tracking

## 4.3 Telegram Integration
- Webhook receiver
- Bot API handler

## 4.4 Autopost
- Schedule
- Message templates
- Send logs

## 4.5 Anti-Spam
- Rule engine
- Risk scoring
- Ban / mute

## 4.6 Analytics
- Growth tracking
- Campaign performance

## 4.7 System Settings
- Bot token
- Config

---

# 5. DATABASE DESIGN (SIMPLIFIED)

## Users & Roles
- users
- roles
- permissions
- user_roles
- role_permissions

## Campaign
- campaigns
- campaign_invite_links
- invite_link_events
- campaign_members

## Telegram
- telegram_groups
- telegram_accounts

## Autopost
- autopost_schedules
- autopost_jobs
- message_templates
- message_logs

## Spam
- spam_rules
- spam_events
- blocked_users

## Analytics
- campaign_metrics
- daily_metrics

---

# 6. BUSINESS FLOW

> Lưu ý: mọi flow cần phân biệt rõ 3 lớp xử lý:
> - **REST API**: thao tác CRUD, cấu hình, tạo campaign, tạo lịch
> - **Queue/Worker**: xử lý nền, retry, chống nghẽn request
> - **WebSocket**: cập nhật real-time lên giao diện admin/moderator


---

## 6.1 FLOW 1 - CREATE CAMPAIGN

### Steps:
1. User tạo campaign
2. Chọn Telegram group
3. Hệ thống gọi Telegram API tạo invite link
4. Lưu link vào DB
5. Bắt đầu tracking

### Flow diagram
```
User -> Frontend -> API -> Telegram API
                           |
                           v
                        Save DB
```

---

## 6.2 FLOW 2 - USER JOIN TRACKING

### Steps:
1. User click invite link
2. Join Telegram group
3. Telegram gửi webhook
4. Backend nhận event
5. Push vào queue
6. Worker xử lý:
   - Ghi nhận user
   - Map campaign
   - Update metrics
   - Emit real-time event qua WebSocket

### Flow diagram
```
Telegram -> Webhook -> API -> Queue -> Worker -> DB
                                          |
                                          v
                                      WebSocket
                                          |
                                          v
                               Dashboard / Moderation Panel
```

### Real-time event ví dụ:
- `user_joined`
- `campaign_metric_updated`
- `new_member_detected`

---

## 6.3 FLOW 3 - AUTOPOST

### Steps:
1. User tạo schedule
2. Lưu DB
3. Worker scan job đến giờ chạy
4. Gửi message qua Telegram
5. Lưu log
6. Emit trạng thái real-time qua WebSocket

### Flow diagram
```
Schedule -> DB -> Worker -> Telegram API -> Log
                            |
                            v
                        WebSocket
                            |
                            v
                  UI cập nhật sent / failed / retry
```

### Real-time event ví dụ:
- `autopost_started`
- `autopost_sent`
- `autopost_failed`
- `autopost_retried`

---

## 6.4 FLOW 4 - ANTI-SPAM

### Steps:
1. Event user join/message
2. Push queue
3. Worker check manual rules
4. Nếu chưa đủ kết luận hoặc cần đánh giá sâu -> gọi AI moderation
5. Combine score từ manual rule + AI
6. Nếu vi phạm:
   - Delete message
   - Mute / ban / captcha
   - Log event
   - Emit alert real-time cho moderator

### Flow diagram
```
Telegram Event -> Queue -> Worker -> Rule Engine -> AI Engine -> Action
                                                         |
                                                         v
                                                     WebSocket
                                                         |
                                                         v
                                                Moderator Dashboard
```

### Real-time event ví dụ:
- `spam_detected`
- `user_muted`
- `user_banned`
- `manual_review_required`

---

## 6.5 FLOW 5 - PERMISSION

### Steps:
1. User login
2. Load role + permission
3. API check permission mỗi request

---

# 7. BACKEND STRUCTURE (NestJS)

```
modules/
  auth/
  users/
  roles/
  permissions/
  campaigns/
  invite-links/
  telegram/
  autopost/
  spam/
  analytics/
  settings/
```

---

# 8. FRONTEND STRUCTURE

```
src/
  app/
    dashboard/
    campaigns/
    autopost/
    users/
    settings/
  components/
  features/
  lib/
```

---

# 9. QUEUE DESIGN

Queue types:
- `telegram_events`
- `autopost_jobs`
- `spam_check`
- `metric_sync`
- `link_analysis`

## Nguyên tắc thiết kế queue
- Không xử lý nặng trực tiếp trong webhook request
- Mọi event từ Telegram nên đẩy qua queue trước
- Worker phải hỗ trợ retry, dead-letter logic, logging
- AI moderation nên được gọi từ worker để tránh block request

## Ví dụ routing queue
- User join -> `telegram_events`
- Message nghi spam -> `spam_check`
- Link rút gọn cần expand/check -> `link_analysis`
- Đến giờ gửi bài -> `autopost_jobs`

---

# 10. WEBSOCKET / REAL-TIME DESIGN

## 10.1 Vì sao cần WebSocket
App này có nhiều dữ liệu thay đổi liên tục:
- user join theo thời gian thực
- spam event xuất hiện ngay khi có tin nhắn
- autopost job đang chạy / thất bại / retry
- dashboard metric cần cập nhật live
- moderator cần thấy alert ngay để xử lý

Nếu chỉ dùng REST polling:
- giao diện bị trễ
- tốn request
- trải nghiệm kém

=> Vì vậy hệ thống nên có **WebSocket Gateway** ngay từ đầu.

---

## 10.2 Vai trò của WebSocket
WebSocket **không xử lý business logic chính**.
Nó chỉ dùng để:
- nhận subscription từ client
- đẩy event real-time từ backend/worker ra UI
- đồng bộ trạng thái giữa nhiều admin/moderator

Business logic chính vẫn nằm ở:
- API Service
- Queue
- Worker
- AI Moderation Service

---

## 10.3 Kiến trúc WebSocket

```
Frontend (Next.js)
        |
        v
WebSocket Gateway (NestJS)
        |
        v
Worker / Queue / Services
```

Luồng chuẩn:
1. Telegram event hoặc job background phát sinh trạng thái mới
2. Worker xử lý xong
3. Worker gọi Gateway emit event
4. Frontend đang subscribe sẽ nhận dữ liệu ngay

---

## 10.4 Use cases real-time

### Dashboard
- live member joined
- live campaign growth
- live spam count
- live system alerts

### Moderation panel
- spam alert mới
- user vừa bị mute/ban
- cần review thủ công

### Autopost panel
- job started
- job sent thành công
- job failed
- retry status

### Notification center
- bot mất kết nối
- Telegram API lỗi
- worker quá tải

---

## 10.5 Event naming đề xuất
- `user_joined`
- `campaign_metric_updated`
- `spam_detected`
- `manual_review_required`
- `user_muted`
- `user_banned`
- `autopost_started`
- `autopost_sent`
- `autopost_failed`
- `system_alert`

---

## 10.6 Room / Channel strategy
Không nên broadcast toàn bộ event cho tất cả user.
Nên chia room:
- `admin_room`
- `campaign_{id}`
- `group_{id}`
- `moderation_room`
- `user_{id}`

Ví dụ:
- Moderator chỉ subscribe `moderation_room`
- User xem campaign A chỉ subscribe `campaign_123`

Điều này giúp:
- giảm traffic
- dễ phân quyền
- tránh lộ dữ liệu không liên quan

---

## 10.7 Auth WebSocket
WebSocket phải có xác thực.
Khuyến nghị:
- dùng JWT khi connect
- validate token ở gateway
- map user -> role -> room được phép join

Ngoài ra nên log:
- ai connect
- connect lúc nào
- subscribe room nào
- disconnect khi nào

---

## 10.8 Scale WebSocket
Ở giai đoạn đầu có thể chạy 1 instance là đủ.
Khi scale nhiều instance:
- dùng `socket.io`
- thêm **Redis adapter** để sync event giữa nhiều node

Mô hình:

```
App Instance A ---- Redis ---- App Instance B
        |                           |
     Client A                    Client B
```

Khi worker ở instance A emit event, client đang kết nối ở instance B vẫn nhận được.

---

## 10.9 Best practice
- Không làm business logic nặng trong gateway
- Không gọi AI trực tiếp từ socket handler
- Chỉ emit event sau khi worker xử lý xong
- Có retry/log đầy đủ cho event quan trọng
- Thêm debounce/throttle nếu metric cập nhật quá dày

---

# 11. SECURITY

- Encrypt bot token
- RBAC
- Audit logs
- Rate limit
- 2FA (optional)
- JWT auth cho REST và WebSocket
- Mask thông tin nhạy cảm trong log
- Phân quyền room WebSocket theo role/scope

---

# 12. MVP ROADMAP

## Phase 1
- Auth
- Campaign
- Invite link
- Tracking
- Basic WebSocket cho dashboard

## Phase 2
- Autopost
- Manual anti-spam
- Moderation panel real-time

## Phase 3
- AI anti-spam
- Smart link analysis
- Risk scoring
- Notification center

## Phase 4
- Analytics nâng cao
- Multi-platform
- Redis adapter scale WebSocket

---

# 13. FUTURE EXPANSION

- Discord integration
- Facebook
- AI spam detection nâng cao
- Recommendation engine
- Multi-tenant SaaS
- Billing / plan limit
- Graph analysis để phát hiện cụm spam
- Behavioral fingerprinting

---

# 14. KẾT LUẬN KIẾN TRÚC ĐỀ XUẤT

## Stack khuyến nghị
### Frontend
- Next.js + TypeScript
- TailwindCSS + shadcn/ui

### Backend
- NestJS + TypeScript
- WebSocket Gateway dùng Socket.IO

### AI / Smart Moderation
- FastAPI / Python
- OpenAI hoặc local model để classify spam / suspicious / scam

### Data & Infra
- PostgreSQL
- Redis
- BullMQ
- Docker
- VPS hoặc cloud VM

## Kiến trúc phù hợp nhất
**Modular monolith + Queue + WebSocket + AI moderation service**

Mô hình này phù hợp vì:
- ra MVP nhanh
- dễ maintain
- đủ mạnh để scale
- hỗ trợ tốt real-time, autopost, spam moderation, campaign tracking
- dễ mở rộng thêm Discord / Facebook / Zalo sau này

---

# END

