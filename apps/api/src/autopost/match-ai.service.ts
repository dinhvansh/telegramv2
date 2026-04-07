import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';

export type AiPostResult = {
  success: boolean;
  content: string;
  provider: string;
  model: string;
};

@Injectable()
export class MatchAiService {
  constructor(private readonly settingsService: SettingsService) {}

  async enhanceMatchPost(input: {
    home_team: string;
    away_team: string;
    league_name: string;
    start_date: string;
    start_time: string;
    commentator_name?: string;
    home_logo?: string;
    away_logo?: string;
  }): Promise<AiPostResult> {
    const aiConfig = await this.settingsService.getResolvedAiConfig();

    if (!aiConfig.baseUrl || !aiConfig.apiToken) {
      return {
        success: false,
        content: '',
        provider: 'disabled',
        model: '',
      };
    }

    if (/^mock:\/\//i.test(aiConfig.baseUrl)) {
      return {
        success: false,
        content: '',
        provider: 'mock',
        model: 'mock',
      };
    }

    const normalizedBaseUrl = aiConfig.baseUrl.replace(/\/$/, '');
    const endpoint = /\/v1$/i.test(normalizedBaseUrl)
      ? `${normalizedBaseUrl}/chat/completions`
      : `${normalizedBaseUrl}/v1/chat/completions`;

    const prompt = `Ban la mot chuyen gia social media, viet bai post Tottenham cho Telegram channel.

Viet mot bai post TIENG VIET, hấp dẫn, ngắn gọn (duoi 280 ky tu) ve tran dau:

${input.home_team} vs ${input.away_team}
🏆 ${input.league_name}
📅 ${input.start_date} luc ${input.start_time}
${input.commentator_name ? `🎙️ BLV: ${input.commentator_name}` : ''}

Yeu cau:
- Su dung emoji phu hop (⚽🏆📅🎙️🔥⭐)
- Dong duoi phai la link: https://ngoaihang.live/xem-truc-tiep/${input.home_team.toLowerCase().replace(/\s+/g, '-')}-vs-${input.away_team.toLowerCase().replace(/\s+/g, '-')}
- Khong dung markdown bold/italic, chi emoji thuong
- Vi du: "⚽ TRAN DAU HOT!\n\n🔥 [Team A] vs [Team B]\n🏆 Premier League\n📅 Ngay X luc Y\n\n👉 Xem ngay: link"
- Hoan thanh bai post, tra ve CHI noi dung bai post, khong giai thich, khong markdown, khong code block`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${aiConfig.apiToken}`,
        },
        body: JSON.stringify({
          model: aiConfig.model,
          temperature: 0.7,
          messages: [
            { role: 'system', content: 'Ban la mot chuyen gia social media, viet cac bai post thể thao hấp dẫn cho Telegram.' },
            { role: 'user', content: prompt },
          ],
          max_tokens: 350,
        }),
      });

      if (!response.ok) {
        return {
          success: false,
          content: '',
          provider: 'error',
          model: aiConfig.model,
        };
      }

      const body = (await response.json()) as {
        choices?: Array<{
          message?: { content?: string };
        }>;
      };

      const content = body.choices?.[0]?.message?.content?.trim() || '';

      return {
        success: content.length > 0,
        content,
        provider: 'anthropic-compatible',
        model: aiConfig.model,
      };
    } catch {
      return {
        success: false,
        content: '',
        provider: 'error',
        model: aiConfig.model,
      };
    }
  }
}
