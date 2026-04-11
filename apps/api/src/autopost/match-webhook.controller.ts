import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { MatchWebhookService } from './match-webhook.service';
import type { MatchWebhookPayload } from './match-webhook.service';

@Controller('webhook/matches')
export class MatchWebhookController {
  // Hardcoded webhook secret — anyone with this token can post matches.
  // Change this value to rotate the secret.
  private static readonly WEBHOOK_SECRET = 'tg-matches-webhook-secret-2026';

  constructor(private readonly matchWebhookService: MatchWebhookService) {}

  private verifySecret(secret: string | undefined) {
    if (!secret || secret !== MatchWebhookController.WEBHOOK_SECRET) {
      throw new UnauthorizedException('Invalid webhook secret');
    }
  }

  /**
   * POST /api/webhook/matches
   * n8n calls this endpoint with match schedule data.
   *
   * Headers:
   *   - x-webhook-secret: tg-matches-webhook-secret-2026
   *   - x-workspace-id: <workspace-id> (optional)
   *   - x-use-ai: "true" (optional)
   *
   * Response: { total, created, skipped, errors[], aiUsed }
   */
  @Post()
  @HttpCode(200)
  async handleMatchWebhook(
    @Body() payload: MatchWebhookPayload,
    @Headers('x-workspace-id') workspaceId?: string,
    @Headers('x-use-ai') useAi?: string,
    @Headers('x-webhook-secret') secret?: string,
  ) {
    this.verifySecret(secret);
    return this.matchWebhookService.createMatchSchedules(
      payload,
      workspaceId,
      useAi === 'true',
    );
  }

  /**
   * GET /api/webhook/matches
   * Returns the webhook info including secret — no auth required.
   */
  @Get()
  info() {
    return {
      url: '/api/webhook/matches',
      method: 'POST',
      secret: MatchWebhookController.WEBHOOK_SECRET,
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': MatchWebhookController.WEBHOOK_SECRET,
        'x-workspace-id': 'workspace-id (optional)',
        'x-use-ai': 'true (optional)',
      },
      payload: {
        success: true,
        from_date: 'YYYY-MM-DD',
        to_date: 'YYYY-MM-DD',
        count: 1,
        data: [
          {
            match_id: 'string',
            home_team: 'string',
            away_team: 'string',
            start_date: 'YYYY-MM-DD',
            start_time: 'HH:MM:SS',
            slug: 'string',
            league_name: 'string',
            commentator_name: 'string',
          },
        ],
      },
    };
  }
}
