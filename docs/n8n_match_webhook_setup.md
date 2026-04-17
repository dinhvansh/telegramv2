# n8n Match Webhook Setup

## Muc dich

Day danh sach tran dau tu n8n hoac nguon ngoai vao he thong de tu tao `autopost schedule`.

Endpoint nay co the:

- Tao lich dang cho toan bo Telegram group dang active trong workspace
- Tu set thoi gian dang som hon `30 phut` truoc gio bong lan
- Tuy chon bat AI de viet lai caption

## Endpoint

### Local

`http://localhost:4000/api/webhook/matches`

### Production

Thay bang domain API thuc te cua ban, vi du:

`https://your-domain/api/webhook/matches`

## Auth cua webhook

Webhook nay **khong dung JWT Bearer token**.

No dung secret header:

- `x-webhook-secret: tg-matches-webhook-secret-2026`

Header tuy chon:

- `x-workspace-id: <workspace_id>`
- `x-use-ai: true`

## Headers chuan

```text
Content-Type: application/json
x-webhook-secret: tg-matches-webhook-secret-2026
x-workspace-id: <workspace_id>
x-use-ai: true
```

`x-workspace-id` co the bo qua neu ban muon he thong dung scope mac dinh.

`x-use-ai: true` la tuy chon. Neu khong gui, he thong dung caption mac dinh.

## Payload mau

```json
{
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
}
```

## Curl mau

### 1. Webhook thuong

```bash
curl -X POST "http://localhost:4000/api/webhook/matches" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: tg-matches-webhook-secret-2026" \
  -H "x-workspace-id: YOUR_WORKSPACE_ID" \
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

### 2. Webhook bat AI bot bai

```bash
curl -X POST "http://localhost:4000/api/webhook/matches" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: tg-matches-webhook-secret-2026" \
  -H "x-workspace-id: YOUR_WORKSPACE_ID" \
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

### 3. Xem info webhook

```bash
curl "http://localhost:4000/api/webhook/matches"
```

## Response mau

```json
{
  "total": 1,
  "created": 1,
  "skipped": 0,
  "errors": [],
  "aiUsed": true
}
```

## Luu y

- Neu khong co Telegram group active thi webhook se khong tao duoc schedule
- Neu `x-use-ai: true` nhung AI config chua du, he thong se fallback ve caption mac dinh
- Neu gui lai cung `match_id`, he thong co the bo qua ban trung
- `start_date` va `start_time` phai dung format, neu sai se bi reject
