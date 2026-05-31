import { logger } from '@nagiyu/common';
import type { InterestRepository } from '../repositories/interest.repository.interface.js';

export interface ExtractedCategory {
  category: string;
  weight: number;
}

/**
 * LLM が抽出した興味カテゴリを InterestRepository に永続化する。
 *
 * 既存カテゴリがあれば weight を累積し、なければ新規 put する。
 * エラーは warn ログのみ（fail-warn パターン、バッチ全体を止めない）。
 */
export async function persistInterestCategories(
  userId: string,
  characterId: string,
  categories: ExtractedCategory[],
  interestRepo: InterestRepository
): Promise<void> {
  for (const cat of categories) {
    if (!cat.category || cat.weight <= 0) continue;

    try {
      const existing = await interestRepo.get(userId, characterId, cat.category);
      if (existing) {
        await interestRepo.update({ ...existing, Weight: existing.Weight + cat.weight });
      } else {
        await interestRepo.put({
          UserID: userId,
          CharacterID: characterId,
          Category: cat.category,
          Weight: cat.weight,
        });
      }
    } catch (err) {
      logger.warn('[category-extractor] 興味カテゴリの保存に失敗しました', {
        err,
        userId,
        category: cat.category,
      });
    }
  }
}
