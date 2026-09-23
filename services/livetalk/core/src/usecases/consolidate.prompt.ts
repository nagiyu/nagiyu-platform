import type { ChatMessage } from '../llm-client/types.js';
import type { WebRawOrigin } from '../entities/webraw.entity.js';

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
  webRaws: Array<{
    query: string;
    rawText: string;
    sourceUrls: string[];
    /** 由来区分（甲-1: 依頼由来 provenance）。request のみ依頼文・依頼日を LLM に提示する */
    origin: WebRawOrigin;
    /** 依頼文（origin === 'request' のときのみ。LLM への表示用で、返させはしない） */
    requestText?: string;
    /** 依頼日ラベル（"M月D日" 表記。origin === 'request' のときのみ） */
    requestedAtLabel?: string;
    /**
     * この webRaw が今回バッチの「採用可能な依頼 WebRaw」の何番目かを示す index
     * （index 参照方式。甲-1: 依頼由来 provenance）。request-origin かつ
     * 依頼文・依頼日時が揃った WebRaw のみ設定され、それ以外は undefined。
     * LLM には `[依頼 #N]` として提示し、sourceRequestIndices にこの番号を返させる。
     */
    requestIndex?: number;
  }>;
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
          .map((w) => {
            const requestPrefix =
              w.requestIndex !== undefined
                ? `[依頼 #${w.requestIndex}] 依頼文: "${w.requestText ?? ''}"（依頼日: ${w.requestedAtLabel ?? '不明'}）\n`
                : '';
            return `${requestPrefix}クエリ: ${w.query}\n取得内容: ${w.rawText}\n参照URL: ${w.sourceUrls.join(', ') || 'なし'}`;
          })
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
- 「新しい会話」の発話には話者ラベル（「ユーザー:」「${characterName}:」）が付いています。
  selfFacts に入れてよいのは「ユーザー:」とラベル付けされた発話に由来する、ユーザー自身についての
  事実のみです。「${characterName}:」（キャラ自身）の発話は、意見・見解・推し・提案・一般知識を
  含め、selfFacts に絶対に入れないでください。
- 一般知識・世間知識（料理のコツや目安などの一般論を含む）、第三者の意見も selfFacts に入れないで
  ください。
- webFacts は「新しい Web 取得生データ」からのみ生成してください。会話中に ${characterName} が
  述べた一般知識を webFacts に入れてはいけません。Web 取得生データが「なし」の場合、webFacts は
  必ず空配列にしてください。
- 例：ユーザーが「最近せいろ蒸しにハマっている」と話した場合はユーザー自身の事実なので selfFacts に
  入れます。一方で ${characterName} が「野菜は蒸すと甘みが増す」「仕上げは塩とオリーブオイルがおすすめ」
  のように発言した場合、それはキャラの見解・一般知識であり selfFacts にも webFacts にも入れず、
  どこにも保存しないでください。
- selfFacts の provenance には、根拠となった発話の要旨を短く記録してください（誤マージが判明した際に
  出所から可逆化できるようにするため）。
- canonicalSummary には、候補 Topic に付随する既存要約（あれば）と新情報をマージし、重複を排除して
  抽象化した最新の要約を書いてください。新規 Topic の場合は新情報のみから要約を作成してください。
- 「新しい Web 取得生データ」のうち先頭に「[依頼 #N]」と付いたものは、ユーザーが依頼して調べさせた
  内容です。その「[依頼 #N]」付きデータから webFacts を作った Topic は、使った番号 N をすべて
  sourceRequestIndices に入れてください。依頼由来でない Topic の sourceRequestIndices は
  空配列（[]）にしてください。番号以外（依頼文そのものの文字列など）は返さないでください。
  憶測で番号を作らないでください。
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
