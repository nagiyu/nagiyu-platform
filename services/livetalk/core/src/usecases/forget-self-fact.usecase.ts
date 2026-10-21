import { EntityNotFoundError, OptimisticLockError } from '@nagiyu/aws';
import type { SelfFactKey } from '../entities/self-fact.entity.js';
import type { ILLMClient } from '../llm-client/types.js';
import type { TopicRepository } from '../repositories/topic.repository.interface.js';
import { RegenerateSummarySchema } from '../llm-client/schemas/regenerate-summary.schema.js';
import { buildRegenerateSummaryPrompt } from './regenerate-summary.prompt.js';

const SELF_FACT_ENTITY_TYPE = 'SelfFact';

export interface ForgetSelfFactDeps {
  topicRepository: TopicRepository;
  llmClient: ILLMClient;
  /** OptimisticLockError 時の最大試行回数（初回含む）。既定 3。 */
  maxRetries?: number;
}

/**
 * SELF fact の決定的忘却。
 *
 * フロー:
 *   1. `deleteSelfFact` で対象 SELF fact を決定的に削除する（まず消す）。
 *      対象が既にない場合も止めずに 2 へ進む。前回の呼び出しで消したあと要約の再生成に
 *      失敗し、同じ SELF fact で押し直されたときに、要約を作り直せるようにするため。
 *   2. 残った SELF/WEB fact と Topic.subject から canonicalSummary を LLM で再生成し、
 *      `putTopic`（`expectedUpdatedAt` 楽観ロック）で Topic META を更新する。
 *      Embedding/Care/Category/Subject は読み取った Topic の値を維持する
 *      （Embedding 更新は consolidation のみが行う）。
 *   3. 書き込み競合（`OptimisticLockError`）時、または書き込み時に Topic が消えていた
 *      （`EntityNotFoundError`）ときは、Topic を再取得（re-read）して再生成からやり直す。
 *      最大 `maxRetries` 回試行し、尽きたら最後のエラーを throw する
 *      （呼び出し元 route で 500 として扱う）。
 *
 * Topic が見つからない（`bundle.topic === null`）場合は、何も再生成しない。
 * SELF fact を消せていれば成功で終える。SELF fact もなかった場合は、指している先が
 * 何もないため `EntityNotFoundError` を投げる（呼び出し元 route で 404 として扱う）。
 *
 * 残 fact（SELF + WEB）が 0 件の場合、空入力で LLM が不定な出力を返すのを避けるため
 * LLM を呼ばず canonicalSummary を空文字にして putTopic する（コスト削減）。
 */
export async function forgetSelfFact(key: SelfFactKey, deps: ForgetSelfFactDeps): Promise<void> {
  const { topicRepository, llmClient, maxRetries = 3 } = deps;

  // 1. 決定的削除（まず消す）
  let selfFactDeleted = true;
  try {
    await topicRepository.deleteSelfFact(key);
  } catch (err) {
    if (!(err instanceof EntityNotFoundError)) throw err;
    selfFactDeleted = false;
  }

  const topicKey = { userId: key.userId, characterId: key.characterId, topicId: key.topicId };

  let lastError: unknown;
  // ループ内の catch は EntityNotFoundError を再試行に回すため、Topic の不在はループの外で扱う
  let topicMissing = false;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // 2a. re-read（初回・リトライ時とも同じ経路で読み直す）
      const bundle = await topicRepository.getTopicBundle(topicKey);
      const { topic } = bundle;

      if (topic === null) {
        topicMissing = true;
        break;
      }

      let canonicalSummary: string;
      if (bundle.selfFacts.length === 0 && bundle.webFacts.length === 0) {
        // 残 fact が 0 件: 空入力で LLM を呼ばず、空要約にする
        canonicalSummary = '';
      } else {
        const prompt = buildRegenerateSummaryPrompt({
          subject: topic.subject,
          selfFacts: bundle.selfFacts.map((f) => f.text),
          webFacts: bundle.webFacts.map((f) => f.text),
        });
        const result = await llmClient.chatStructured(prompt, RegenerateSummarySchema, {
          purpose: 'summarize',
        });
        canonicalSummary = result.canonicalSummary;
      }

      // 2b. embedding/care/category/subject は既存 Topic の値を維持する
      await topicRepository.putTopic(
        {
          userId: topic.userId,
          characterId: topic.characterId,
          topicId: topic.topicId,
          subject: topic.subject,
          canonicalSummary,
          category: topic.category,
          care: topic.care,
          embedding: topic.embedding,
        },
        { expectedUpdatedAt: topic.updatedAt }
      );
      return;
    } catch (err) {
      // 書き込み前に Topic が消えた場合も、再読込で Topic なしと判定して成功終了させるため
      // 競合と同じ経路でやり直す
      if (err instanceof OptimisticLockError || err instanceof EntityNotFoundError) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  if (topicMissing) {
    if (selfFactDeleted) return;
    throw new EntityNotFoundError(
      SELF_FACT_ENTITY_TYPE,
      `${key.userId}#${key.characterId}#${key.topicId}#${key.factId}`
    );
  }

  throw lastError;
}
