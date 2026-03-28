# TELEGRAM OPERATIONS PLATFORM
## AI BUILD SPEC (FOR AI CODING / DEV EXECUTION)

---

# 1. PROJECT GOAL

Build a production-oriented **Telegram Operations Platform** with the following capabilities:
- Campaign management
- Invite link tracking
- Telegram webhook processing
- Manual anti-spam
- AI anti-spam
- Smart link analysis
- Autopost scheduling
- Real-time dashboard with WebSocket
- Role-based access control (RBAC)
- Moderation dashboard
- Audit logging

The system must be designed as a **modular monolith** first, but with clean separation so it can scale later.

---

# 2. REQUIRED TECH STACK

## Frontend
- Next.js
- TypeScript
- TailwindCSS
- shadcn/ui
- Socket.IO client

## Backend
- NestJS
- TypeScript
- Socket.IO gateway
- BullMQ
- Prisma ORM

## Database / Infra
- PostgreSQL
- Redis
- Docker Compose

## AI Moderation Service
- FastAPI
- Python
- OpenAI API or pluggable classifier

---

# 3. MONOREPO STRUCTURE

```bash
telegram-ops-platform/
  apps/
    web/                # Next.js admin panel
    api/                # NestJS backend
    ai-service/         # FastAPI moderation service
  packages/
    shared-types/
    shared-utils/
  infra/
    docker/
    nginx/
  docs/
```

---

# 4. CORE FEATURES TO BUILD

## 4.1 Authentication
- Login page
- JWT auth
- Refresh token strategy
- Protected routes
- Role-based access check

## 4.2 User / Role / Permission
- User list
- Create/edit role
- Permission matrix
- Assign roles to users

## 4.3 Campaign Management
- Create campaign
- Link campaign to Telegram group
- Generate invite link
- Track join count
- Campaign detail page

## 4.4 Telegram Integration
- Webhook endpoint
- Process member join events
- Process message events
- Store raw event logs

## 4.5 Manual Anti-Spam
- Keyword blacklist
- Domain blacklist
- Link blocking
- Join-and-spam detection
- Rate-based spam rule

## 4.6 AI Anti-Spam
- Message classification
- Risk scoring
- Suspicious link analysis
- Manual review queue

## 4.7 Moderation Actions
- Delete message
- Warn user
- Mute user
- Ban user
- Approve false positive

## 4.8 Autopost
- Create message template
- Schedule post
- Send post to Telegram group
- Retry failed jobs
- View send logs

## 4.9 Dashboard
- Campaign summary
- Live join count
- Spam alerts
- Recent moderation actions
- Job status widgets

## 4.10 WebSocket Real-time
- Push `user_joined`
- Push `spam_detected`
- Push `autopost_sent`
- Push `system_alert`

---

# 5. NON-FUNCTIONAL REQUIREMENTS

- Clean architecture
- Strong typing
- Validation on all APIs
- Centralized error handling
- Audit logs for sensitive actions
- Secure secret handling
- Rate limiting
- Dockerized local environment
- Easy seed/setup command
- Testable modules

---

# 6. DATABASE ENTITIES (MINIMUM)

## Auth / RBAC
- users
- roles
- permissions
- user_roles
- role_permissions
- refresh_tokens

## Campaign
- campaigns
- telegram_groups
- campaign_invite_links
- invite_link_events
- campaign_members

## Event / Moderation
- telegram_events
- spam_rules
- spam_events
- moderation_actions
- blocked_domains
- blocked_keywords
- user_risk_scores

## Autopost
- message_templates
- autopost_schedules
- autopost_jobs
- message_logs

## Audit / Settings
- audit_logs
- system_settings

---

# 7. API MODULES TO IMPLEMENT

## Backend modules
- auth
- users
- roles
- permissions
- campaigns
- telegram
- invite-links
- spam
- moderation
- autopost
- templates
- analytics
- settings
- websocket
- audit-logs

---

# 8. REQUIRED API ENDPOINTS (MINIMUM)

