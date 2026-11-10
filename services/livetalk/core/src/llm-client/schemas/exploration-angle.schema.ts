import { z } from 'zod';

/**
 * 自発リサーチの探索の角度 (Web 検索のクエリ) を 1 つ選ばせる Structured Outputs スキーマ。
 *
 * OpenAI Structured Outputs の制約上、全フィールドを required にする。
 */
export const ExplorationAngleSchema = z.object({
  /** Web 検索にそのまま渡す短いクエリ */
  query: z.string(),
});

export type ExplorationAngleRaw = z.infer<typeof ExplorationAngleSchema>;
