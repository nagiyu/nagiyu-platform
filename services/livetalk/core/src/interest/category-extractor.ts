import { logger } from '@nagiyu/common';
import { INTEREST_DEDUP_SIMILARITY_THRESHOLD } from '../constants.js';
import { cosineSimilarity } from '../memory/embedding.js';
import type { IEmbeddingClient } from '../llm-client/types.js';
import type { InterestCategoryEntity } from '../entities/interest-category.entity.js';
import type { InterestRepository } from '../repositories/interest.repository.interface.js';

export interface ExtractedCategory {
  category: string;
  weight: number;
}

/**
 * 興味カテゴリ dedup（重複統合）オプション（Issue #3325）。
 *
 * `embeddingClient` を渡すと、抽出カテゴリ名と既存カテゴリ名の cosine similarity を計算し、
 * `similarityThreshold` 以上で類似と判定された既存カテゴリに weight を統合する。
 * 未指定時は文字列完全一致のみで判定する（旧挙動）。
 */
export interface InterestDedupOptions {
  embeddingClient: IEmbeddingClient;
  /** 類似と判定する cosine similarity 下限値。既定は {@link INTEREST_DEDUP_SIMILARITY_THRESHOLD} */
  similarityThreshold?: number;
}

/**
 * LLM が抽出した興味カテゴリを InterestRepository に永続化する。
 *
 * 統合判定の優先順位：
 *   1. 文字列完全一致 → 既存項目に weight を加算
 *   2. embedding 類似度（{@link InterestDedupOptions} 指定時のみ）→ 閾値以上の既存項目に統合
 *   3. それ以外 → 新規 put（embedding 付き）
 *
 * 既存項目に Embedding が無い場合はバッチ内で生成・バックフィルする（後方互換）。
 * エラーは warn ログのみ（fail-warn パターン、バッチ全体を止めない）。
 */
export async function persistInterestCategories(
  userId: string,
  characterId: string,
  categories: ExtractedCategory[],
  interestRepo: InterestRepository,
  dedupOptions?: InterestDedupOptions
): Promise<void> {
  // 既存カテゴリを 1 回だけリストして同一バッチ内で使い回す（dedup 無効時も完全一致統合に使う）
  const existing: InterestCategoryEntity[] = await safeList(userId, characterId, interestRepo);
  const existingByName = new Map<string, InterestCategoryEntity>(
    existing.map((e) => [e.Category, e])
  );

  const threshold = dedupOptions?.similarityThreshold ?? INTEREST_DEDUP_SIMILARITY_THRESHOLD;

  for (const cat of categories) {
    if (!cat.category || cat.weight <= 0) continue;

    try {
      // 1. 完全一致
      const exact = existingByName.get(cat.category);
      if (exact) {
        const updated = await interestRepo.update({
          ...exact,
          Weight: exact.Weight + cat.weight,
        });
        existingByName.set(updated.Category, updated);
        const idx = existing.findIndex((e) => e.Category === updated.Category);
        if (idx >= 0) existing[idx] = updated;
        continue;
      }

      // 2. embedding 類似度ベース dedup
      if (dedupOptions) {
        const merged = await tryEmbeddingDedup(
          userId,
          characterId,
          cat,
          existing,
          interestRepo,
          dedupOptions.embeddingClient,
          threshold
        );
        if (merged) {
          existingByName.set(merged.Category, merged);
          continue;
        }

        // 3. 新規 put（embedding 付き、embedding 生成失敗時は embedding なしで put）
        const newEmbedding = await safeEmbed(cat.category, dedupOptions.embeddingClient);
        const created = await interestRepo.put({
          UserID: userId,
          CharacterID: characterId,
          Category: cat.category,
          Weight: cat.weight,
          ...(newEmbedding ? { Embedding: newEmbedding } : {}),
        });
        existing.push(created);
        existingByName.set(created.Category, created);
        continue;
      }

      // dedup 未指定 + 完全一致なし: 新規 put（同一バッチ内の重複に備え existingByName へ追加）
      const created = await interestRepo.put({
        UserID: userId,
        CharacterID: characterId,
        Category: cat.category,
        Weight: cat.weight,
      });
      existing.push(created);
      existingByName.set(created.Category, created);
    } catch (err) {
      logger.warn('[category-extractor] 興味カテゴリの保存に失敗しました', {
        err,
        userId,
        category: cat.category,
      });
    }
  }
}

/**
 * 新規カテゴリと既存カテゴリ群を embedding 比較し、閾値超えなら既存に統合する。
 * 統合した場合は更新後の entity を返す。閾値未満の場合は null を返す。
 *
 * 既存カテゴリに Embedding が無い場合はその場で生成し、Weight 変化が無くても update で
 * バックフィルする（次回バッチからは再生成不要）。
 */
async function tryEmbeddingDedup(
  userId: string,
  characterId: string,
  cat: ExtractedCategory,
  existing: InterestCategoryEntity[],
  interestRepo: InterestRepository,
  embeddingClient: IEmbeddingClient,
  threshold: number
): Promise<InterestCategoryEntity | null> {
  if (existing.length === 0) return null;

  const newEmbedding = await safeEmbed(cat.category, embeddingClient);
  if (!newEmbedding) return null;

  let bestIdx = -1;
  let bestSim = -Infinity;
  for (let i = 0; i < existing.length; i++) {
    const candidate = existing[i];
    let candEmb = candidate.Embedding;
    if (!candEmb || candEmb.length === 0) {
      const generated = await safeEmbed(candidate.Category, embeddingClient);
      if (!generated) continue;
      candEmb = generated;
      try {
        const backfilled = await interestRepo.update({ ...candidate, Embedding: candEmb });
        existing[i] = backfilled;
      } catch (err) {
        logger.warn('[category-extractor] embedding のバックフィルに失敗しました', {
          err,
          userId,
          characterId,
          category: candidate.Category,
        });
      }
    }
    const sim = cosineSimilarity(newEmbedding, candEmb);
    if (sim > bestSim) {
      bestSim = sim;
      bestIdx = i;
    }
  }

  if (bestIdx < 0 || bestSim < threshold) return null;

  const target = existing[bestIdx];
  const updated = await interestRepo.update({
    ...target,
    Weight: target.Weight + cat.weight,
  });
  existing[bestIdx] = updated;

  logger.info('[category-extractor] 同義カテゴリを統合しました', {
    userId,
    characterId,
    incoming: cat.category,
    mergedInto: updated.Category,
    similarity: Number(bestSim.toFixed(3)),
  });
  return updated;
}

async function safeList(
  userId: string,
  characterId: string,
  interestRepo: InterestRepository
): Promise<InterestCategoryEntity[]> {
  try {
    return await interestRepo.list(userId, characterId);
  } catch (err) {
    logger.warn('[category-extractor] 既存カテゴリ一覧の取得に失敗（dedup を無効化）', {
      err,
      userId,
      characterId,
    });
    return [];
  }
}

async function safeEmbed(
  text: string,
  embeddingClient: IEmbeddingClient
): Promise<number[] | null> {
  try {
    return await embeddingClient.embed(text);
  } catch (err) {
    logger.warn('[category-extractor] embedding の生成に失敗しました', { err, text });
    return null;
  }
}
