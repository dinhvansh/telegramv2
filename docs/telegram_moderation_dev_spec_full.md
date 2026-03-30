# 📘 DEV SPEC
# Module: Telegram Group Moderation & Debug Logs
# Product: Telegram CRM / telegramv2

---

## 1. Mục tiêu

Xây dựng module **Telegram Moderation** theo kiến trúc **CRM-first**.

### Business goals
- Admin cấu hình bot Telegram trên CRM trước
- Hệ thống verify bot, register webhook, và discover các group bot đang tham gia
- Admin cấu hình moderation rule theo từng group trên web
- Runtime xử lý message theo rule engine, có thể gọi AI nếu được bật
- Lưu đầy đủ raw log, processing log, action log để debug

### Technical goals
- Bot token/config sống trong CRM
- Group sync/discovery sống trong CRM
- CRM là source of truth cho rule moderation
- Telegram bot chỉ là execution layer
- Có debug workbench để truy vết toàn bộ pipeline

---

## 2. Phạm vi phase 1

### In scope
- Bot configuration screen
- Verify bot token
- Register webhook
- Discover groups bot đang tham gia
- Group moderation settings per group
- Lock matrix:
  - URL
  - Telegram invite link
  - forwarded message
  - email
  - phone
  - bot sender
  - photo
  - video
  - document
  - sticker
- Warning engine
- Warn limit
- Warn action:
  - mute
  - tmute
  - kick
  - ban
  - tban
- Antiflood
- Optional AI moderation
- Raw webhook logs
- Processing logs
- Action execution logs
- Debug UI

### Out of scope phase 1
- Auto welcome flow
- Deep campaign attribution from invite link
- CRM tagging nâng cao
- AI auto-reply
- Manual review queue / appeal flow
- Multi-bot orchestration

---

## 3. Nguyên tắc kiến trúc

**CRM-first moderation model**

- Tất cả bot config được cài trên CRM trước
- CRM verify bot và đăng ký webhook
- CRM discover/sync các group bot đang tham gia
- Admin cấu hình moderation theo từng group trên web UI
- Runtime processing đọc config từ CRM
- Rule engine xử lý trước
- AI chỉ là optional classifier/support layer
- Telegram Bot API chỉ dùng để thực thi hành động

### Câu chốt cho dev
> Bot is execution layer only.  
> CRM is source of truth.  
> Rule engine decides first.  
> AI assists when enabled.  
> Telegram API executes final actions.

---

## 4. System flow

```text
1. Admin nhập bot token vào CRM
2. CRM verify bot qua Telegram API
3. CRM register webhook
4. CRM discover / sync các group bot đang tham gia
5. Admin chọn từng group để cấu hình moderation rule
6. Runtime:
   Telegram → Webhook API → Raw Log → Parser → Rule Engine
   → AI Classifier (optional) → Decision Engine → Telegram Executor
   → Processing Logs + Action Logs
```

---

## 5. Kiến trúc tổng thể

```text
[Web Admin CRM]
    ↓
[Telegram Config API]
    ↓
[PostgreSQL / Settings]

Telegram
    ↓
Webhook
    ↓
[Telegram Webhook API]
    ↓
[Raw Webhook Logger]
    ↓
[Event Parser]
    ↓
[Moderation Engine]
    ├─ Lock Detector
    ├─ Warning Engine
    ├─ Antiflood Engine
    ├─ AI Classifier (optional)
    └─ Decision Engine
    ↓
[Telegram Actions Executor]
    ├─ deleteMessage
    ├─ restrictChatMember
    ├─ banChatMember
    └─ sendMessage
    ↓
[System Logs / Moderation Logs]
    ↓
[Web Debug Screens]
```

---

## 6. Mapping với repo hiện tại

Theo README hiện tại, tận dụng các module đã có:

- `telegram`: Telegram config, webhook handling, group discovery
- `telegram-actions`: execution layer gọi Telegram Bot API
- `moderation`: moderation config, evaluation engine, manual actions
- `system-logs`: audit và execution logging
- `settings`: encrypted system settings + AI config
- `platform`: dashboard snapshot endpoint

### Yêu cầu dev
- Không tạo module song song không cần thiết nếu module hiện tại đã phù hợp
- Ưu tiên mở rộng đúng module đang có trong repo
- Tách domain/service rõ ràng trong mỗi module

---

