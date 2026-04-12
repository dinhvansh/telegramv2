# Implementation Master Plan

## Mục tiêu

Hoàn thiện hệ thống theo thứ tự giảm rủi ro, ưu tiên những chỗ đang ảnh hưởng trực tiếp đến vận hành.

## Phase 1. Ổn định nền tảng

### 1.1 Production config

- Chốt `.env.production` chuẩn
- Không để thiếu biến giữa local và production
- Chốt runbook restart/deploy

### 1.2 UTF-8 cleanup

- Dọn text mojibake ở web
- Dọn seed/runtime strings
- Dọn role/permission labels cũ

### 1.3 RBAC workspace

- Mỗi nhóm là một workspace
- Không lộ dữ liệu chéo workspace
- Chuẩn hóa role tiếng Việt

## Phase 2. Contacts import production-ready

### 2.1 Ổn định luồng hiện tại

- Nhận được cả array và `contacts.list`
- QR login ổn định
- Xử lý `AUTH_KEY_UNREGISTERED`
- Delay an toàn hơn để giảm risk Telegram

### 2.2 Batch import

- Tạo `contact_import_batches`
- Tạo `contact_import_items`
- Trả `batchId` ngay sau upload
- Không giữ request dài

### 2.3 Queue và progress

- Redis/BullMQ worker
- Chunk nhỏ
- Retry/backoff
- UI xem tiến độ

### 2.4 Customer mapping

- Upsert `TelegramUser`
- Match theo phone sang customer/lead
- Giữ lịch sử import batch

## Phase 3. Telegram operations thật

- Verify bot/group thật
- Enforce moderation thật
- Invite link tracking thật
- Member join/leave flow ổn định hơn

## Phase 4. Autopost và AI

- Match webhook ổn định
- AI caption tách prompt riêng
- Scheduler/job cứng hơn
- Log gửi bài rõ hơn

## Phase 5. Hardening

- System logs
- Backup DB
- Migration strategy
- Release checklist

## Ưu tiên làm tiếp ngay

1. Contacts import batch + queue
2. Customer mapping
3. Telegram MTProto resilience
4. UTF-8 cleanup còn sót
