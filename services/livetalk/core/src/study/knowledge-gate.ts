import type { ILLMClient } from '../llm-client/types.js';
import { KnowledgeGateSchema } from '../llm-client/schemas/knowledge-gate.schema.js';

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