## 7. Luồng nghiệp vụ chính

### 7.1 Bot configuration flow
1. Admin mở màn hình **Telegram Bot Configuration**
2. Nhập:
   - bot token
   - bot username
   - webhook secret
   - public base url
3. Web gọi API lưu config
4. Backend gọi Telegram API `getMe` để verify bot
5. Nếu hợp lệ:
   - lưu bot metadata
   - cho phép register webhook
6. Backend gọi Telegram API để set webhook
7. CRM lưu trạng thái bot: active / verified / webhook_registered

### 7.2 Group discovery flow
Sau khi bot config thành công:
1. Admin bấm **Discover Groups**
2. Backend thực hiện group discovery / sync
3. Ghi nhận danh sách group bot đang tham gia vào DB
4. Hiển thị danh sách group trên web
5. Sau này tiếp tục sync group lifecycle qua webhook events (`my_chat_member`, `chat_member`)

### 7.3 Moderation config flow
1. Admin chọn group từ danh sách discovered groups
2. Mở màn hình **Group Moderation Settings**
3. Bật/tắt từng rule
4. Cấu hình warning, antiflood, AI moderation
5. Web gọi API update config
6. CRM lưu config per group

### 7.4 Runtime message flow
1. Telegram gửi webhook update
2. Backend tạo `trace_id`
3. Save raw webhook log
4. Parse update thành normalized event
5. Xác định group
6. Load moderation config của group từ CRM
7. Nếu moderation disabled → stop
8. Nếu sender là admin → ignore
9. Chạy lock detector
10. Nếu không match → chạy antiflood
11. Nếu chưa đủ cơ sở và AI enabled → gọi AI classify
12. Decision engine quyết định action
13. Telegram executor gọi Telegram Bot API
14. Save processing log và action logs

---

## 8. Màn hình web cần làm

## 8.1 Screen: Telegram Bot Configuration
Route gợi ý: `CRM > Telegram > Bot Configuration`

### Fields
- Bot Token
- Bot Username
- Webhook Secret
- Public Base URL

### Actions
- Save Config
- Verify Bot
- Register Webhook
- Test Webhook
- Discover Groups

### Status hiển thị
- bot_verified
- bot_id
- bot_username
- webhook_registered
- webhook_url
- last_verified_at
- last_discovered_at

---

## 8.2 Screen: Telegram Groups
Route: `CRM > Telegram > Groups`

### Columns
- Group Name
- Telegram Chat ID
- Type
- Active Status
- Last Synced At
- Moderation Enabled
- Actions

### Actions
- Open Moderation Settings
- View Warnings
- View Logs

---

## 8.3 Screen: Group Moderation Settings
Route: `CRM > Telegram > Groups > {Group} > Moderation`

### Section A. General
- Moderation Enabled

### Section B. Content Locks
- Block URL
- Block Telegram Invite Link
- Block Forwarded Message
- Block Email
- Block Phone Number
- Block Bot Sender
- Block Photo
- Block Video
- Block Document
- Block Sticker

### Section C. Warning Rules
- Enable warning on lock violation
- Warn limit
- Warn action
- Warn action duration

### Section D. Anti Flood
- Enable anti flood
- Max messages
- Time window (seconds)
- Flood action
- Flood action duration
- Delete all flooded messages

### Section E. AI Moderation
- Enable AI moderation
- AI mode
  - off
  - fallback_only
  - suspicious_only
- Confidence threshold
- AI override action enabled

### Section F. Advanced
- Silent actions
- Raw logging enabled
- Detailed logging enabled
- Reset all warnings

---

## 8.4 Screen: Warnings
Route: `CRM > Telegram > Groups > {Group} > Warnings`

### Columns
- Telegram User ID
- Username
- Warning Count
- Last Violation At
- Actions

### Actions
- Reset warning
- View user logs

---

## 8.5 Screen: Moderation Logs
Route: `CRM > Telegram > Groups > {Group} > Logs`

### Columns
- Time
- Trace ID
- Event Type
- Telegram User ID
- Message Preview
- Matched Rule
- AI Called
- Decision
- Final Status

### Filters
- time range
- user id
- message id
- event type
- matched rule
- decision
- success / fail
- AI used yes/no

---

## 8.6 Screen: Log Detail / Debug Detail
Route: `CRM > Telegram > Logs > {traceId}`

