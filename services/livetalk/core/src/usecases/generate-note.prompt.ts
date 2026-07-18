import type { ChatMessage } from '../llm-client/types.js';

/**
 * `buildGenerateNotePrompt` に渡す SELF fact 1 件分。
 */
export interface GenerateNotePromptSelfFact {
  text: string;
  provenance: string;
}

/**
 * `buildGenerateNotePrompt` に渡す WEB fact 1 件分。
 */
export interface GenerateNotePromptWebFact {
  text: string;
  sourceUrls: string[];
}

/**
 * `buildGenerateNotePrompt` の入力。
 */
export interface GenerateNotePromptInput {
  /** キャラ名 */
  characterName: string;
  /** ノート化する Topic の主題（短い名詞句） */
  subject: string;
  /** Topic の正規化要約 */
  canonicalSummary: string;
  /** Topic に紐づく SELF fact 一覧（フックの根拠候補） */
  selfFacts: GenerateNotePromptSelfFact[];
  /** Topic に紐づく WEB fact 一覧（手紙の中身の主役） */
  webFacts: GenerateNotePromptWebFact[];
}

/**
 * ノート生成（リブトーク知識・記憶再設計 P4「ノート（ギフト化）」）用プロンプトを組み立てる純粋関数。
 *
 * SELF フック（なぜ調べたか）＋ WEB 中身を、ユーザーへ贈る「手紙」として 1 通に合成させる。
 * 捏造禁止・センシティブ SELF 回避のルールをここで明示し、判断自体は LLM に委ねる
 * （プロンプト前の安価ゲート＝care 閾値・1 Topic 1 ノート・WEB 0 件スキップは usecase 側で行う）。
 */
export function buildGenerateNotePrompt(input: GenerateNotePromptInput): ChatMessage[] {
  const { characterName, subject, canonicalSummary, selfFacts, webFacts } = input;

  const selfSection =
    selfFacts.length > 0
      ? selfFacts.map((f) => `- ${f.text}（出所: ${f.provenance || 'なし'}）`).join('\n')
      : 'なし';

  const webSection =
    webFacts.length > 0
      ? webFacts.map((f) => `- ${f.text}（出典: ${f.sourceUrls.join(', ') || 'なし'}）`).join('\n')
      : 'なし';

  const systemPrompt = `あなたは ${characterName} です。ユーザーのために調べた内容を「手紙」として贈ります。

このノートが扱う話題（Topic）：${subject}
話題の要約：${canonicalSummary}

【厳守ルール】
- 捏造禁止：SELF fact に実在する根拠がある時のみ、その事実を根拠にした強いフック
  （「〜だったよね、だから調べたよ」）を使ってください。根拠が弱い・存在しない場合は
  ありもしない事実や思い出を作らず、自発トーン（「気になって調べてみたの」など）に
  逃がしてください（この場合 usedSelfHook は false にしてください）。
- センシティブな SELF（健康・お金・人間関係・悩み・ネガティブ感情・秘密など）は
  フックに使わないでください。監視されているような印象を与えないためです。
  健全に使える SELF が無ければ自発トーンにしてください。
- WEB の内容を主役に、温かい手紙口調で 2〜4 文にまとめてください。事実の羅列や
  箇条書きにはしないでください。
- 贈る意味が薄い（WEB の内容が乏しい・浅い等）場合は skip を true にしてください。
- 出力はすべて日本語で書いてください。`;

  const userPrompt = `ユーザーについての事実（SELF）：
${selfSection}

Web で調べた内容（WEB）：
${webSection}`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}