## Auth
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`

## Users / Roles
- `GET /users`
- `POST /users`
- `GET /roles`
- `POST /roles`
- `PUT /roles/:id`
- `GET /permissions`

## Campaigns
- `GET /campaigns`
- `POST /campaigns`
- `GET /campaigns/:id`
- `PUT /campaigns/:id`
- `POST /campaigns/:id/invite-links`

## Telegram
- `POST /telegram/webhook`
- `GET /telegram/groups`

## Spam / Moderation
- `GET /spam/events`
- `POST /spam/rules`
- `GET /moderation/actions`
- `POST /moderation/review/:id/approve`
- `POST /moderation/review/:id/ban`
- `POST /moderation/review/:id/mute`

## Autopost
- `GET /autopost/schedules`
- `POST /autopost/schedules`
- `PUT /autopost/schedules/:id`
- `GET /autopost/jobs`
- `GET /autopost/logs`

## Dashboard
- `GET /dashboard/summary`
- `GET /dashboard/live-metrics`

---

# 9. WEBSOCKET EVENTS

## Client subscribes to:
- `admin_room`
- `moderation_room`
- `campaign_{id}`
- `group_{id}`

## Server emits:
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

# 10. AI SERVICE CONTRACT

## Endpoint
`POST /moderate`

## Request example
```json
{
  "message": "Join this crypto group now https://bit.ly/xxx",
  "user_id": "u_123",
  "username": "spam_user",
  "links": ["https://bit.ly/xxx"],
  "join_source": "campaign_001",
  "history": {
    "is_new_user": true,
    "previous_spam_count": 1
  }
}
```

## Response example
```json
{
  "label": "spam",
  "risk_score": 88,
  "reasons": [
    "suspicious_link",
    "promotional_pattern",
    "new_user_behavior"
  ],
  "recommended_action": "ban"
}
```

---

# 11. MANUAL + AI DECISION LOGIC

## Decision pipeline
1. Telegram event received
2. Save raw event
3. Push queue
4. Worker runs manual rules
5. If clearly malicious -> immediate action
6. If uncertain -> call AI service
7. Combine score
8. Execute moderation action
9. Save logs
10. Emit WebSocket event

## Example logic
- If blocked domain found -> delete + mute immediately
- If repeated suspicious pattern -> AI check + high risk score
- If score medium -> put into manual review queue

---

# 12. DEVELOPMENT TASK BREAKDOWN

## PHASE 1 - FOUNDATION
- [ ] Initialize monorepo structure
- [ ] Setup Next.js app
- [ ] Setup NestJS app
- [ ] Setup FastAPI app
- [ ] Setup PostgreSQL + Redis in Docker Compose
- [ ] Setup Prisma
- [ ] Create initial database schema
- [ ] Add seed data for admin user / roles / permissions
- [ ] Add environment example files

## PHASE 2 - AUTH + RBAC
- [ ] Implement login/logout/refresh
- [ ] Implement JWT guards
- [ ] Implement role/permission guard
- [ ] Build login UI
- [ ] Build user management page
- [ ] Build role/permission management page

## PHASE 3 - CAMPAIGN + TELEGRAM
- [ ] Build campaign CRUD API
- [ ] Build campaign UI list/detail page
- [ ] Add Telegram webhook endpoint
- [ ] Save raw webhook events
- [ ] Build invite link generation flow
- [ ] Track campaign member join events

## PHASE 4 - MANUAL ANTI-SPAM
- [ ] Build spam rule entity + CRUD
- [ ] Add blocked keyword/domain settings UI
- [ ] Implement rule engine in worker
- [ ] Add moderation action logs
- [ ] Build moderation event list page

## PHASE 5 - AI MODERATION
- [ ] Build FastAPI moderation endpoint
- [ ] Integrate OpenAI classifier or pluggable mock engine
- [ ] Add risk score calculation
- [ ] Add manual review queue
- [ ] Show AI reasons in moderation UI

## PHASE 6 - AUTOPOST
- [ ] Build template CRUD
- [ ] Build schedule CRUD
- [ ] Add BullMQ job processing
- [ ] Add retry logic
- [ ] Build autopost log page

## PHASE 7 - WEBSOCKET REALTIME
- [ ] Setup NestJS WebSocket gateway
- [ ] Add JWT socket auth
- [ ] Implement room join strategy
- [ ] Emit campaign join updates
- [ ] Emit spam alerts
- [ ] Emit autopost updates
- [ ] Build frontend socket listeners

## PHASE 8 - DASHBOARD
- [ ] Build dashboard summary API
- [ ] Build live widgets
- [ ] Show real-time joins/spam/jobs
- [ ] Add charts for campaign growth

## PHASE 9 - AUDIT / HARDENING
- [ ] Audit log middleware/service
- [ ] Rate limiting
- [ ] Better error responses
- [ ] Secret handling cleanup
- [ ] Input validation review
- [ ] Production Docker cleanup

---

# 13. BUILD ORDER FOR AI CODING

The AI should implement in this order:
1. Infra + Docker Compose
2. Prisma schema + migrations
3. NestJS auth + RBAC
4. Next.js login + admin shell
5. Campaign module
6. Telegram webhook ingestion
7. Worker + queues
8. Manual anti-spam
9. FastAPI moderation service
10. WebSocket gateway
11. Autopost
12. Dashboard
13. Test + hardening

Do not jump directly to dashboard visuals before backend foundation is stable.

---

# 14. CODING RULES FOR AI

- Use TypeScript strict mode
- Use DTO validation in NestJS
- Keep modules isolated
- No business logic inside controllers
- No business logic inside WebSocket gateway
- Worker handles heavy async tasks
- Use Prisma service layer cleanly
- Write reusable UI components
- Keep environment config centralized
- Add loading/error states on frontend
- Prefer simple, maintainable code over overengineering

---

# 15. TESTING REQUIREMENTS

## Backend
- Unit tests for services
- Unit tests for spam rule engine
- Integration tests for auth flow
- Integration tests for campaign API
- Integration tests for webhook processing

## AI Service
- Test moderation endpoint with mock payloads
- Test spam / suspicious / normal classifications

## Frontend
- Basic component tests
- Page render tests for login / dashboard / campaign detail

## End-to-end
- Login flow
- Create campaign flow
- Webhook -> event saved -> socket event emitted
- Spam detected -> moderation action shown
- Autopost job -> success log visible

---

# 16. BUILD VERIFICATION CHECKLIST

## Infrastructure
- [ ] `docker compose up` starts web/api/ai-service/postgres/redis
- [ ] Database migration runs successfully
- [ ] Seed runs successfully

## Backend
- [ ] Login returns JWT
- [ ] Protected route rejects invalid token
- [ ] Role guard works
- [ ] Campaign can be created
- [ ] Telegram webhook stores event
- [ ] Spam event can be processed
- [ ] AI moderation endpoint responds
- [ ] WebSocket client receives event
- [ ] Autopost job runs and logs status

## Frontend
- [ ] Login page works
- [ ] Dashboard loads summary
- [ ] Campaign list loads
- [ ] Moderation list loads
- [ ] Live event appears without refresh

---

# 17. LOCAL RUN COMMANDS (TARGET)

## Suggested commands
```bash
# infrastructure
docker compose up -d

# backend
cd apps/api
npm install
npm run start:dev

# frontend
cd apps/web
npm install
npm run dev

# ai service
cd apps/ai-service
pip install -r requirements.txt
uvicorn main:app --reload --port 8001
```

---

# 18. MVP ACCEPTANCE CRITERIA

The MVP is considered complete when:
- Admin can log in
- Admin can create campaign
- System can receive Telegram webhook
- User join event is saved and shown on UI
- Spam rules can block obvious spam
- AI service can classify suspicious content
- Moderator can manually ban/mute/review
- Autopost can send scheduled message
- Dashboard receives real-time updates through WebSocket

---

# 19. OPTIONAL STRETCH GOALS

- CAPTCHA verification for new users
- URL expansion and domain reputation scoring
- False positive feedback loop
- Redis socket adapter for scale
- Multi-tenant support
- Notification center
- Incident/system health page

---

# 20. FINAL INSTRUCTION FOR AI CODER

Build the system incrementally.
After each major phase:
1. ensure the app still runs,
2. run tests,
3. verify Docker/local startup,
4. keep README updated,
5. avoid breaking existing modules.

Prioritize stability, correctness, and maintainability over flashy UI.

---

# END

