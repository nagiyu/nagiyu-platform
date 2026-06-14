import type { SummarizeInput } from '../types.js';

/**
 * 会話圧縮要約用プロンプトを組み立てる純粋関数。
 *
 * `openai-client.ts` の `summarize()` から抽出したもので、プロンプト文言は完全に現状維持。
 * テスト・再利用のために独立ファイルへ切り出している。
 *
 * @param input - 要約に必要な入力データ（SummarizeInput）
 * @returns LLM に渡すプロンプト文字列
 */
export function buildSummarizePrompt(input: SummarizeInput): string {
  const { existingSummary, newMessages, characterName, existingInterestCategories } = input;

  const existingSection = existingSummary ? `既存の要約：\n${existingSummary}` : '既存の要約：なし';

  const messagesSection = newMessages
    .map((m) => `${m.role === 'user' ? 'ユーザー' : characterName}: ${m.text}`)
    .join('\n');

  const existingCategoriesSection =
    existingInterestCategories && existingInterestCategories.length > 0
      ? `既存の興味カテゴリ一覧（同義のものはこの表記を再利用すること）：\n${existingInterestCategories
          .map((c) => `- ${c}`)
          .join('\n')}`
      : '既存の興味カテゴリ一覧：なし';

  return `以下は ${characterName} とユーザーとの会話です。

${existingSection}

新しい会話：
${messagesSection}

${existingCategoriesSection}

要約に含めないもの（汚染防止）：
- キャラの口調・文体・口癖（例：「むにゃ」「うとうと」「〜だよね〜」等の語尾・修辞）
- キャラ自身の状態（眠い、寝ぼけている、ご機嫌、等）
- 寝ぼけ演出・時間帯演出に由来する一時的な表現

要約に含めるもの：
- ユーザーの嗜好・興味・話題
- ユーザーとキャラの関係性の変化（親密度、過去のやりとりの文脈）
- 会話で確定した事実・約束・予定

interestCategories の抽出ルール：
- 中粒度（趣味・嗜好レベル）で抽出する。良い例：「映画」「コーヒー」「ゲーム」「音楽」「読書」「猫」
- 包含関係のあるカテゴリは親に集約する。悪い例：「映画スナック」（→「映画」へ）、「コーヒー・紅茶・カモミール」（→「飲み物」へ）、「オトモアイルー」（→「ゲーム」へ）
- 既存カテゴリ一覧に同義カテゴリがあれば、必ず既存の表記をそのまま再利用する（例：既存に「コーヒー」があるのに新規で「コーヒー・飲み物」を作らない）
- 1 会話あたり 5 件程度を目安に、ユーザーが明確に関心を示したものだけを抽出する

mergedSummary（既存と新規をマージした最新要約、日本語）、
newMemoryCandidates（新規記憶候補の配列、category と content を含む）、
interestCategories（上記ルールに従って抽出したカテゴリ配列、category と weight を含む。weight は会話内の言及回数。なければ空配列）、
bidirectionalityScore（ユーザーが ${characterName} の発話に反応・質問返しをした割合 0.0〜1.0。
  キャラ発信の話題にユーザーが乗った場合は高く 0.7〜1.0、ユーザーが一方的に話し続けた場合は低く 0.0〜0.3）
を返してください。`;
}
