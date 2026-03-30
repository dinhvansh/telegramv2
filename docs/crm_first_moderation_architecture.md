# CRM-First Telegram Moderation Architecture

## 1. Muc tieu

Xay dung he thong chan spam cho Telegram group theo mo hinh:

- Web CRM la source of truth duy nhat cho tat ca setup, policy, rule, hanh dong va audit.
- Bot Telegram chi dong vai tro execution layer:
  - nhan update tu Telegram
  - day du lieu ve API
  - thuc thi lenh `deleteMessage`, `restrictChatMember`, `banChatMember`, `approveChatJoinRequest`, `declineChatJoinRequest`
- Khi bot duoc add vao group, CRM ghi nhan group do, luu quyen admin cua bot va mo moderation scope tuong ung.
- Moderation engine doc cau hinh tu CRM, danh gia message / join request / member event, sau do goi Telegram API de thi hanh.

Muc tieu nghiep vu giong huong van hanh cua Rose:

- lock theo loai noi dung: `url`, `invitelink`, `forward`, `command`, `photo`, `document`, `sticker`, `bot`, `phone`, `email`, `text`, ...
- canh bao theo muc do va so lan vi pham
- hinh phat theo policy: warn, delete, mute, kick, ban, temporary mute, temporary ban
- co override theo tung group
- toan bo thao tac, ly do va lich su xu ly hien tren CRM

## 2. Tham chieu ky thuat

Thiet ke nay dua tren Telegram Bot API va du lieu tham khao ve Rose:

- Bieu hien hanh vi Rose lock/warn/kick theo huong dan tham khao:
  - https://www.groupmmo.pro/2021/12/telegram-huong-dan-bot-rose-xoa-link.html
- Telegram Bot API:
  - `my_chat_member`, `chat_member`, `chat_join_request`, `message` updates
  - `setWebhook` va `secret_token`
  - `deleteMessage`
  - `restrictChatMember`
  - `banChatMember`
  - `approveChatJoinRequest`
  - `declineChatJoinRequest`
  - `getChatMember`
  - https://core.telegram.org/bots/api

Rang buoc quan trong tu Telegram Bot API:

- Muon nhan `chat_member` update, bot phai la admin va khai bao `allowed_updates` phu hop.
- Muon nhan `chat_join_request`, bot can quyen `can_invite_users`.
- Muon xoa tin nhan, bot can quyen `can_delete_messages` o supergroup/channel.
- Muon mute/ban user, bot can quyen `can_restrict_members`.
- `deleteMessage` co gioi han ve thoi gian va loai message.
- Khi da set webhook thi khong dung `getUpdates` song song.

## 3. Nguyen tac kien truc

### 3.1 Source of truth

Tat ca cau hinh moderation phai nam trong CRM:

- global defaults
- group-specific overrides
- lock matrix
- warning ladder
- action ladder
- allowlist / blocklist
- exemption rules
- trust level / role exemption
- bot token, webhook secret, public base URL

Telegram khong duoc giu business logic. Telegram chi la input/output channel.

### 3.2 Tach engine va execution

Kien truc chia 3 tang:

1. `Ingestion`
- Nhan webhook tu Telegram
- Xac thuc secret token
- Parse update
- Ghi event raw

2. `Decision`
- Tai policy tu CRM
- Match voi lock rules / warning rules / spam scoring / exemptions
- Tra ve quyet dinh chuan hoa

3. `Execution`
- Goi Telegram Bot API de thuc thi
- Ghi audit trail
- Cap nhat warning counter / strike / action history

### 3.3 CRM-first, group-aware

Moi group phai co moderation scope rieng trong CRM, ke ca khi chua override gi.

Mo hinh ke thua:

- Global policy
- Group policy ke thua global
- Rule co the:
  - inherit
  - append
  - replace

## 4. Danh gia repo hien tai

Repo da co mot phan nen dung huong:

- `TelegramService` da co:
  - config bot
  - register webhook
  - discover groups
  - create invite link
  - handle webhook
- `ModerationService` da co:
  - policy global / group
  - keyword + domain config
