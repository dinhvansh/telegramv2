# N8N Match Webhook Setup

## Endpoint

- Local: `http://localhost:4000/api/webhook/matches`
- Live: `https://tele.blogthethao.org/api/webhook/matches`

## Mục đích

Endpoint này nhận dữ liệu lịch thi đấu đã được `n8n` hoặc service bên ngoài chuẩn bị sẵn.
Hệ thống sẽ:

1. nhận payload trận đấu
2. nếu bật AI thì gọi AI viết caption
3. tạo `autopost schedule`
4. lên lịch gửi bài trước giờ đá 30 phút

## Headers bắt buộc

- `Authorization: Bearer <access_token>`
- `x-workspace-id: <workspace_id>`

## Header tùy chọn

- `x-use-ai: true`

## Workspace local hiện tại

- `Default Workspace`
- `workspaceId = cmntpxcs10002lw29bptaz603`

## Payload mẫu

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

## Curl test

```bash
curl -X POST "https://tele.blogthethao.org/api/webhook/matches" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "x-workspace-id: cmntpxcs10002lw29bptaz603" \
  -H "x-use-ai: true" \
  -H "Content-Type: application/json" \
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

## N8N đề xuất

1. `Schedule Trigger` hoặc `Webhook`
2. `HTTP Request` để lấy dữ liệu lịch bóng đá từ nguồn của bạn
3. `Function` hoặc `Set` để map dữ liệu về đúng schema ở trên
4. `HTTP Request` gửi sang `tele.blogthethao.org/api/webhook/matches`

## Cấu hình HTTP Request trong N8N

- Method: `POST`
- URL: `https://tele.blogthethao.org/api/webhook/matches`
- Send Headers:
  - `Authorization`
  - `x-workspace-id`
  - `x-use-ai`
- Body Content Type: `JSON`
- Body: object theo payload mẫu

## Điều kiện để AI viết bài chạy thật

1. `ai.base_url` hợp lệ
2. `ai.api_token` hợp lệ
3. `ai.model` hợp lệ
4. gửi header `x-use-ai: true`

Nếu AI lỗi hoặc không có token, hệ thống sẽ fallback sang caption mặc định.
