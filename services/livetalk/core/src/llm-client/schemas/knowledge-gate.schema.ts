import { z } from 'zod';

/**
 * `study/knowledge-gate.ts` の `classifyTopic` 向け Structured Outputs スキーマ。
 *
 * needsStudy=true: 時事・ユーザー固有・ニッチな情報で知識ベースへの蓄積が必要
 * needsStudy=false: 一般常識・キャラ嗜好範囲内で即答できる
 *
 * @see Issue #3344
 */
export const KnowledgeGateSchema = z.object({
  needsStudy: z.boolean(),
  /** LLM が正規化したトピック名（登録・検索に使う短い名詞句） */
  normalizedTopic: z.string(),
});

export type KnowledgeGateRaw = z.infer<typeof KnowledgeGateSchema>;