- `ModerationEngineService` da co:
  - rule score
  - AI score
  - decision `ALLOW/REVIEW/WARN/RESTRICT/BAN`
- `TelegramActionsService` da co:
  - `deleteMessage`
  - `restrictChatMember`
  - `banChatMember`
  - `approveChatJoinRequest`
  - `declineChatJoinRequest`
- Prisma schema da co cac model co ban:
  - `TelegramGroup`
  - `ModerationPolicy`
  - `ModerationKeyword`
  - `ModerationDomain`
  - `SpamEvent`
  - `SystemSetting`
  - `SystemLog`

Tuy nhien van chua du de giong Rose:

- chua co lock matrix theo content type
- chua co warning counter theo user + group + rule
- chua co action ladder day du
- chua co event raw store
- chua co bot membership lifecycle day du
- chua co UI moderation control center that su
- chua co model quyen admin cua bot theo tung group
- chua co exemption / trusted role / whitelist actor
- chua co queue nen webhook van dang lam qua nhieu viec

## 5. Kien truc muc tieu

### 5.1 Domain model de xay dung

Can bo sung hoac mo rong cac thuc the sau:

#### TelegramGroup

Luu group ma bot biet den.

Truong can co them:

- `type`: group / supergroup / channel
- `status`: discovered / active / bot_removed / access_lost
- `botMemberState`: administrator / member / left / kicked
- `botCanDeleteMessages`
- `botCanRestrictMembers`
- `botCanInviteUsers`
- `botCanManageTopics`
- `lastSyncedAt`
- `isModerationEnabled`

#### TelegramGroupMembershipEvent

Luu su kien lien quan den bot trong group:

- bot duoc them vao group
- bot bi remove
- bot duoc promote/demote admin
- title change / chat migration neu can

Nguon su kien:

- `my_chat_member`
- `chat_member`

#### ModerationPolicy

Model hien tai dung duoc, nhung can mo rong them:

- `warnLimit`
- `defaultViolationAction`: none / warn / delete / mute / kick / ban
- `deleteOnViolation`
- `muteDurationMinutes`
- `banDurationMinutes`
- `reviewMode`: auto / semi-auto / manual
- `applyToAdmins`: boolean
- `applyToTrustedUsers`: boolean
- `ignoreOldMembersAfterMinutes`

#### ModerationLockRule

Moi lock la mot rule co the bat/tat theo group:

- `scopeKey`
- `contentType`
  - `url`
  - `invitelink`
  - `email`
  - `phone`
  - `forward`
  - `forward_channel`
  - `forward_bot`
  - `command`
  - `has_button`
  - `photo`
  - `video`
  - `document`
  - `sticker`
  - `gif`
  - `poll`
  - `location`
  - `contact`
  - `text`
  - `bot_add`
- `mode`: allow / review / block
- `deleteMessage`
- `warnWeight`
- `actionOverride`
- `enabled`

#### ModerationWarning

Luu canh bao theo user va group:

- `groupId`
- `userExternalId`
- `username`
- `ruleCode`
- `spamEventId`
- `status`: active / expired / forgiven
- `expiresAt`

#### ModerationSubjectState

Tong hop trang thai moderation cua 1 user trong 1 group:

- `groupId`
- `userExternalId`
- `warningCount`
- `lastViolationAt`
- `lastAction`
- `isMuted`
- `muteUntil`
- `isBanned`
- `trustLevel`
- `notes`

#### ModerationExemption

Cho phep bo qua moderation cho:

- user cu the
- role cu the
- admin
- bot khac
- domain allowlist

#### TelegramExecutionLog

Tac rieng khoi `SpamEvent.actionLogs` de query tot hon:

- `spamEventId`
- `groupId`
- `chatId`
- `userId`
- `method`
- `requestPayload`
- `responseOk`
- `responseDescription`
- `executedAt`

#### RawTelegramUpdate

Luu raw payload de debug va replay:

- `updateId`
- `updateType`
- `chatExternalId`
- `userExternalId`
- `payload`
- `receivedAt`
- `processedAt`
- `status`

### 5.2 API layer muc tieu

API can co cac nhom endpoint sau:

