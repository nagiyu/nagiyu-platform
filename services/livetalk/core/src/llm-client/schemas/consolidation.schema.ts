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
      /**
       * この Topic の webFacts が「ユーザー依頼で調べた Web 取得生データ」
       * （`[依頼]` と表示されたもの）に由来する場合、その依頼文（プロンプトに示された
       * 依頼文）を一字一句そのままコピーする。依頼由来でなければ空文字列（""）にする。
       * 憶測で依頼文を作らない（コード側が今回バッチの依頼と突合できない値は無視される）。
       */
      requestText: z
        .string()
        .describe(
          'この Topic の webFacts が「ユーザー依頼で調べた Web 取得生データ」（[依頼] と表示されたもの）に由来する場合、その依頼文（プロンプトに示された依頼文）を一字一句そのままコピーする。依頼由来でなければ空文字列。憶測で依頼文を作らない。'
        ),
      /**
       * ユーザー自身についての新規事実。
       * 「ユーザー:」発話由来のユーザー自身についての事実のみを含める。
       * キャラの発話（意見・見解・推し・提案含む）・一般知識・第三者の意見は含めない。
       */
      selfFacts: z
        .array(
          z.object({
            text: z
              .string()
              .describe(
                '「ユーザー:」発話に由来する、ユーザー自身についての事実のみを記述する。キャラの発話・意見・見解・推し・提案、一般知識・世間知識、第三者の意見は書かない。'
              ),
            /** 出所メモ（誤マージ可逆化用）。根拠となった発話の要旨を短く記す */
            provenance: z.string(),
          })
        )
        .describe(
          'ユーザー自身についての新規事実の配列。「ユーザー:」発話由来のものだけを含め、キャラの発話・一般知識・第三者の意見は含めない。'
        ),
      /**
       * Web リサーチ・勉強バッチ由来の新規外部事実。
       * 「新しい Web 取得生データ」からのみ生成する（会話中の発話からは生成しない）。
       */
      webFacts: z
        .array(
          z.object({
            text: z.string(),
            sourceUrls: z.array(z.string()),
            volatility: z.enum(['stable', 'low', 'medium', 'high']),
          })
        )
        .describe(
          'Web 取得生データ由来の外部事実のみの配列。会話中にキャラが述べた一般知識は含めない。Web 取得生データがなければ空配列にする。'
        ),
    })
  ),
});

export type ConsolidationRaw = z.infer<typeof ConsolidationSchema>;
