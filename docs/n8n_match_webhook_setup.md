# n8n Match Webhook Setup

## Mục đích

Đẩy dữ liệu trận bóng từ n8n hoặc nguồn ngoài vào hệ thống để tạo autopost schedule.

## URL

### Live

`https://tele.blogthethao.org/api/webhook/matches`

### Local

`http://localhost:4000/api/webhook/matches`

## Headers bắt buộc

- `Authorization: Bearer <access_token>`
- `x-workspace-id: <workspace_id>`

## Header tùy chọn

- `x-use-ai: true`

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

## Ghi chú

- Endpoint này không đi tự fetch dữ liệu trận
- Nó chỉ nhận dữ liệu đã được n8n hoặc nguồn ngoài chuẩn bị sẵn
- Nếu bật AI thì hệ thống dùng AI để viết caption
