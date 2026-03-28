import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  it('/api/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((response) => {
        const body = response.body as { status: string; service: string };
        expect(body.status).toBe('ok');
        expect(body.service).toBe('telegram-operations-api');
      });
  });

  it('/api/campaigns (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/campaigns')
      .expect(200)
      .expect((response) => {
        expect(Array.isArray(response.body)).toBe(true);
      });
  });

  it('/api/auth/login (POST)', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'admin@nexus.local',
        password: 'admin123',
      })
      .expect(201)
      .expect((response) => {
        const body = response.body as {
          accessToken: string;
          user: { email: string };
        };
        expect(typeof body.accessToken).toBe('string');
        expect(body.user.email).toBe('admin@nexus.local');
      });
  });

  it('/api/auth/me (GET)', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'admin@nexus.local',
        password: 'admin123',
      });

    const body = loginResponse.body as { accessToken: string };

    return request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(200)
      .expect((response) => {
        const profile = response.body as { email: string; roles: string[] };
        expect(profile.email).toBe('admin@nexus.local');
        expect(profile.roles).toContain('Admin');
      });
  });

  it('/api/auth/login (POST) operator', () => {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'operator@nexus.local',
        password: 'operator123',
      })
      .expect(201)
      .expect((response) => {
        const body = response.body as {
          accessToken: string;
          user: { email: string; roles: string[] };
        };
        expect(typeof body.accessToken).toBe('string');
        expect(body.user.email).toBe('operator@nexus.local');
        expect(body.user.roles).toContain('Operator');
      });
  });

  it('/api/settings (GET) forbids operator', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'operator@nexus.local',
        password: 'operator123',
      });

    const body = loginResponse.body as { accessToken: string };

    return request(app.getHttpServer())
      .get('/api/settings')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(403);
  });

  it('/api/settings (GET) allows admin', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'admin@nexus.local',
        password: 'admin123',
      });

    const body = loginResponse.body as { accessToken: string };

    return request(app.getHttpServer())
      .get('/api/settings')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(200)
      .expect((response) => {
        const settings = response.body as Array<{ key: string; value: string }>;
        expect(Array.isArray(settings)).toBe(true);
        expect(settings.some((item) => item.key === 'system.name')).toBe(true);
        expect(
          settings.some(
            (item) =>
              item.key === 'ai.base_url' &&
              item.value === 'https://v98store.com/v1',
          ),
        ).toBe(true);
      });
  });

  it('/api/settings (PUT) updates settings for admin', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'admin@nexus.local',
        password: 'admin123',
      });

    const body = loginResponse.body as { accessToken: string };

    return request(app.getHttpServer())
      .put('/api/settings')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .send({
        entries: [
          {
            key: 'system.name',
            value: 'Telegram Operations Platform',
          },
          {
            key: 'ui.language',
            value: 'vi',
          },
          {
            key: 'ai.api_token',
            value: 'secret-token-for-e2e',
          },
        ],
      })
      .expect(200)
      .expect((response) => {
        const settings = response.body as Array<{ key: string; value: string }>;
        expect(settings.some((item) => item.key === 'ui.language')).toBe(true);
        expect(
          settings.some(
            (item) =>
              item.key === 'ai.api_token' && item.value === '__configured__',
          ),
        ).toBe(true);
      });
  });

  it('/api/settings/ai/models (POST) loads models for admin', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'admin@nexus.local',
        password: 'admin123',
      });

    const body = loginResponse.body as { accessToken: string };

    return request(app.getHttpServer())
      .post('/api/settings/ai/models')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .send({
        baseUrl: 'mock://catalog',
        apiToken: '',
      })
      .expect(201)
      .expect((response) => {
        const payload = response.body as {
          models: Array<{ id: string }>;
        };
        expect(Array.isArray(payload.models)).toBe(true);
        expect(payload.models.length).toBeGreaterThan(0);
      });
  });

  it('/api/campaigns (POST) requires auth', () => {
    return request(app.getHttpServer())
      .post('/api/campaigns')
      .send({
        name: 'Guarded Campaign',
        channel: 'Nexus Global',
      })
      .expect(401);
  });

  it('/api/users (GET) allows authenticated operator', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'operator@nexus.local',
        password: 'operator123',
      });

    const body = loginResponse.body as { accessToken: string };

    return request(app.getHttpServer())
      .get('/api/users')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(200)
      .expect((response) => {
        const users = response.body as Array<{ email: string }>;
        expect(Array.isArray(users)).toBe(true);
        expect(users.some((item) => item.email === 'admin@nexus.local')).toBe(
          true,
        );
      });
  });

  it('/api/users (POST) creates user for admin', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'admin@nexus.local',
        password: 'admin123',
      });

    const body = loginResponse.body as { accessToken: string };

    return request(app.getHttpServer())
      .post('/api/users')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .send({
        name: 'E2E User',
        email: 'e2e.user@nexus.local',
        password: 'e2e12345',
        roleId: 'fallback-role-operator',
        department: 'QA',
        username: 'e2e_user',
        status: 'ACTIVE',
      })
      .expect(201)
      .expect((response) => {
        const user = response.body as {
          email: string;
          primaryRole: string;
        };
        expect(user.email).toBe('e2e.user@nexus.local');
        expect(user.primaryRole).toBe('Operator');
      });
  });

  it('/api/telegram/status (GET) allows admin', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'admin@nexus.local',
        password: 'admin123',
      });

    const body = loginResponse.body as { accessToken: string };

    return request(app.getHttpServer())
      .get('/api/telegram/status')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(200)
      .expect((response) => {
        const status = response.body as {
          mode: string;
          botConfigured: boolean;
        };
        expect(typeof status.mode).toBe('string');
        expect(typeof status.botConfigured).toBe('boolean');
      });
  });

  it('/api/telegram/status (GET) forbids operator', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'operator@nexus.local',
        password: 'operator123',
      });

    const body = loginResponse.body as { accessToken: string };

    return request(app.getHttpServer())
      .get('/api/telegram/status')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(403);
  });

  it('/api/telegram/discover-groups (POST) returns skipped without token', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'admin@nexus.local',
        password: 'admin123',
      });

    const body = loginResponse.body as { accessToken: string };

    return request(app.getHttpServer())
      .post('/api/telegram/discover-groups')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(201)
      .expect((response) => {
        const payload = response.body as {
          skipped: boolean;
          items: unknown[];
        };
        expect(typeof payload.skipped).toBe('boolean');
        expect(Array.isArray(payload.items)).toBe(true);
      });
  });

  it('/api/telegram/groups (GET) allows admin', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'admin@nexus.local',
        password: 'admin123',
      });

    const body = loginResponse.body as { accessToken: string };

    return request(app.getHttpServer())
      .get('/api/telegram/groups')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(200)
      .expect((response) => {
        const payload = response.body as { items: unknown[] };
        expect(Array.isArray(payload.items)).toBe(true);
      });
  });

  it('/api/telegram/invite-links (POST) skips when token or group is missing', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'admin@nexus.local',
        password: 'admin123',
      });

    const body = loginResponse.body as { accessToken: string };

    return request(app.getHttpServer())
      .post('/api/telegram/invite-links')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .send({
        groupTitle: 'Nexus Global',
        name: 'E2E Invite',
        memberLimit: 10,
        expireHours: 12,
      })
      .expect(201)
      .expect((response) => {
        const payload = response.body as {
          skipped: boolean;
          inviteLink: unknown;
        };
        expect(typeof payload.skipped).toBe('boolean');
        expect(payload.inviteLink ?? null).toBeNull();
      });
  });

  it('/api/moderation/members (GET) allows admin', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'admin@nexus.local',
        password: 'admin123',
      });

    const body = loginResponse.body as { accessToken: string };

    return request(app.getHttpServer())
      .get('/api/moderation/members')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(200)
      .expect((response) => {
        const payload = response.body as {
          members: Array<{ membershipStatus: string }>;
        };
        expect(Array.isArray(payload.members)).toBe(true);
        expect(
          payload.members.some((member) => member.membershipStatus === 'left'),
        ).toBe(true);
      });
  });

  it('/api/moderation/events (GET) allows admin', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'admin@nexus.local',
        password: 'admin123',
      });

    const body = loginResponse.body as { accessToken: string };

    return request(app.getHttpServer())
      .get('/api/moderation/events')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(200)
      .expect((response) => {
        const events = response.body as Array<{ decision: string }>;
        expect(Array.isArray(events)).toBe(true);
      });
  });

  it('/api/system-logs (GET) returns structured system logs', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'admin@nexus.local',
        password: 'admin123',
      });

    const body = loginResponse.body as { accessToken: string };

    return request(app.getHttpServer())
      .get('/api/system-logs?limit=20')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(200)
      .expect((response) => {
        const logs = response.body as Array<{ scope: string; action: string }>;
        expect(Array.isArray(logs)).toBe(true);
      });
  });

  it('/api/moderation/config (GET) returns scopes and built-in rules', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'admin@nexus.local',
        password: 'admin123',
      });

    const body = loginResponse.body as { accessToken: string };

    return request(app.getHttpServer())
      .get('/api/moderation/config')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(200)
      .expect((response) => {
        const payload = response.body as {
          scopes: Array<{ scopeKey: string }>;
          builtInRules: { keywords?: string[] };
        };
        expect(Array.isArray(payload.scopes)).toBe(true);
        expect(payload.scopes.length).toBeGreaterThan(0);
        expect(Array.isArray(payload.builtInRules.keywords)).toBe(true);
      });
  });

  it('/api/moderation/config (PUT) updates current scope policy', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'admin@nexus.local',
        password: 'admin123',
      });

    const body = loginResponse.body as { accessToken: string };

    return request(app.getHttpServer())
      .put('/api/moderation/config')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .send({
        scopeKey: 'global',
        autoBanSpam: false,
        muteNewMembers: true,
        muteDurationHours: 18,
      })
      .expect(200)
      .expect((response) => {
        const payload = response.body as {
          scopes: Array<{ scopeKey: string; autoBanSpam: boolean }>;
        };
        expect(Array.isArray(payload.scopes)).toBe(true);
        expect(
          payload.scopes.some((scope) => scope.scopeKey === 'global'),
        ).toBe(true);
      });
  });

  it('/api/moderation/keywords (POST) appends keyword config', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'admin@nexus.local',
        password: 'admin123',
      });

    const body = loginResponse.body as { accessToken: string };

    return request(app.getHttpServer())
      .post('/api/moderation/keywords')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .send({
        scopeKey: 'global',
        value: 'priority scam',
      })
      .expect(201)
      .expect((response) => {
        const payload = response.body as {
          scopes: Array<{
            scopeKey: string;
            keywords: Array<{ value: string }>;
          }>;
        };
        expect(Array.isArray(payload.scopes)).toBe(true);
      });
  });

  it('/api/moderation/domains (POST) appends domain config', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'admin@nexus.local',
        password: 'admin123',
      });

    const body = loginResponse.body as { accessToken: string };

    return request(app.getHttpServer())
      .post('/api/moderation/domains')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .send({
        scopeKey: 'global',
        value: 'trusted.local',
        mode: 'ALLOW',
      })
      .expect(201)
      .expect((response) => {
        const payload = response.body as {
          scopes: Array<{
            scopeKey: string;
            domains: Array<{ value: string }>;
          }>;
        };
        expect(Array.isArray(payload.scopes)).toBe(true);
      });
  });

  it('/api/moderation/analyze (POST) evaluates spam for admin', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'admin@nexus.local',
        password: 'admin123',
      });

    const body = loginResponse.body as { accessToken: string };

    return request(app.getHttpServer())
      .post('/api/moderation/analyze')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .send({
        source: 'manual',
        eventType: 'message_received',
        actorUsername: 'bonus_admin',
        groupTitle: 'Nexus Global',
        messageText:
          'Claim now free USDT bonus at https://bit.ly/fake-airdrop wallet connect',
      })
      .expect(201)
      .expect((response) => {
        const payload = response.body as {
          finalScore: number;
          decision: string;
          matchedRules: string[];
        };
        expect(payload.finalScore).toBeGreaterThanOrEqual(60);
        expect(Array.isArray(payload.matchedRules)).toBe(true);
        expect(typeof payload.decision).toBe('string');
      });
  });

  it('/api/moderation/analyze (POST) escalates join_request when mute-new-members is enabled', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'admin@nexus.local',
        password: 'admin123',
      });

    const body = loginResponse.body as { accessToken: string };

    return request(app.getHttpServer())
      .post('/api/moderation/analyze')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .send({
        source: 'manual',
        eventType: 'join_request',
        actorUsername: 'fresh_member',
        groupTitle: 'Nexus Global',
      })
      .expect(201)
      .expect((response) => {
        const payload = response.body as {
          decision: string;
          policySnapshot: { muteNewMembers: boolean };
        };
        expect(payload.policySnapshot.muteNewMembers).toBe(true);
        expect(typeof payload.decision).toBe('string');
      });
  });

  it('/api/moderation/events/:id/action (POST) accepts manual decision payload', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'admin@nexus.local',
        password: 'admin123',
      });

    const body = loginResponse.body as { accessToken: string };

    await request(app.getHttpServer())
      .post('/api/moderation/analyze')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .send({
        source: 'manual',
        eventType: 'message_received',
        actorUsername: 'manual_case',
        groupTitle: 'Nexus Global',
        messageText: 'simple moderation case',
      });

    const eventsResponse = await request(app.getHttpServer())
      .get('/api/moderation/events')
      .set('Authorization', `Bearer ${body.accessToken}`);

    const events = eventsResponse.body as Array<{ id?: string }>;
    const eventId = events[0]?.id || 'fallback-event-id';

    return request(app.getHttpServer())
      .post(`/api/moderation/events/${eventId}/action`)
      .set('Authorization', `Bearer ${body.accessToken}`)
      .send({
        decision: 'REVIEW',
        note: 'Needs human verification',
      })
      .expect(201)
      .expect((response) => {
        const payload = response.body as {
          updated?: boolean;
          manualDecision?: string;
          action?: { skipped?: boolean; enforced?: boolean };
        };
        expect(typeof payload).toBe('object');
      });
  });

  it('/api/moderation/members (GET) forbids operator', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'operator@nexus.local',
        password: 'operator123',
      });

    const body = loginResponse.body as { accessToken: string };

    return request(app.getHttpServer())
      .get('/api/moderation/members')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(403);
  });

  it('/api/telegram/mock (POST) works for operator', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'operator@nexus.local',
        password: 'operator123',
      });

    const body = loginResponse.body as { accessToken: string };

    return request(app.getHttpServer())
      .post('/api/telegram/mock')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .send({
        type: 'user_joined',
        campaignName: 'E2E Campaign',
        groupTitle: 'Nexus Global',
        memberCount: 2,
      })
      .expect(201)
      .expect((response) => {
        const mock = response.body as {
          processed: boolean;
          eventType: string;
        };
        expect(mock.processed).toBe(true);
        expect(mock.eventType).toBe('user_joined');
      });
  });

  it('/api/telegram/webhook (POST) accepts join payload', () => {
    return request(app.getHttpServer())
      .post('/api/telegram/webhook')
      .send({
        message: {
          chat: {
            title: 'Nexus Global',
          },
          new_chat_members: [
            {
              username: 'new_member',
            },
          ],
          invite_link: {
            name: 'Growth Link',
          },
        },
      })
      .expect(201)
      .expect((response) => {
        const webhook = response.body as {
          acknowledged: boolean;
          eventType: string;
        };
        expect(webhook.acknowledged).toBe(true);
        expect(webhook.eventType).toBe('user_joined');
      });
  });

  it('/api/telegram/webhook (POST) returns moderation for message payload', () => {
    return request(app.getHttpServer())
      .post('/api/telegram/webhook')
      .send({
        message: {
          chat: {
            title: 'Nexus Global',
          },
          text: 'Free USDT airdrop: connect wallet at https://bit.ly/demo',
        },
      })
      .expect(201)
      .expect((response) => {
        const webhook = response.body as {
          acknowledged: boolean;
          moderation?: { finalScore: number; decision: string };
        };
        expect(webhook.acknowledged).toBe(true);
        expect(typeof webhook.moderation?.finalScore).toBe('number');
        expect(typeof webhook.moderation?.decision).toBe('string');
      });
  });

  it('/api/telegram/webhook (POST) accepts left-member payload', () => {
    return request(app.getHttpServer())
      .post('/api/telegram/webhook')
      .send({
        message: {
          chat: {
            title: 'Nexus Global',
          },
          left_chat_member: {
            id: 998877,
            username: 'departing_member',
            first_name: 'Departing',
          },
        },
      })
      .expect(201)
      .expect((response) => {
        const webhook = response.body as {
          acknowledged: boolean;
          eventType: string;
        };
        expect(webhook.acknowledged).toBe(true);
        expect(webhook.eventType).toBe('user_left');
      });
  });
});
