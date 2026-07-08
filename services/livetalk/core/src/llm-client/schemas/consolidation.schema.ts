import { z } from 'zod';

/**
 * consolidation（集約バッチ）向け Structured Outputs スキーマ
 * （リブトーク知識再設計 P1 / #3697）。
 *
 * 未集約の新規会話・Web 取得生データを話題（Topic）ごとにまとめ、
 * 既存 Topic への merge（名寄せ）か新規作成かを LLM に判断させる。
 *
 * OpenAI Structured Outputs の制約上、全フィールドを required にする（optional 不可）。
 * 空は `""` / `[]` で表現する。
 */
export const ConsolidationSchema = z.object({
  topics: z.array(
    z.object({
      /** 既存 Topic に merge する場合はその topicId、新規なら空文字（""） */
      targetTopicId: z.string(),
      /** Topic の主題（短い名詞句） */
      subject: z.string(),
      /** カテゴリ */
      category: z.string(),
      /** 既存要約（候補 Topic のもの）＋新情報をマージ・再生成した正規化要約 */
      canonicalSummary: z.string(),
      /** ユーザー自身についての新規事実 */
      selfFacts: z.array(
        z.object({
          text: z.string(),
          /** 出所メモ（誤マージ可逆化用）。根拠となった発話の要旨を短く記す */
          provenance: z.string(),
        })
      ),
      /** Web リサーチ・勉強バッチ由来の新規外部事実 */
      webFacts: z.array(
        z.object({
          text: z.string(),
          sourceUrls: z.array(z.string()),
          volatility: z.enum(['stable', 'low', 'medium', 'high']),
        })
      ),
    })
  ),
});

export type ConsolidationRaw = z.infer<typeof ConsolidationSchema>;
