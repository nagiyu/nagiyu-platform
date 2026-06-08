import { z } from 'zod';

/**
 * プッシュ通知クリティカル escalation 判定向け Structured Outputs スキーマ（Phase 5d リビジョン）。
 *
 * LLM には「新作リリース・期間限定イベント・締切」などの具体的な日付を抽出させる。
 * 日付が取れた場合のみ時限性ありとみなし、「最新トレンド」「ランキング」等は null を返させる。
 *
 * @see Issue #3346
 */
export const EscalationSchema = z.object({
  /**
   * 発売日・開催日・締切・終了日など、この情報の最も重要な「日付」を YYYY-MM-DD で。
   * 「最新トレンド」「ランキング」「一般的な雑学」「日付の無い新着情報」の場合は null。
   */
  eventDate: z.string().nullable(),
  /** 判定理由の短いメモ（ログ用） */
  reason: z.string().nullable(),
});

export type EscalationRaw = z.infer<typeof EscalationSchema>;