#### Telegram CRM setup

- `GET /telegram/groups`
- `POST /telegram/discover-groups`
- `GET /telegram/groups/:id`
- `POST /telegram/groups/:id/enable-moderation`
- `POST /telegram/groups/:id/disable-moderation`
- `GET /telegram/groups/:id/bot-rights`
- `POST /telegram/register-webhook`
- `GET /telegram/webhook-status`

#### Moderation config

- `GET /moderation/config`
- `GET /moderation/groups/:groupId/config`
- `PUT /moderation/groups/:groupId/config`
- `GET /moderation/groups/:groupId/locks`
- `PUT /moderation/groups/:groupId/locks`
- `POST /moderation/groups/:groupId/keywords`
- `DELETE /moderation/groups/:groupId/keywords/:id`
- `POST /moderation/groups/:groupId/domains`
- `DELETE /moderation/groups/:groupId/domains/:id`
- `GET /moderation/groups/:groupId/exemptions`
- `POST /moderation/groups/:groupId/exemptions`

#### Moderation operations

- `GET /moderation/events`
- `GET /moderation/events/:id`
- `POST /moderation/events/:id/action`
- `GET /moderation/groups/:groupId/warnings`
- `POST /moderation/groups/:groupId/warnings/:subject/forgive`
- `GET /moderation/groups/:groupId/subjects`
- `GET /moderation/raw-updates`

## 6. Flow nghiep vu muc tieu

### 6.1 Bot duoc add vao group

1. Telegram gui `my_chat_member`
2. API nhan webhook, validate secret token
3. Parse ra:
   - chat id
   - title
   - type
   - old/new bot status
   - admin rights
4. Upsert `TelegramGroup`
5. Ghi `TelegramGroupMembershipEvent`
6. Tao hoac kich hoat `ModerationPolicy` cho group do
7. UI CRM hien group moi trong danh sach "Can cau hinh"

Ket qua:

- CRM ghi nhan group tu dong
- khong can setup qua lenh trong Telegram

### 6.2 Message moi trong group

1. Telegram gui `message`
2. API ghi `RawTelegramUpdate`
3. Event duoc dua vao queue
4. Worker tai policy group
5. Worker detect content:
   - co link hay khong
   - co invite link hay khong
   - co forward hay khong
   - co command hay khong
   - co media bi lock hay khong
   - keyword / domain / social engineering
6. Engine tinh violation va action:
   - delete ngay
   - tang warning
   - mute
   - kick
   - ban
   - dua vao review
7. Execution service goi Telegram API
8. Ghi `SpamEvent`, `ModerationWarning`, `TelegramExecutionLog`
9. UI realtime cap nhat queue va lich su

### 6.3 Join request

1. Telegram gui `chat_join_request`
2. Engine tai policy group
3. Danh gia theo:
   - username pattern
   - bio neu sau nay co them nguồn du lieu
   - history warning / ban
   - domain / campaign source
4. Quy dinh:
   - approve
   - decline
   - ban
   - review
5. Execution service goi `approveChatJoinRequest` hoac `declineChatJoinRequest`

### 6.4 Bot bi mat quyen

1. `my_chat_member` bao bot khong con admin hoac bi remove
2. CRM cap nhat `TelegramGroup.status`
3. UI bat canh bao "Moderation degraded"
4. Group do khong duoc auto enforce nua neu thieu quyen can thiet

## 7. Rule system can co de giong Rose

### 7.1 Lock matrix

Can ho tro bat/tat theo group:

- url
- invitelink
- phone
- email
- forward
- forward from channel
- command
- buttons / inline keyboard
- media types
- bot add
- poll / location / contact

Moi lock co cac thuoc tinh:

- enabled
- action on hit
- delete message hay khong
- warn points
- exempt admins hay khong
- exempt trusted users hay khong

### 7.2 Warning ladder

Can mo phong logic Rose:

- vi pham lan 1: delete + warn
- vi pham lan 2: delete + warn
- vi pham lan 3: kick hoac mute

Can cau hinh duoc tren CRM:

