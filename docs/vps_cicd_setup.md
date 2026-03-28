# VPS CI/CD Setup

Production target:
- Domain: `https://tele.blogthethao.org`
- VPS: `206.189.152.115`
- Reverse proxy: `nginx`
- App runtime:
  - web -> `127.0.0.1:3001`
  - api -> `127.0.0.1:4000`

Deployment layout on VPS:
- `/opt/telegramv2/app`
- `/opt/telegramv2/shared/.env.production`

GitHub Actions secrets to create:
- `TELEGRAM_VPS_HOST`
- `TELEGRAM_VPS_USER`
- `TELEGRAM_VPS_SSH_KEY`

App secrets stay on VPS inside `.env.production`, not in GitHub Actions.

First-time bootstrap checklist:
1. Create deploy user and install SSH public key.
2. Create `/opt/telegramv2/shared/.env.production`.
3. Install nginx config for `tele.blogthethao.org`.
4. Issue Let's Encrypt certificate.
5. Let server clone `https://github.com/dinhvansh/telegramv2.git`.
6. Push to `main` or trigger `Deploy VPS`.
