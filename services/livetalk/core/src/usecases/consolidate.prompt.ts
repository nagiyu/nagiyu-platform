import type { ChatMessage } from '../llm-client/types.js';

/**
 * `consolidate` usecase に渡す候補 Topic 1 件分。
 * 埋め込み近傍で粗く絞った既存 Topic のヘッダ情報のみを渡す（座標・fact 本文は渡さない）。
 */
export interface ConsolidatePromptCandidateTopic {
  topicId: string;
  subject: string;
  category: string;
  canonicalSummary: string;
}

/**
 * `buildConsolidatePrompt` の入力。
 */
export interface ConsolidatePromptInput {
  /** キャラ名 */
  characterName: string;
  /** 埋め込み近傍で絞った既存 Topic 候補一覧 */
  candidateTopics: ConsolidatePromptCandidateTopic[];
  /** 未集約の新規会話メッセージ（時系列順） */
  newMessages: Array<{ role: 'user' | 'assistant'; text: string }>;
  /** 未集約の新規 Web 取得生データ（P1 では通常空） */
  webRaws: Array<{ query: string; rawText: string; sourceUrls: string[] }>;
}

/**
 * consolidation（集約バッチ）用プロンプトを組み立てる純粋関数。
 *
 * 新規会話・Web 取得生データを話題（Topic）ごとにまとめ、既存 Topic への
 * merge（名寄せ）か新規作成かを LLM に判断させるための system + user メッセージを返す。
 */
export function buildConsolidatePrompt(input: ConsolidatePromptInput): ChatMessage[] {
  const { characterName, candidateTopics, newMessages, webRaws } = input;

  const candidateSection =
    candidateTopics.length > 0
      ? candidateTopics
          .map(
            (t) =>
              `- topicId: ${t.topicId} / subject: ${t.subject} / category: ${t.category}\n  既存要約: ${t.canonicalSummary}`
          )
          .join('\n')
      : 'なし';

  const messagesSection =
    newMessages.length > 0
      ? newMessages
          .map((m) => `${m.role === 'user' ? 'ユーザー' : characterName}: ${m.text}`)
          .join('\n')
      : 'なし';

  const webRawSection =
    webRaws.length > 0
      ? webRaws
          .map(
            (w) =>
              `クエリ: ${w.query}\n取得内容: ${w.rawText}\n参照URL: ${w.sourceUrls.join(', ') || 'なし'}`
          )
          .join('\n\n')
      : 'なし';

  const systemPrompt = `あなたは ${characterName} の知識整理を担当するアシスタントです。
新しく得られた情報を話題（Topic）ごとにまとめ、既存の Topic に統合（merge）すべきか、
新しい Topic として作成すべきかを判断してください。

判断基準：
- 新情報が候補 Topic 一覧のいずれかと明確に同じ話題であれば、その Topic の topicId を
  targetTopicId に指定して merge（名寄せ）してください。
- 明確に一致する候補がない場合は、targetTopicId を空文字（""）にして新規 Topic として扱ってください。
- 1 回の入力に複数の話題が混在する場合は、topics 配列に複数件を返してください。
- ユーザー自身が述べた事実は selfFacts に、Web リサーチ・勉強内容由来の事実は webFacts に分けてください。
- selfFacts の provenance には、根拠となった発話の要旨を短く記録してください（誤マージが判明した際に
  出所から可逆化できるようにするため）。
- canonicalSummary には、候補 Topic に付随する既存要約（あれば）と新情報をマージし、重複を排除して
  抽象化した最新の要約を書いてください。新規 Topic の場合は新情報のみから要約を作成してください。
- 出力はすべて日本語で書いてください。`;

  const userPrompt = `候補 Topic 一覧（埋め込み近傍で絞り込み済み）：
${candidateSection}

新しい会話：
${messagesSection}

新しい Web 取得生データ：
${webRawSection}`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}
