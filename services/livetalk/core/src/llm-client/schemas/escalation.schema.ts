import { z } from 'zod';

/**
 * プッシュ通知クリティカル escalation 判定向け Structured Outputs スキーマ。
 *
 * isCritical=true: 新作・期間限定・緊急性の高い情報で時間帯外でも配信すべき
 * isCritical=false: 通常の勉強ネタ、平常通知で十分
 *
 * @see Issue #3346
 */
export const EscalationSchema = z.object({
  isCritical: z.boolean(),
  /** 判定理由の短いメモ（ログ用） */
  reason: z.string().nullable(),
});

export type EscalationRaw = z.infer<typeof EscalationSchema>;
