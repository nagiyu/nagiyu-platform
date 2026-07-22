import type { ChatMessage } from '../llm-client/types.js';

/**
 * `buildRegenerateSummaryPrompt` の入力。
 */
export interface RegenerateSummaryPromptInput {
  /** キャラ名（未指定でも動作する） */
  characterName?: string;
  /** Topic の主題 */
  subject: string;
  /** 残存する SELF fact 本文一覧 */
  selfFacts: string[];
  /** 残存する WEB fact 本文一覧 */
  webFacts: string[];
}

/**
 * 忘却（forgetSelfFact）向けの要約再生成プロンプトを組み立てる純粋関数
 * （リブトーク知識再設計 P2 / #3698）。
 *
 * SELF fact 削除後に残った SELF/WEB fact のみを根拠に canonicalSummary を
 * 再生成させる。削除済みの内容を LLM が勝手に復元しないよう明示的に禁止する。
 */
export function buildRegenerateSummaryPrompt(input: RegenerateSummaryPromptInput): ChatMessage[] {
  const { characterName, subject, selfFacts, webFacts } = input;

  const selfFactsSection =
    selfFacts.length > 0 ? selfFacts.map((f) => `- ${f}`).join('\n') : 'なし';
  const webFactsSection = webFacts.length > 0 ? webFacts.map((f) => `- ${f}`).join('\n') : 'なし';

  const characterLabel = characterName ? `${characterName}が` : '';

  const systemPrompt = `話題「${subject}」について、以下の SELF（ユーザー由来の事実）/ WEB（調べた事実）から
重複を排し抽象化した最新の canonicalSummary を${characterLabel}日本語で作ってください。

重要な制約:
- 削除済みの内容は決して復元しないでください。渡された事実のみを根拠にしてください。
- 一部の事実が忘却された結果、話題の内容が薄くなっていても構いません。無理に補完しないでください。`;

  const userPrompt = `話題: ${subject}

SELF fact（ユーザー自身についての事実）:
${selfFactsSection}

WEB fact（調べた事実）:
${webFactsSection}`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}
