import { logger, toErrorMessage } from '@nagiyu/common';
import { FRESHNESS_CHECK_REQUEST_TTL_SECONDS } from '../constants.js';
import type { WebFactEntity } from '../entities/web-fact.entity.js';
import type { FreshnessCheckRequestRepository } from '../repositories/freshness-check-request.repository.interface.js';

/**
 * 確認が要る WEB fact か。揮発する fact (stable 以外) で、再検証予定時刻 (nextReview) を過ぎたものが該当する。
 * stable は nextReview を持たず、再確認の対象にならない。
 */
export function isStaleWebFact(fact: WebFactEntity, nowMs: number): boolean {
  return fact.volatility !== 'stable' && fact.nextReview !== undefined && fact.nextReview <= nowMs;
}

/** Topic の WEB fact に、確認が要るものが 1 件でもあるか */
export function hasStaleWebFact(webFacts: readonly WebFactEntity[], nowMs: number): boolean {
  return webFacts.some((fact) => isStaleWebFact(fact, nowMs));
}

export interface RequestFreshnessChecksParams {
  repository: FreshnessCheckRequestRepository;
  userId: string;
  characterId: string;
  /** 使われた Topic と、その時点で読めている WEB fact */
  topics: ReadonlyArray<{ topicId: string; webFacts: readonly WebFactEntity[] }>;
  nowMs: number;
}

/**
 * 使われた Topic のうち、確認が要る WEB fact を持つものの確認を依頼する。
 *
 * 呼び出し元の応答を止めないため、記録の失敗は握って続行する (依頼は次に使われたときに再び記録される)。
 *
 * @returns 依頼を記録した Topic の件数 (既に依頼があった Topic も含む)
 */
export async function requestFreshnessChecks(
  params: RequestFreshnessChecksParams
): Promise<number> {
  const { repository, userId, characterId, topics, nowMs } = params;
  const expiresAt = nowMs + FRESHNESS_CHECK_REQUEST_TTL_SECONDS * 1000;

  const results = await Promise.all(
    topics
      .filter((topic) => hasStaleWebFact(topic.webFacts, nowMs))
      .map(async ({ topicId }) => {
        try {
          await repository.put({ userId, characterId, topicId, expiresAt });
          return true;
        } catch (err) {
          logger.warn('[freshness-check] 鮮度確認の依頼の記録に失敗しました（スキップして継続）', {
            userId,
            characterId,
            topicId,
            err: toErrorMessage(err),
          });
          return false;
        }
      })
  );

  return results.filter(Boolean).length;
}
