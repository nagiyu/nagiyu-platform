import type { ILLMClient } from '../llm-client/types.js';
import type { KnowledgeEntity } from '../entities/knowledge.entity.js';
import { KnowledgeGateSchema } from '../llm-client/schemas/knowledge-gate.schema.js';
import { type KnowledgeMatcher, NgramKnowledgeMatcher } from './knowledge-matcher.js';

/** 知識ゲートのキーワード照合に使う最小スコア（トークン一致数） */
const KEYWORD_MATCH_MIN_TOKENS = 1;

/**
 * テキストをスペース・句読点・日本語分かち書き相当でトークン分割する。
 * 外部ライブラリ不要のシンプル実装。
 */
function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .split(/[\s、。，．\u3000！？!?「」『』【】・\-_,./]+/)
    .filter((t) => t.length >= 2);
  return new Set(tokens);
}

/**
 * ユーザー入力と Knowledge の Topic/Summary を照合してヒット件数を返す（純粋関数）。
 *
 * ヒット判定: userText のトークンが Topic または Summary の文字列に 1 件以上含まれる。
 */
export function searchKnowledge(userText: string, knowledge: KnowledgeEntity[]): KnowledgeEntity[] {
  if (knowledge.length === 0) return [];
  const userTokens = tokenize(userText);
  if (userTokens.size === 0) return [];

  return knowledge.filter((k) => {
    const target = `${k.Topic} ${k.Summary}`.toLowerCase();
    let matchCount = 0;
    for (const token of userTokens) {
      if (target.includes(token)) {
        matchCount++;
        if (matchCount >= KEYWORD_MATCH_MIN_TOKENS) return true;
      }
    }
    return false;
  });
}

/**
 * ユーザー入力が「勉強が必要なトピック」かを安価な LLM 分類で判定する。
 *
 * needsStudy=true の条件:
 * - 時事・ニュース・最新情報（キャラが知らない可能性が高い）
 * - ユーザー固有の話題（家族・職場・趣味の詳細など）
 * - ニッチな専門知識でキャラの嗜好範囲外
 *
 * needsStudy=false の条件:
 * - 一般常識（歴史・地理・科学の基礎など）
 * - キャラの嗜好・プロフィール範囲内（好きなもの・苦手なもの）
 * - 日常会話・感情表現・雑談
 */
export async function classifyTopic(
  userText: string,
  characterName: string,
  llmClient: ILLMClient
): Promise<{ needsStudy: boolean; normalizedTopic: string }> {
  const messages = [
    {
      role: 'system' as const,
      content: `あなたはAIコンパニオン「${characterName}」のトピック分類器です。
ユーザーの発言が「${characterName}が Web で調べて学ぶべき、未知の外部トピックか」を判定してください。

needsStudy=true は、次の【両方】を満たす場合だけにしてください:
1. 公開された外部情報として Web 検索で答えが見つかる（時事・最新ニュース・直近イベント・実在の作品/製品/サービス/人物・専門知識）
2. ${characterName}がまだ知らない可能性が高い

needsStudy=false にするケース（特に重要）:
- 【ユーザー自身に関すること】好み・経歴・予定・家族や友人・体験・気持ちなど。「私の〜」「俺の〜」「〜って覚えてる?」のような発言は、記憶で答えるべきで Web では調べられないため【必ず false】
- 一般常識（歴史・科学・地理の基本など）
- ${characterName}への質問（性格・好き嫌い）
- 挨拶・雑談・感情表現・相談・依頼

判断の指針: 「これは検索エンジンで答えが見つくか? それともユーザー本人にしか分からないことか?」を自問してください。ユーザー本人に関することは決して勉強対象にしてはいけません（検索しても答えは出ず、本来は記憶で応答すべきだからです）。

例:
- 「最近の○○のニュース教えて」→ true（時事・外部情報）
- 「俺の好きな飲み物って覚えてる?」→ false（ユーザー自身のこと・記憶の領分）
- 「日本の首都ってどこ?」→ false（一般常識）
- 「今日はちょっと疲れたな」→ false（雑談・感情）

normalizedTopic: 話題を表す短い名詞句（例: "モンハン新作"）。
needsStudy=false の場合でも適切な値を返してください。`,
    },
    {
      role: 'user' as const,
      content: userText,
    },
  ];

  return llmClient.chatStructured(messages, KnowledgeGateSchema, {
    purpose: 'classify',
  });
}

/** 知識ゲートの評価結果 */
export type KnowledgeGateResult =
  | { kind: 'knowledge_hit'; knowledge: KnowledgeEntity[] }
  | { kind: 'study'; normalizedTopic: string }
  | { kind: 'normal' };

/**
 * 知識ゲートの最終判定（コード側で gating）。
 *
 * フロー:
 *   1. 知識ベースをキーワード照合（既定は文字 N-gram） → ヒット → knowledge_hit
 *   2. LLM 分類（needsStudy=true → study / false → normal）
 *
 * matcher を差し替えることで将来 embedding / LLM ベースの照合に切り替えられる。
 */
export async function evaluateKnowledgeGate(
  userText: string,
  characterName: string,
  knowledge: KnowledgeEntity[],
  llmClient: ILLMClient,
  matcher: KnowledgeMatcher = new NgramKnowledgeMatcher()
): Promise<KnowledgeGateResult> {
  const hits = await matcher.findMatches(userText, knowledge);
  if (hits.length > 0) {
    return { kind: 'knowledge_hit', knowledge: hits };
  }

  const classification = await classifyTopic(userText, characterName, llmClient);
  if (classification.needsStudy) {
    return { kind: 'study', normalizedTopic: classification.normalizedTopic };
  }
  return { kind: 'normal' };
}
