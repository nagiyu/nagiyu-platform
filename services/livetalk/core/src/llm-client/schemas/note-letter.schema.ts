import { z } from 'zod';

/**
 * ノート生成（リブトーク知識・記憶再設計 P4「ノート（ギフト化）」）向け
 * Structured Outputs スキーマ。
 *
 * Topic の SELF フック（なぜ調べたか）＋ WEB 中身を、ユーザーへ贈る「手紙」として
 * 1 通に合成させる。捏造禁止・センシティブ SELF 回避の判断はプロンプト側のルールとして
 * LLM に委ねる（`generate-note.prompt.ts` 参照）。
 *
 * OpenAI Structured Outputs の制約上、全フィールドを required にする（optional 不可）。
 */
export const NoteLetterSchema = z.object({
  /**
   * ノート化に値しない（WEB の中身が薄い・贈る意味が薄い等）と判断した場合は true。
   * true の場合、呼び出し側は headline を使わずノート生成をスキップする。
   */
  skip: z.boolean(),
  /**
   * 実在かつ健全な SELF fact を根拠に強いフック（「〜だったよね、だから調べたよ」）を
   * 使ったかどうか。根拠が弱い・センシティブ・存在しない場合は false（自発トーン）。
   */
  usedSelfHook: z.boolean(),
  /** 合成した手紙文面（2〜4 文・温かい口調・箇条書きにしない） */
  headline: z.string(),
});

export type NoteLetterRaw = z.infer<typeof NoteLetterSchema>;
