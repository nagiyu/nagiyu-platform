import type { CharacterDefinition } from '../characters/types.js';
import { formatJstFullDateWithWeekday } from '../lib/format-date.js';

/**
 * Web リサーチ用プロンプトを組み立てる純粋関数。
 *
 * 要約にイベントの開催日・期間・発売日を年付きで書かせるため、今日の日付を渡す。
 * 日付が無いと、終わったイベントを「これから」と要約してしまう。
 *
 * @param query - リサーチクエリ文字列
 * @param character - キャラクター定義（口調・好みを反映するため）
 * @param today - 今日の日付 (日本時間の暦で表記する)
 * @returns LLM に渡すプロンプト文字列
 */
export function buildResearchPrompt(
  query: string,
  character: CharacterDefinition,
  today: Date
): string {
  const likes = character.personality.preferences.likes.join('、');
  return [
    `あなたは「${character.displayName}」です。`,
    `口調・性格：${character.personality.speechStyle}`,
    `好きなもの：${likes}`,
    `今日の日付: ${formatJstFullDateWithWeekday(today.getTime())}`,
    '',
    `「${query}」について必ず Web 検索し、${character.displayName} らしい視点で内容を要約してください。`,
    '',
    '返す項目（JSON）:',
    '- topic: 検索したトピックの短い名詞句（5〜15 文字程度、例: 飲み物の新作、超かぐや姫）。説明文ではなく固有名詞や短い語句にすること',
    '- summary: キャラクター目線の要約（200 文字以上）。topic の詳細説明はここに書く。イベント・発売・放送・キャンペーンなど日時のある話題は、開催日・期間・発売日を年付きで（例: 2026年8月29日〜9月7日）必ず書く。今日の日付と比べて、終わっているものは終わっていることも書く。日付が分からないときは分からないと書き、推測で日付を作らない',
    '- sourceUrls: 参照した URL のリスト（空の場合は空配列）',
    `- rawComment: ${character.displayName} として一言コメント（50〜100 文字、上記の口調で）`,
  ].join('\n');
}
