import type { SelfFactKey } from '../entities/self-fact.entity.js';
import type { ILLMClient } from '../llm-client/types.js';
import type { TopicRepository } from '../repositories/topic.repository.interface.js';
import { OptimisticLockError } from '../repositories/optimistic-lock.error.js';
import { RegenerateSummarySchema } from '../llm-client/schemas/regenerate-summary.schema.js';
import { buildRegenerateSummaryPrompt } from './regenerate-summary.prompt.js';

export interface ForgetSelfFactDeps {
  topicRepository: TopicRepository;
  llmClient: ILLMClient;
  /** OptimisticLockError 時の最大試行回数（初回含む）。既定 3。 */
  maxRetries?: number;
}

/**
 * SELF fact の決定的忘却（リブトーク知識再設計 P2 / #3698、design §4.3）。
 *
 * フロー:
 *   1. `deleteSelfFact` で対象 SELF fact を決定的に削除する（まず消す）。
 *   2. 残った SELF/WEB fact と Topic.Subject から canonicalSummary を LLM で再生成し、
 *      `putTopic`（`expectedUpdatedAt` 楽観ロック）で Topic META を更新する。
 *      Embedding/Care/Category/Subject は読み取った Topic の値を維持する
 *      （Embedding 更新は consolidation のみが行う）。
 *   3. 書き込み競合（`OptimisticLockError`）時は Topic を再取得（re-read）して
 *      再生成からやり直す。最大 `maxRetries` 回試行し、尽きたら最後のエラーを throw する
 *      （呼び出し元 route で 500 として扱う）。
 *
 * 途中で Topic 自体が消えている（`bundle.topic === null`）場合は、Topic ごと
 * 削除済みとみなして何も再生成せず終了する。
 *
 * 残 fact（SELF + WEB）が 0 件の場合、空入力で LLM が不定な出力を返すのを避けるため
 * LLM を呼ばず canonicalSummary を空文字にして putTopic する（コスト削減）。
 */
export async function forgetSelfFact(key: SelfFactKey, deps: ForgetSelfFactDeps): Promise<void> {
  const { topicRepository, llmClient, maxRetries = 3 } = deps;

  // 1. 決定的削除（まず消す）
  await topicRepository.deleteSelfFact(key);

  const topicKey = { userId: key.userId, characterId: key.characterId, topicId: key.topicId };

  let lastError: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // 2a. re-read（初回・リトライ時とも同じ経路で読み直す）
      const bundle = await topicRepository.getTopicBundle(topicKey);
      const { topic } = bundle;

      // Topic ごと消えている場合は何も再生成しない
      if (topic === null) return;

      let canonicalSummary: string;
      if (bundle.selfFacts.length === 0 && bundle.webFacts.length === 0) {
        // 残 fact が 0 件: 空入力で LLM を呼ばず、空要約にする
        canonicalSummary = '';
      } else {
        const prompt = buildRegenerateSummaryPrompt({
          subject: topic.Subject,
          selfFacts: bundle.selfFacts.map((f) => f.Text),
          webFacts: bundle.webFacts.map((f) => f.Text),
        });
        const result = await llmClient.chatStructured(prompt, RegenerateSummarySchema, {
          purpose: 'summarize',
        });
        canonicalSummary = result.canonicalSummary;
      }

      // 2b. Embedding/Care/Category/Subject は既存 Topic の値を維持する
      await topicRepository.putTopic(
        {
          UserID: topic.UserID,
          CharacterID: topic.CharacterID,
          TopicID: topic.TopicID,
          Subject: topic.Subject,
          CanonicalSummary: canonicalSummary,
          Category: topic.Category,
          Care: topic.Care,
          Embedding: topic.Embedding,
        },
        { expectedUpdatedAt: topic.UpdatedAt }
      );
      return;
    } catch (err) {
      if (err instanceof OptimisticLockError) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}
