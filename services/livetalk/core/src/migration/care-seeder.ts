/**
 * care 引き継ぎ（care seed）ユーティリティ（一回性マイグレーション専用の throwaway コード）。
 *
 * InterestCategory.Weight と Memory.ReferencedCount をそれぞれ独立に正規化し、
 * embedding 近傍（cosine 最寄りの Topic 1 件、閾値未満は drop）のみで対応 Topic に
 * 割り当てて care を加算する。新 Topic の Subject は LLM により言い換えられており
 * Category 文字列一致は機能しないため、フォールバックは持たない。
 * InterestCategory.Embedding / Memory.Embedding はここでのみ再利用し、新モデルには
 * 保存しない。
 */
import { logger } from '@nagiyu/common';
import {
  MIGRATION_CARE_ASSIGN_SIMILARITY_THRESHOLD,
  MIGRATION_CARE_SEED_MAX_PER_TOPIC,
} from '../constants.js';
import { cosineSimilarity } from '../memory/embedding.js';
import type { TopicEntity } from '../entities/topic.entity.js';
import { OptimisticLockError } from '../repositories/optimistic-lock.error.js';
import type { TopicRepository } from '../repositories/topic.repository.interface.js';
import type { LegacyInterestCategoryEntity, LegacyMemoryEntity } from './legacy-types.js';

interface CareSignal {
  category: string;
  weight: number;
  embedding: number[];
}

/**
 * シグナル集合内で weight を [0,1] に正規化する（最大値で割る）。
 * 最大値が 0 以下の集合はスキップ（空配列を返す）。
 */
function normalizeSignals(signals: CareSignal[]): CareSignal[] {
  const max = signals.reduce((acc, s) => Math.max(acc, s.weight), 0);
  if (max <= 0) return [];
  return signals.map((s) => ({ ...s, weight: s.weight / max }));
}

/**
 * シグナルを cosine similarity 最大（embedding 最寄り）の Topic に割り当てる。
 * シグナルの embedding が空、または最大 cosine が閾値未満（＝対応する Topic が
 * 無いとみなす）の場合は undefined（drop）を返す。Category 文字列一致による
 * フォールバックは持たない（新 Topic の Subject は言い換えられており機能しないため）。
 */
function assignSignalToTopic(signal: CareSignal, topics: TopicEntity[]): string | undefined {
  if (signal.embedding.length === 0) return undefined;

  let best: { topicId: string; score: number } | undefined;
  for (const topic of topics) {
    if (topic.Embedding.length === 0) continue;
    const score = cosineSimilarity(signal.embedding, topic.Embedding);
    if (!best || score > best.score) {
      best = { topicId: topic.TopicID, score };
    }
  }

  if (best && best.score >= MIGRATION_CARE_ASSIGN_SIMILARITY_THRESHOLD) {
    return best.topicId;
  }
  return undefined;
}

/**
 * InterestCategory / Memory シグナルを Topic ごとに集計し、care 加算量（上限付き）を計算する。
 * 各シグナル集合は独立に正規化してから割り当てる。
 */
export function computeCareBoosts(
  topics: TopicEntity[],
  interests: LegacyInterestCategoryEntity[],
  memories: LegacyMemoryEntity[]
): Map<string, number> {
  const interestSignals: CareSignal[] = interests.map((i) => ({
    category: i.Category,
    weight: i.Weight,
    embedding: i.Embedding,
  }));
  const memorySignals: CareSignal[] = memories.map((m) => ({
    category: m.Category,
    weight: m.ReferencedCount,
    embedding: m.Embedding,
  }));

  const sums = new Map<string, number>();

  for (const signals of [normalizeSignals(interestSignals), normalizeSignals(memorySignals)]) {
    for (const signal of signals) {
      const topicId = assignSignalToTopic(signal, topics);
      if (!topicId) {
        logger.warn(
          '[care-seeder] embedding 近傍の Topic が見つからない（未埋め込み、または最大 cosine が閾値未満）ため drop します',
          { category: signal.category }
        );
        continue;
      }
      sums.set(topicId, (sums.get(topicId) ?? 0) + signal.weight);
    }
  }

  const boosts = new Map<string, number>();
  for (const [topicId, sum] of sums) {
    const boost = Math.min(MIGRATION_CARE_SEED_MAX_PER_TOPIC, Math.round(sum));
    if (boost > 0) boosts.set(topicId, boost);
  }
  return boosts;
}

export interface ApplyCareBoostsResult {
  appliedCount: number;
  skippedCount: number;
}

/**
 * `computeCareBoosts` の結果を Topic に適用する（`Care += boost`、楽観ロック付き）。
 * `OptimisticLockError` は warn してスキップする（他 Topic への適用は継続する）。
 */
export async function applyCareBoosts(
  topicRepo: TopicRepository,
  userId: string,
  characterId: string,
  topics: TopicEntity[],
  boosts: Map<string, number>
): Promise<ApplyCareBoostsResult> {
  const topicById = new Map(topics.map((t) => [t.TopicID, t]));
  let appliedCount = 0;
  let skippedCount = 0;

  for (const [topicId, boost] of boosts) {
    const current = topicById.get(topicId);
    if (!current) {
      skippedCount++;
      continue;
    }

    try {
      await topicRepo.putTopic(
        {
          UserID: current.UserID,
          CharacterID: current.CharacterID,
          TopicID: current.TopicID,
          Subject: current.Subject,
          CanonicalSummary: current.CanonicalSummary,
          Category: current.Category,
          Care: current.Care + boost,
          Embedding: current.Embedding,
        },
        { expectedUpdatedAt: current.UpdatedAt }
      );
      appliedCount++;
    } catch (error) {
      if (error instanceof OptimisticLockError) {
        logger.warn('[care-seeder] OptimisticLockError のため care シード適用をスキップしました', {
          userId,
          characterId,
          topicId,
        });
        skippedCount++;
        continue;
      }
      throw error;
    }
  }

  return { appliedCount, skippedCount };
}
