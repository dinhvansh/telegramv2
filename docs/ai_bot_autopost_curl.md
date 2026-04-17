# AI Bot Autopost Curl Reference

## Muc tieu

File nay gom lai toan bo curl can dung cho:

- Login lay JWT
- Lay `workspaceId`
- Goi webhook tao bai tu du lieu tran dau
- Bat AI bot bai
- Tao / gui / dispatch autopost qua API co auth

## 1. Login lay JWT

### Local

```bash
curl -X POST "http://localhost:4000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@nexus.local",
    "password": "admin123"
  }'
```

Response se co dang:

```json
{
  "accessToken": "JWT_TOKEN",
  "user": {
    "id": "user-id",
    "email": "admin@nexus.local",
    "permissions": [
      "autopost.execute"
    ],
    "defaultWorkspaceId": "workspace-id",
    "workspaces": [
      {
        "id": "workspace-id",
        "name": "Default Workspace"
      }
    ]
  }
}
```

Lay 2 gia tri can nho:

- `accessToken`
- `user.defaultWorkspaceId`

## 2. Kiem tra token hien tai

```bash
curl "http://localhost:4000/api/auth/me" \
  -H "Authorization: Bearer JWT_TOKEN"
```

## 3. Webhook cho AI bot bai

Webhook nay khong can JWT. No dung secret co dinh.

### Secret hien tai

```text
tg-matches-webhook-secret-2026
```

### Curl webhook thuong

```bash
curl -X POST "http://localhost:4000/api/webhook/matches" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: tg-matches-webhook-secret-2026" \
  -H "x-workspace-id: WORKSPACE_ID" \
  -d '{
    "success": true,
    "from_date": "2026-04-11",
    "to_date": "2026-04-11",
    "count": 1,
    "data": [
      {
        "match_id": "m001",
        "home_team": "Arsenal",
        "away_team": "Chelsea",
        "start_date": "2026-04-12",
        "start_time": "18:30:00",
        "slug": "arsenal-vs-chelsea",
        "league_name": "Premier League",
        "commentator_name": "BLV A"
      }
    ]
  }'
```

### Curl webhook bat AI bot bai

```bash
curl -X POST "http://localhost:4000/api/webhook/matches" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: tg-matches-webhook-secret-2026" \
  -H "x-workspace-id: WORKSPACE_ID" \
  -H "x-use-ai: true" \
  -d '{
    "success": true,
    "from_date": "2026-04-11",
    "to_date": "2026-04-11",
    "count": 1,
    "data": [
      {
        "match_id": "m001",
        "home_team": "Arsenal",
        "away_team": "Chelsea",
        "start_date": "2026-04-12",
        "start_time": "18:30:00",
        "slug": "arsenal-vs-chelsea",
        "league_name": "Premier League",
        "commentator_name": "BLV A"
      }
    ]
  }'
```

## 4. Lay snapshot autopost

API nay can JWT va quyen `autopost.execute`.

```bash
curl "http://localhost:4000/api/autopost" \
  -H "Authorization: Bearer JWT_TOKEN" \
  -H "x-workspace-id: WORKSPACE_ID"
```

## 5. Tao autopost schedule

```bash
curl -X POST "http://localhost:4000/api/autopost/schedules" \
  -H "Authorization: Bearer JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "x-workspace-id: WORKSPACE_ID" \
  -d '{
    "title": "Keo toi nay Arsenal vs Chelsea",
    "message": "Bai test autopost tu curl",
    "frequency": "SCHEDULED",
    "scheduledFor": "2026-04-20T11:30:00.000Z",
    "telegramGroupIds": ["GROUP_ID_1", "GROUP_ID_2"],
    "selectAllTelegramGroups": false,
    "saveAsDraft": false
  }'
```

## 6. Gui bai ngay lap tuc

```bash
curl -X POST "http://localhost:4000/api/autopost/send-now" \
  -H "Authorization: Bearer JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "x-workspace-id: WORKSPACE_ID" \
  -d '{
    "title": "Gui ngay tu curl",
    "message": "Test send-now",
    "frequency": "IMMEDIATE",
    "telegramGroupIds": ["GROUP_ID_1"],
    "selectAllTelegramGroups": false
  }'
```

## 7. Tao target thu cong

```bash
curl -X POST "http://localhost:4000/api/autopost/targets" \
  -H "Authorization: Bearer JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "TELEGRAM",
    "externalId": "-1001234567890",
    "displayName": "My Telegram Group"
  }'
```

## 8. Cap nhat schedule

```bash
curl -X PUT "http://localhost:4000/api/autopost/schedules/SCHEDULE_ID" \
  -H "Authorization: Bearer JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "x-workspace-id: WORKSPACE_ID" \
  -d '{
    "title": "Cap nhat lich",
    "message": "Noi dung moi",
    "frequency": "SCHEDULED",
    "scheduledFor": "2026-04-21T12:00:00.000Z",
    "telegramGroupIds": ["GROUP_ID_1"],
    "selectAllTelegramGroups": false,
    "saveAsDraft": false
  }'
```

## 9. Bat/tat schedule

```bash
curl -X POST "http://localhost:4000/api/autopost/schedules/SCHEDULE_ID/toggle" \
  -H "Authorization: Bearer JWT_TOKEN" \
  -H "x-workspace-id: WORKSPACE_ID"
```

## 10. Xoa schedule

```bash
curl -X DELETE "http://localhost:4000/api/autopost/schedules/SCHEDULE_ID" \
  -H "Authorization: Bearer JWT_TOKEN" \
  -H "x-workspace-id: WORKSPACE_ID"
```

## 11. Dispatch toan bo lich den han

```bash
curl -X POST "http://localhost:4000/api/autopost/dispatch" \
  -H "Authorization: Bearer JWT_TOKEN" \
  -H "x-workspace-id: WORKSPACE_ID"
```

## 12. Dispatch mot schedule cu the

```bash
curl -X POST "http://localhost:4000/api/autopost/schedules/SCHEDULE_ID/dispatch" \
  -H "Authorization: Bearer JWT_TOKEN" \
  -H "x-workspace-id: WORKSPACE_ID"
```

## Ghi chu nhanh

- Webhook AI bot bai dung `x-webhook-secret`, khong dung Bearer token
- Cac API `/api/autopost/*` dung `Authorization: Bearer JWT_TOKEN`
- Neu user khong co `autopost.execute` thi API autopost se bi chan
- Neu gui theo workspace thi nen luon kem `x-workspace-id`
- AI chi hoat dong khi phan AI config trong settings da co `baseUrl`, `apiToken`, `model`
