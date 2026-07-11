import { z } from 'zod';

/**
 * 鮮度切れ WEB fact の再取得結果に対する変化判定スキーマ
 * （リブトーク知識再設計 P3 / #3699 の `WebFactChangeDetector` 用）。
 *
 * 既知の fact 本文と新しく取得した要約を比較し、実質的な変化があったかを
 * `changed` の真偽値で返させる。
 */
export const WebFactChangeSchema = z.object({
  changed: z.boolean(),
});

export type WebFactChangeRaw = z.infer<typeof WebFactChangeSchema>;