- `warnLimit`
- `warnExpiryHours`
- `actionAfterWarnLimit`
- `muteDurationMinutes`
- `banDurationMinutes`

### 7.3 Action ladder

Nen chuan hoa:

- `ALLOW`
- `DELETE_ONLY`
- `WARN_ONLY`
- `DELETE_AND_WARN`
- `MUTE`
- `TEMP_MUTE`
- `KICK`
- `BAN`
- `TEMP_BAN`
- `REVIEW`

Luu y:

- Telegram khong co method `kick`, thuc te thuong map thanh `ban` roi `unban` ngay, hoac `restrict` tuy use case.
- Can dinh nghia ro trong CRM "kick" la gi de implementation nhat quan.

### 7.4 Exemptions

Can co:

- bo qua admin
- bo qua owner
- bo qua moderator role
- allowlist user
- allowlist domain
- trusted member sau X phut / X ngay

## 8. Kien truc xu ly nen dung

### 8.1 Khong xu ly nang trong webhook

Webhook chi nen:

- validate
- persist raw update
- ack nhanh
- enqueue job

Khong nen:

- tinh score phuc tap
- goi AI
- goi nhieu lenh Telegram lien tiep

De xuat:

- dung BullMQ + Redis
- queue:
  - `telegram.update.process`
  - `moderation.execute`
  - `telegram.sync.group_state`

### 8.2 Decision engine

Decision engine nen tra object chuan:

```json
{
  "policyScope": "group:<id>",
  "matchedRules": ["lock:url", "keyword:seed phrase"],
  "warningDelta": 1,
  "subjectStateBefore": {
    "warningCount": 2
  },
  "decision": "BAN",
  "executionPlan": [
    "delete_message",
    "ban_user"
  ],
  "reason": "user exceeded warn limit and hit blocked link rule"
}
```

Execution layer khong duoc tu suy luan them. No chi thi hanh `executionPlan`.

## 9. Giao dien CRM can xay

### 9.1 Telegram Groups

Man hinh danh sach group:

- group title
- chat id
- bot status
- admin rights
- moderation enabled
- last event
- warning neu thieu quyen

### 9.2 Moderation Config

Trang config theo group:

- tab `Overview`
  - enabled / disabled
  - inherit global / custom override
- tab `Locks`
  - bang lock matrix
- tab `Warnings`
  - warn limit
  - action ladder
- tab `Keywords`
  - blocked phrases
- tab `Domains`
  - allowlist / blocklist
- tab `Exemptions`
  - admin bypass
  - trusted users
  - whitelist
- tab `Execution`
  - delete on violation
  - mute duration
  - ban mode

### 9.3 Moderation Queue

- danh sach spam events moi nhat
- rule hits
- final decision
- execution result
- manual override
- raw payload drawer

### 9.4 Subject history

Trang user trong group:

- so warning hien tai
- vi pham gan day
- action da ap dung
- note cua moderator
- button forgive warnings

## 10. Thiet ke du lieu de xay tiep tren repo hien tai

Co the tan dung va mo rong:

- giu `ModerationPolicy`, them cac cot config warning/action
- giu `SpamEvent`, tach `actionLogs` ra bang rieng
- giu `TelegramGroup`, them state + rights
- them bang moi:
  - `TelegramGroupMembershipEvent`
  - `ModerationLockRule`
  - `ModerationWarning`
  - `ModerationSubjectState`
  - `ModerationExemption`
  - `TelegramExecutionLog`
  - `RawTelegramUpdate`

## 11. Thu tu trien khai de it rui ro

### Phase 1: Normalize Telegram group state

- bat `my_chat_member` va `chat_member`
- auto ghi nhan group khi bot duoc add
- luu bot rights theo group
- hien group list tren CRM

Definition of done:

- them bot vao group thi CRM thay group moi
- remove bot thi CRM cap nhat status

### Phase 2: CRM config foundation

- UI CRUD cho moderation policy theo group
- lock matrix + warning ladder + domain/keyword rules
- luu toan bo config vao DB

Definition of done:

- co the setup 100% moderation tren web, khong can lenh Telegram

### Phase 3: Queue-based ingestion

