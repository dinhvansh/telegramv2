import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { MatchWebhookService } from './match-webhook.service';
import type { MatchWebhookPayload } from './match-webhook.service';

@Controller('webhook/matches')
export class MatchWebhookController {
  constructor(private readonly matchWebhookService: MatchWebhookService) {}

  /**
   * POST /api/webhook/matches
   *
   * n8n calls this endpoint with match schedule data.
   * Requires Bearer token + workspace context.
   *
   * Headers:
   *   - Authorization: Bearer <token>
   *   - x-workspace-id: <workspace-id>
   *   - x-use-ai: "true" (optional) — AI viết caption hay hơn
   *
   * Response: { total, created, skipped, errors[], aiUsed }
   */
  @Post()
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('autopost.execute')
  async handleMatchWebhook(
    @Body() payload: MatchWebhookPayload,
    @Headers('x-workspace-id') workspaceId?: string,
    @Headers('x-use-ai') useAi?: string,
  ) {
    return this.matchWebhookService.createMatchSchedules(
      payload,
      workspaceId,
      useAi === 'true',
    );
  }
}