### Section 1 — Raw Telegram Update
Hiển thị nguyên raw JSON

### Section 2 — Parsed Event
Hiển thị normalized event object

### Section 3 — Config Snapshot
Hiển thị config moderation tại thời điểm event xảy ra

### Section 4 — Rule Evaluation
Hiển thị:
- checked rules
- matched rule
- warning before
- warning after

### Section 5 — AI Result
Hiển thị:
- ai_called
- model
- label
- confidence
- reason
- suggested_action

### Section 6 — Action Execution
Hiển thị từng action:
- action_type
- request payload
- response payload
- success/fail
- error message

---

## 9. Database schema

## 9.1 Table: `telegram_bot_configs`

```sql
CREATE TABLE telegram_bot_configs (
    id BIGSERIAL PRIMARY KEY,
    bot_token TEXT NOT NULL,
    bot_username VARCHAR(255) NULL,
    bot_id BIGINT NULL,
    webhook_secret VARCHAR(255) NULL,
    public_base_url TEXT NULL,
    webhook_url TEXT NULL,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    webhook_registered BOOLEAN NOT NULL DEFAULT FALSE,
    last_verified_at TIMESTAMP NULL,
    last_discovered_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

> Ghi chú: token nên được mã hóa hoặc lưu theo cơ chế secrets/encrypted settings hiện có trong module `settings`.

---

## 9.2 Table: `telegram_groups`

```sql
CREATE TABLE telegram_groups (
    id BIGSERIAL PRIMARY KEY,
    telegram_chat_id BIGINT NOT NULL UNIQUE,
    title VARCHAR(255) NULL,
    username VARCHAR(255) NULL,
    type VARCHAR(50) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    discovered_from VARCHAR(50) NULL,
    last_synced_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### `discovered_from`
- manual_discovery
- webhook_sync
- seed_import

---

## 9.3 Table: `telegram_group_moderation_settings`

```sql
CREATE TABLE telegram_group_moderation_settings (
    id BIGSERIAL PRIMARY KEY,
    telegram_group_id BIGINT NOT NULL UNIQUE REFERENCES telegram_groups(id),

    moderation_enabled BOOLEAN NOT NULL DEFAULT FALSE,

    lock_url BOOLEAN NOT NULL DEFAULT FALSE,
    lock_invitelink BOOLEAN NOT NULL DEFAULT FALSE,
    lock_forward BOOLEAN NOT NULL DEFAULT FALSE,
    lock_email BOOLEAN NOT NULL DEFAULT FALSE,
    lock_phone BOOLEAN NOT NULL DEFAULT FALSE,
    lock_bot BOOLEAN NOT NULL DEFAULT FALSE,
    lock_photo BOOLEAN NOT NULL DEFAULT FALSE,
    lock_video BOOLEAN NOT NULL DEFAULT FALSE,
    lock_document BOOLEAN NOT NULL DEFAULT FALSE,
    lock_sticker BOOLEAN NOT NULL DEFAULT FALSE,

    lockwarns BOOLEAN NOT NULL DEFAULT TRUE,
    warn_limit INT NOT NULL DEFAULT 2,
    warn_action VARCHAR(20) NOT NULL DEFAULT 'kick',
    warn_action_duration_seconds INT NULL,

    antiflood_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    antiflood_limit INT NULL,
    antiflood_window_seconds INT NULL,
    antiflood_action VARCHAR(20) NULL,
    antiflood_action_duration_seconds INT NULL,
    antiflood_delete_all BOOLEAN NOT NULL DEFAULT FALSE,

    ai_moderation_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ai_mode VARCHAR(30) NOT NULL DEFAULT 'off',
    ai_confidence_threshold NUMERIC(5,4) NULL,
    ai_override_action BOOLEAN NOT NULL DEFAULT FALSE,

    silent_actions BOOLEAN NOT NULL DEFAULT FALSE,
    raw_logging_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    detailed_logging_enabled BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### Allowed values
- `warn_action`: `mute | tmute | kick | ban | tban`
- `antiflood_action`: `mute | tmute | kick | ban | tban`
- `ai_mode`: `off | fallback_only | suspicious_only`

---

## 9.4 Table: `telegram_group_user_warnings`

```sql
CREATE TABLE telegram_group_user_warnings (
    id BIGSERIAL PRIMARY KEY,
    telegram_group_id BIGINT NOT NULL REFERENCES telegram_groups(id),
    telegram_user_id BIGINT NOT NULL,
    username VARCHAR(255) NULL,
    warning_count INT NOT NULL DEFAULT 0,
    last_violation_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(telegram_group_id, telegram_user_id)
);
```

---

## 9.5 Table: `telegram_webhook_raw_logs`

```sql
CREATE TABLE telegram_webhook_raw_logs (
    id BIGSERIAL PRIMARY KEY,
    trace_id VARCHAR(64) NOT NULL,
    telegram_group_id BIGINT NULL REFERENCES telegram_groups(id),
    telegram_chat_id BIGINT NULL,
    update_id BIGINT NULL,
    event_type VARCHAR(50) NULL,
    raw_payload JSONB NOT NULL,
    received_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

---

## 9.6 Table: `telegram_message_processing_logs`

```sql
CREATE TABLE telegram_message_processing_logs (
    id BIGSERIAL PRIMARY KEY,
    trace_id VARCHAR(64) NOT NULL,
    raw_log_id BIGINT NULL REFERENCES telegram_webhook_raw_logs(id),

    telegram_group_id BIGINT NULL REFERENCES telegram_groups(id),
    telegram_chat_id BIGINT NULL,
    telegram_user_id BIGINT NULL,
    telegram_message_id BIGINT NULL,

    parsed_text TEXT NULL,
    parsed_data JSONB NULL,
    config_snapshot JSONB NULL,

    matched_rule VARCHAR(100) NULL,
    matched_reason TEXT NULL,

    warning_before INT NULL,
    warning_after INT NULL,

    ai_called BOOLEAN NOT NULL DEFAULT FALSE,
    ai_result JSONB NULL,

    decision VARCHAR(100) NULL,
    processing_status VARCHAR(50) NOT NULL DEFAULT 'processed',

    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### `processing_status`
- received
- parsed
- rule_matched
- ai_checked
- decision_made
- action_executed
- failed

---

## 9.7 Table: `telegram_action_execution_logs`

```sql
CREATE TABLE telegram_action_execution_logs (
    id BIGSERIAL PRIMARY KEY,
    trace_id VARCHAR(64) NOT NULL,
    processing_log_id BIGINT NULL REFERENCES telegram_message_processing_logs(id),

    action_type VARCHAR(50) NOT NULL,
    request_payload JSONB NULL,
    response_payload JSONB NULL,

    success BOOLEAN NOT NULL DEFAULT TRUE,
    error_message TEXT NULL,

    executed_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### `action_type`
- delete_message
- send_warning_message
- mute_user
- tmute_user
- kick_user
- ban_user
- tban_user

---

## 10. API contract

## 10.1 Bot configuration

### POST `/api/telegram/config`
Request:
```json
{
  "botToken": "123456:ABC",
  "botUsername": "my_bot",
  "webhookSecret": "secret123",
  "publicBaseUrl": "https://api.domain.com"
}
```

Response:
```json
{
  "success": true,
  "botConfigId": 1
}
```

### POST `/api/telegram/verify-bot`
Behavior:
- load bot token
- call Telegram API `getMe`
- save bot metadata + verified status

Response:
```json
{
  "success": true,
  "botId": 123456,
  "botUsername": "my_bot",
  "isVerified": true
}
```

### POST `/api/telegram/register-webhook`
Behavior:
- compose webhook url from public base url + webhook secret
- call Telegram `setWebhook`
- save webhook state

Response:
```json
{
  "success": true,
  "webhookUrl": "https://api.domain.com/api/telegram/webhook"
}
```

---

## 10.2 Group discovery

### POST `/api/telegram/discover-groups`
Behavior:
- discover / sync groups bot is in
- upsert vào `telegram_groups`

Response:
```json
{
  "success": true,
  "totalSynced": 5
}
```

### GET `/api/telegram/groups`
Response:
```json
[
  {
    "id": 1,
    "telegram_chat_id": -1001234567890,
    "title": "Test Group",
    "type": "supergroup",
    "is_active": true,
    "last_synced_at": "2026-03-30T12:00:00Z",
    "moderation_enabled": true
  }
]
```

---

## 10.3 Moderation settings

### GET `/api/telegram/groups/{groupId}/moderation`
Response:
```json
{
  "telegram_group_id": 1,
  "moderation_enabled": true,
  "lock_url": true,
  "lock_invitelink": true,
  "lock_forward": false,
  "lock_email": false,
  "lock_phone": false,
  "lock_bot": false,
  "lock_photo": false,
  "lock_video": false,
  "lock_document": false,
  "lock_sticker": false,
  "lockwarns": true,
  "warn_limit": 2,
  "warn_action": "kick",
  "warn_action_duration_seconds": null,
  "antiflood_enabled": true,
  "antiflood_limit": 5,
  "antiflood_window_seconds": 10,
  "antiflood_action": "tmute",
  "antiflood_action_duration_seconds": 600,
  "antiflood_delete_all": true,
  "ai_moderation_enabled": true,
  "ai_mode": "fallback_only",
  "ai_confidence_threshold": 0.85,
  "ai_override_action": false,
  "silent_actions": false,
  "raw_logging_enabled": true,
  "detailed_logging_enabled": true
}
```

### PUT `/api/telegram/groups/{groupId}/moderation`
Request:
```json
{
  "moderation_enabled": true,
  "lock_url": true,
  "lock_invitelink": true,
  "lock_forward": false,
  "lock_email": false,
  "lock_phone": false,
  "lock_bot": false,
  "lock_photo": false,
  "lock_video": false,
  "lock_document": false,
  "lock_sticker": false,
  "lockwarns": true,
  "warn_limit": 2,
  "warn_action": "kick",
  "warn_action_duration_seconds": null,
  "antiflood_enabled": true,
  "antiflood_limit": 5,
  "antiflood_window_seconds": 10,
  "antiflood_action": "tmute",
  "antiflood_action_duration_seconds": 600,
  "antiflood_delete_all": true,
  "ai_moderation_enabled": true,
  "ai_mode": "fallback_only",
  "ai_confidence_threshold": 0.85,
  "ai_override_action": false,
  "silent_actions": false,
  "raw_logging_enabled": true,
  "detailed_logging_enabled": true
}
```

### Validation rules
- `warn_limit >= 1`
- duration required nếu action là `tmute` hoặc `tban`
- `antiflood_limit >= 1` nếu antiflood enabled
- `antiflood_window_seconds >= 1` nếu antiflood enabled
- `ai_confidence_threshold` nằm trong `[0, 1]`

---

## 10.4 Warnings

### GET `/api/telegram/groups/{groupId}/warnings`
Response:
```json
[
  {
    "telegram_user_id": 123456,
    "username": "abc",
    "warning_count": 1,
    "last_violation_at": "2026-03-30T12:00:00Z"
  }
]
```

### POST `/api/telegram/groups/{groupId}/warnings/reset`
Request:
```json
{
  "telegram_user_id": 123456
}
```

Response:
```json
{
  "success": true
}
```

### POST `/api/telegram/groups/{groupId}/warnings/reset-all`
Response:
```json
{
  "success": true
}
```

---

## 10.5 Logs

### GET `/api/telegram/groups/{groupId}/logs`
Query params:
- `from`
- `to`
- `user_id`
- `message_id`
- `event_type`
- `matched_rule`
- `decision`
- `status`
- `ai_called`
- `page`
- `page_size`

Response:
```json
{
  "items": [
    {
      "trace_id": "tg_20260330_abcd1234",
      "created_at": "2026-03-30T12:00:00Z",
      "event_type": "message",
      "telegram_user_id": 123456,
      "telegram_message_id": 245,
      "message_preview": "join here https://abc.com",
      "matched_rule": "url",
      "ai_called": false,
      "decision": "delete_and_warn",
      "processing_status": "action_executed"
    }
  ],
  "total": 1
}
```

### GET `/api/telegram/logs/{traceId}`
Response:
```json
{
  "trace_id": "tg_20260330_abcd1234",
  "raw_log": {},
  "processing_log": {},
  "action_logs": []
}
```

---

## 11. Webhook contract

### Endpoint
`POST /api/telegram/webhook`

### Requirements
- Validate webhook secret nếu dùng secret path/header scheme
- Always create `trace_id`
- Save raw log trước khi parse
- Handle cả:
  - `message`
  - `edited_message`
  - `my_chat_member`
  - `chat_member`
- Không crash webhook pipeline khi Telegram action fail

---

## 12. Normalized event model

Sau parse, convert Telegram payload thành object chuẩn:

```json
{
  "trace_id": "tg_20260330_abcd1234",
  "event_type": "message",
  "chat_id": -1001234567890,
  "chat_type": "supergroup",
  "message_id": 245,
  "user_id": 777888,
  "username": "demo_user",
  "is_bot_sender": false,
  "text": "check this https://abc.com",
  "caption": null,
  "entities": [],
  "has_photo": false,
  "has_video": false,
  "has_document": false,
  "has_sticker": false,
  "is_forwarded": false,
  "raw": {}
}
```

---

## 13. Runtime processing pipeline

### Main flow pseudocode

```python
def process_webhook(update_json):
    trace_id = generate_trace_id()

    raw_log_id = save_raw_log(trace_id, update_json)

    event = parser.normalize(update_json)

    if event.event_type in ["my_chat_member", "chat_member"]:
        sync_group_lifecycle(event)
        return

    if event.event_type != "message":
        return

    group = group_repo.find_by_chat_id(event.chat_id)
    if not group or not group.is_active:
        return

    settings = settings_repo.get_by_group_id(group.id)
    if not settings or not settings.moderation_enabled:
        return

    if admin_service.is_admin(event.chat_id, event.user_id):
        return

    processing_log_id = create_processing_log(
        trace_id=trace_id,
        raw_log_id=raw_log_id,
        group=group,
        event=event,
        config_snapshot=settings.to_json()
    )

    violation = moderation_engine.detect_violation(event, settings)

    if violation:
        moderation_engine.handle_violation(
            trace_id, processing_log_id, group, event, settings, violation
        )
        return

    flood = flood_service.check(group, event, settings)

    if flood.triggered:
        moderation_engine.handle_flood(
            trace_id, processing_log_id, group, event, settings, flood
        )
        return

    if ai_should_run(event, settings):
        ai_result = ai_service.classify(event)
        decision_engine.handle_ai_result(...)
```

---

## 14. Rule detection

### Detection priority
1. URL
2. Telegram invite link
3. forward
4. email
5. phone
6. bot sender
7. photo
8. video
9. document
10. sticker
11. antiflood
12. AI moderation

### Detector functions

#### `has_url(event)`
- check `entities` types: `url`, `text_link`
- fallback regex:
```python
r"(https?://\S+|www\.\S+)"
```

#### `has_invitelink(event)`
Regex:
```python
r"(t\.me/\+[\w-]+|t\.me/joinchat/[\w-]+|telegram\.me/joinchat/[\w-]+)"
```

#### `has_email(event)`
Regex:
```python
r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"
```

#### `has_phone(event)`
Regex:
```python
r"(\+?\d[\d\-\s\(\)]{7,}\d)"
```

#### `is_forwarded(event)`
- check Telegram forward metadata

#### Media detectors
- `photo`: `event.has_photo`
- `video`: `event.has_video`
- `document`: `event.has_document`
- `sticker`: `event.has_sticker`

---

## 15. Warning engine

### Logic
- Nếu `lockwarns = false`: không cộng warning
- Nếu `lockwarns = true`:
  - load current warning
  - increment
  - save DB
  - nếu đạt warn limit → apply warn action
  - sau khi action executed → reset warning về 0

### Pseudocode

```python
warning_before = warning_service.get_count(group.id, event.user_id)
warning_after = warning_service.increment(group.id, event.user_id)

if warning_after >= settings.warn_limit:
    apply_warn_action(...)
    warning_service.reset(group.id, event.user_id)
```

### Rules
- warning count tính theo `group_id + telegram_user_id`
- reset warning manual từ UI phải được hỗ trợ
- reset warning after escalation là mặc định phase 1

---

## 16. Antiflood engine

### Storage
Redis

### Key
```text
tele:flood:{group_id}:{user_id}
```

### Logic
Dùng sliding window:

```python
key = f"tele:flood:{group.id}:{event.user_id}"
now = current_ts()

redis.zadd(key, {str(event.message_id): now})
redis.zremrangebyscore(key, 0, now - settings.antiflood_window_seconds)
count = redis.zcard(key)
redis.expire(key, settings.antiflood_window_seconds + 5)

if count > settings.antiflood_limit:
    return triggered
```

### Behavior
- nếu `antiflood_delete_all = false`: chỉ delete message hiện tại
- nếu `antiflood_delete_all = true`: delete toàn bộ burst messages trong cửa sổ flood nếu có thể truy ra id

---

## 17. AI moderation

### Mục tiêu
AI chỉ là **optional classifier**, không thay thế rule engine cơ bản.

### Khi nào gọi AI
- `ai_moderation_enabled = true`
- và:
  - `ai_mode = fallback_only` khi không rule nào match nhưng content suspicious
  - `ai_mode = suspicious_only` khi detector gắn cờ suspicious
  - hoặc case explicitly cần AI classify

### AI input
```json
{
  "group_id": 1,
  "message_text": "cheap deal inbox me",
  "username": "abc",
  "context": {
    "is_forwarded": false,
    "has_url": false
  }
}
```

### AI output chuẩn hóa
```json
{
  "label": "spam",
  "confidence": 0.91,
  "reason": "promotional/scam intent",
  "suggested_action": "delete_and_warn"
}
```

### Decision rules
- Nếu confidence < threshold:
  - chỉ log AI result
  - không override decision
- Nếu confidence >= threshold:
  - nếu `ai_override_action = false`: AI chỉ cung cấp signal
  - nếu `ai_override_action = true`: có thể dùng `suggested_action`

---

## 18. Decision engine

### Allowed decisions
- `ignore`
- `delete_only`
- `delete_and_warn`
- `delete_and_mute`
- `delete_and_tmute`
- `delete_and_kick`
- `delete_and_ban`
- `delete_and_tban`
- `flood_action`

### Mapping
- lock violation + lockwarns off → `delete_only`
- lock violation + warning dưới limit → `delete_and_warn`
- warning đạt limit → `delete_and_<warn_action>`
- flood trigger → `<antiflood_action>`
- AI spam + threshold pass → mapping theo AI policy

---

## 19. Telegram executor

### Methods bắt buộc
- `delete_message(chat_id, message_id)`
- `send_message(chat_id, text)`
- `mute_user(chat_id, user_id, until_ts=None)`
- `ban_user(chat_id, user_id, until_ts=None)`
- `kick_user(chat_id, user_id)`

### Implementation notes
- `kick` có thể map sang `ban` ngắn rồi unban tùy wrapper
- `tmute` dùng `restrictChatMember` với `until_date`
- `tban` dùng `banChatMember` với `until_date`
- nếu Telegram API fail:
  - không được crash webhook worker
  - phải save action log với `success = false`

---

## 20. Logging requirements

### 20.1 Raw log
Phải lưu ngay khi nhận update, trước parse.

### 20.2 Processing log
Phải lưu:
- parsed_data
- config_snapshot
- matched_rule
- matched_reason
- warning_before
- warning_after
- ai_called
- ai_result
- decision
- processing_status

### 20.3 Action log
Phải lưu từng action:
- action_type
- request_payload
- response_payload
- success/fail
- error_message

### 20.4 Trace ID
Mỗi update phải có `trace_id` duy nhất:

```text
tg_{yyyymmddhhmmss}_{random}
```

---

## 21. Group lifecycle sync

### Khi bot được add vào group
- parse `my_chat_member` / `chat_member`
- upsert group vào `telegram_groups`
- set `is_active = true`
- create default moderation settings nếu chưa có

### Khi bot bị remove khỏi group
- update `is_active = false`
- giữ lịch sử logs
- không xóa config cũ

---

## 22. Default settings khi bot mới được add

```json
{
  "moderation_enabled": false,
  "lock_url": false,
  "lock_invitelink": false,
  "lock_forward": false,
  "lock_email": false,
  "lock_phone": false,
  "lock_bot": false,
  "lock_photo": false,
  "lock_video": false,
  "lock_document": false,
  "lock_sticker": false,
  "lockwarns": true,
  "warn_limit": 2,
  "warn_action": "kick",
  "warn_action_duration_seconds": null,
  "antiflood_enabled": false,
  "antiflood_limit": 5,
  "antiflood_window_seconds": 10,
  "antiflood_action": "tmute",
  "antiflood_action_duration_seconds": 600,
  "antiflood_delete_all": true,
  "ai_moderation_enabled": false,
  "ai_mode": "off",
  "ai_confidence_threshold": 0.85,
  "ai_override_action": false,
  "silent_actions": false,
  "raw_logging_enabled": true,
  "detailed_logging_enabled": true
}
```

> Lý do: bot được add xong thì group hiện trên CRM, nhưng moderation không auto bật ngay để tránh xóa nhầm.

---

## 23. Error handling

### Các case cần handle
- bot token invalid
- Telegram API verify fail
- register webhook fail
- discover groups fail
- bot thiếu quyền delete/restrict/ban
- malformed webhook payload
- group không tồn tại trong DB
- group inactive
- Redis unavailable
- AI timeout / AI error
- Telegram action execution fail

### Quy tắc
- Không crash toàn bộ pipeline
- Ghi log đầy đủ lỗi
- Có thể retry nội bộ nếu phù hợp
- Webhook nên trả `200 OK` sau khi đã nhận và xử lý nội bộ hợp lệ, tránh Telegram retry vô hạn không cần thiết

---

## 24. Security & permissions

### Requirements
- Bot token phải được mã hóa hoặc lưu qua encrypted settings
- Chỉ admin phù hợp mới được đổi bot config
- Chỉ admin group/CRM permission phù hợp mới được sửa moderation settings
- Raw log screen cần hạn chế quyền xem
- Có thể cần mask fields nhạy cảm nếu business yêu cầu

### Suggested RBAC
- Super Admin:
  - full bot config
  - full logs
  - reset warnings
- Operator:
  - chỉnh moderation per group
  - xem logs group mình phụ trách
- Viewer:
  - chỉ xem dashboard / logs summary

---

## 25. Test cases

### Case 1 — Configure bot
- nhập bot token đúng
- verify bot thành công
- register webhook thành công

Expected:
- bot config saved
- bot verified true
- webhook registered true

### Case 2 — Discover groups
- bot đang ở 2 group
- click Discover Groups

Expected:
- 2 groups được upsert vào `telegram_groups`
- hiển thị trên web list

### Case 3 — URL lock
Config:
- moderation_enabled = true
- lock_url = true
- lockwarns = true
- warn_limit = 2
- warn_action = kick

Expected:
- lần 1 gửi link: delete + warning 1
- lần 2 gửi link: delete + kick + warning reset

### Case 4 — lock without warning
Config:
- lock_url = true
- lockwarns = false

Expected:
- delete only
- warning unchanged

### Case 5 — antiflood
Config:
- antiflood_enabled = true
- limit = 5
- window = 10
- action = tmute
- duration = 600

Expected:
- 6 messages / 10s → tmute
- action log saved

### Case 6 — AI fallback
Config:
- ai enabled
- ai_mode = fallback_only
- threshold = 0.85

Message suspicious, không có regex match

Expected:
- AI called
- AI result logged
- decision made from AI policy

### Case 7 — action failure
Situation:
- bot thiếu quyền delete

Expected:
- processing log saved
- action log success=false
- pipeline không crash

### Case 8 — bot removed from group
Expected:
- group is_active=false
- config/history retained

---

## 26. Dev task breakdown

### Backend
- Telegram bot config service
- verify bot service
- register webhook service
- discover groups service
- group lifecycle sync service
- moderation settings API
- warnings service
- antiflood service
- AI moderation adapter
- decision engine
- Telegram executor
- raw/process/action log services

### Frontend
- Bot configuration screen
- Groups list screen
- Group moderation settings screen
- Warnings screen
- Logs list screen
- Log detail/debug screen

### Infra
- PostgreSQL migration
- Redis for antiflood
- env config for Telegram + AI provider
- optional queue/worker nếu runtime async

---

## 27. Acceptance criteria

Chức năng được coi là hoàn thành khi:

1. Admin có thể nhập bot token trên CRM
2. CRM verify được bot và register webhook
3. CRM discover/sync được danh sách group bot đang tham gia
4. Admin cấu hình moderation rule cho từng group được trên web
5. Runtime xử lý message đúng theo config group
6. Warning logic đúng
7. Antiflood đúng
8. AI moderation hoạt động đúng nếu bật
9. Raw logs, processing logs, action logs xem được trên web
10. Có thể debug 1 event từ raw payload đến action response bằng trace_id

---

## 28. Tóm tắt chốt cho team dev

```text
The system does not start from group configuration.
It starts from bot configuration.

Flow:
1. Configure bot in CRM
2. Verify bot and register webhook
3. Discover/sync groups the bot is currently in
4. Configure moderation rules per group
5. Process incoming Telegram updates using CRM rules
6. Optionally call AI for suspicious messages
7. Execute final actions through Telegram Bot API
8. Store raw/process/action logs for debugging
```

---
