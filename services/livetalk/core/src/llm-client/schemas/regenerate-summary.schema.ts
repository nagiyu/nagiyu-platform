import { z } from 'zod';

/**
 * 忘却（forgetSelfFact）向け要約再生成 Structured Outputs スキーマ
 * （リブトーク知識再設計 P2 / #3698）。
 *
 * SELF fact 削除後、残った SELF/WEB fact から Topic の canonicalSummary を
 * 再生成させるために使う。削除済みの内容を LLM が復元しないよう、
 * プロンプト側で「渡された事実のみを根拠にする」よう指示する。
 */
export const RegenerateSummarySchema = z.object({
  /** 再生成後の正規化要約（日本語） */
  canonicalSummary: z.string(),
});

export type RegenerateSummaryRaw = z.infer<typeof RegenerateSummarySchema>;
