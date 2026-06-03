/**
 * セーフティ介入時のキャラ口調応答テンプレート（Phase 2d / Issue #3250）。
 *
 * 桃瀬ひよりの口調で心配を伝え、専門機関への相談を自然に促す。
 * 無機質なホットライン番号の貼り付けにならないよう、感情表現を含める。
 *
 * @see Issue #3250 実装上の注意点
 * @see docs/services/livetalk/external-design.md SCR-008
 */

import type { CharacterDefinition } from '../characters/types.js';
import type { SafetyCategory } from './types.js';

/**
 * カテゴリ別の応答テンプレート文。
 * キャラ定義は将来の複数キャラ対応のために引数で受け取るが、
 * MVP では桃瀬ひより（一人称「私」）前提で書いてある。
 */
const CATEGORY_MESSAGES: Record<SafetyCategory, string[]> = {
  suicidal_ideation: [
    'ねえ、今すごく心配しちゃった…。一人で抱え込まないでほしいの。つらいとき、話を聞いてくれる人がいるから、連絡してみてくれない？',
    '今、私すごく心配してる。その気持ち、一人で背負わないで。専門の人に話してみてほしいな…私からのお願いなんだけど。',
  ],
  self_harm: [
    'ちょっと待って…今の言葉、すごく気になった。自分を傷つけないでほしいの。つらいなら、話を聞いてくれる人に連絡してみてね。',
    'ねえ、今すごく心配してるよ。自分のこと、大切にしてほしい。相談できる場所があるから、勇気を出してみてくれたら嬉しいな。',
  ],
  hopelessness: [
    'その気持ち、ちゃんと受け取ったよ。一人で抱えてきたんだね…。専門の人と話してみてほしい。あなたのこと、ちゃんとわかってくれる人がいるから。',
    '私に話してくれてありがとう。そんなに辛かったんだね…。専門家に相談してみてくれない？話を聞くことを仕事にしてる人たちがいるから。',
  ],
  crisis_method: [
    'ちょっと待って、すごく心配してる。今すぐ、話を聞いてくれる人に連絡してみてほしいの。一人でいないで。',
    '今の言葉、すごく気になった…。一人で抱え込まないで、今すぐ相談できる場所に連絡してみてね。',
  ],
  crisis_state: [
    'つらいね…ずっと頑張ってきたんだよね。一人で抱えないで、専門の人に話してみてほしいな。',
    'その気持ち、ちゃんと聞こえてるよ。一人でいるより、話を聞いてくれる人と繋がってみてほしいな。',
  ],
};

/** フォールバックメッセージ（カテゴリ不明時） */
const FALLBACK_MESSAGES = [
  'ねえ、今すごく心配しちゃった…。一人で抱え込まないでほしいの。話を聞いてくれる人に連絡してみてくれない？',
];

/**
 * Moderation API がフラグを立てた場合の応答置換テンプレート。
 * AI の応答をユーザーに見せることが不適切と判断された場合に使用する。
 */
export const MODERATION_REPLACEMENT_MESSAGES = [
  'ごめんね、さっきの言葉、うまく言えなかった気がして…もう一度ちゃんと話してくれると嬉しいな。',
  'ちょっとうまく言えなかったみたい…ごめんね。もし辛いことがあったら、専門の人に相談してみてほしいな。',
];

/**
 * カテゴリに対応したキャラ口調の介入メッセージを返す。
 * 複数テンプレートがある場合は現在時刻のミリ秒でランダム選択する（テスト時は 0 番目）。
 */
export function buildSafetyMessage(
  category: SafetyCategory,
  _character: CharacterDefinition,
  nowMs?: number
): string {
  const messages = CATEGORY_MESSAGES[category] ?? FALLBACK_MESSAGES;
  const idx = nowMs !== undefined ? nowMs % messages.length : 0;
  return messages[idx];
}

/**
 * Moderation フラグ時の応答置換メッセージを返す。
 */
export function buildModerationReplacementMessage(nowMs?: number): string {
  const idx = nowMs !== undefined ? nowMs % MODERATION_REPLACEMENT_MESSAGES.length : 0;
  return MODERATION_REPLACEMENT_MESSAGES[idx];
}