- webhook luu raw updates
- enqueue process job
- tach decision khoi webhook

Definition of done:

- webhook response nhanh, co replay/debug update

### Phase 4: Rose-like lock rules

- detect `url`, `invitelink`, `forward`, `command`, `phone`, `email`, media types
- map lock hit -> delete/warn/action ladder

Definition of done:

- co the tao cau hinh "lock url, warn 2 lan, kick lan 3" tu CRM

### Phase 5: Warning engine + subject state

- tracking warning theo user/group
- expiry + forgive
- action escalation

Definition of done:

- co warning counter giong Rose

### Phase 6: Execution hardening

- audit execution logs
- retry policy
- idempotency key
- partial failure handling

Definition of done:

- Telegram API loi van co audit trail va co the retry an toan

### Phase 7: Moderation workbench UI

- queue, filters, detail drawer, manual actions
- subject history
- raw payload viewer

Definition of done:

- moderator thao tac hoan toan tren CRM

## 12. Quyet dinh ky thuat quan trong

### 12.1 Co dung AI hay khong

Nen de AI la optional enhancer, khong phai core.

Rose-like anti-spam chu yeu dua vao:

- locks
- warning ladder
- pattern matching
- whitelist / blacklist

AI chi nen dung cho:

- message text mo ho
- social engineering
- scam phrasing
- xep review priority

### 12.2 "Kick" map sang lenh gi

Can chot som:

- cach 1: `banChatMember` roi `unbanChatMember` ngay sau do
- cach 2: `restrictChatMember`

Neu muon giong nhan thuc cua admin Telegram, nen dinh nghia:

- `kick` = remove user khoi group nhung cho phep join lai
- `ban` = cam quay lai

### 12.3 Khong dua logic vao lenh chat

Khong nen di theo huong `/lock url`, `/warnings kick`, `/setwarnlimit 2`.

Ly do:

- anh da chot CRM la source of truth
- lenh chat kho audit
- khong than thien voi van hanh nhieu group
- khong phu hop RBAC va multi-operator

Bot chi nen co mot so command debug hoac onboarding toi thieu:

- `/status`
- `/help`
- `/crm`

## 13. Ranh gioi giua hien tai va muc tieu

Hien tai repo da dat khoang 40-50% nen tang backend cho huong nay.

Da co:

- telegram webhook core
- policy global/group co ban
- execution methods co ban
- event persistence co ban

Chua co:

- full Rose-like lock system
- warning escalation
- full CRM control surface
- queue-first moderation pipeline
- bot rights lifecycle

## 14. Khuyen nghi chot truoc khi code

Truoc khi code implementation, nen chot 7 quyet dinh sau:

1. Danh sach lock types MVP se ho tro.
2. Dinh nghia chinh xac cua `warn`, `kick`, `mute`, `ban`, `temp ban`.
3. Warning expiry co can hay khong.
4. Trusted member co can hay khong.
5. Admin/mod co duoc exempt mac dinh hay khong.
6. Co dung AI ngay tu phase 1 khong, hay de sau.
7. Co bat buoc queue o phase dau khong.

## 15. De xuat MVP toi uu

Neu muc tieu la ship nhanh nhung dung kien truc, MVP nen gom:

- auto detect group khi bot duoc add
- CRM page danh sach group va bot rights
- per-group moderation config
- lock `url`, `invitelink`, `forward`, `command`
- warning ladder
- action `delete`, `mute`, `kick`, `ban`
- event queue + audit log
- moderation queue UI

Khong nen dua vao MVP:

- AI moderation sau
- forum topics
- story/reaction rules
- phan tich hanh vi phuc tap

## 16. Ket luan

Huong anh chot la dung:

- CRM la trung tam
- bot la execution layer
- group state duoc dong bo tu Telegram vao CRM
- moderation engine doc config tu CRM va ra quyet dinh
- Telegram API chi thuc thi quyet dinh do

Repo hien tai da co nen tang phu hop de di theo huong nay, nhung can nang cap backend schema, queue pipeline va UI moderation control center de dat muc tieu "Rose-like moderation but CRM-managed".
