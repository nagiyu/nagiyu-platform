/**
 * Memory の昇格・降格・訂正適用ロジック（Phase 3d / Issue #3282）。
 *
 * - applyCorrection: 訂正検出結果を Memory に反映（confidence 減算、閾値割れで削除）
 * - executePromotion: 昇格候補を Tier C → B に昇格
 */

import { logger } from '@nagiyu/common';
import type { MemoryRepository } from '../repositories/memory.repository.interface.js';
import type { MemoryEntity } from '../entities/memory.entity.js';
import type { CorrectionResult } from './correction-detector.js';
import { CORRECTION_CONFIDENCE_PENALTY, MEMORY_AUTO_DELETE_THRESHOLD } from '../constants.js';

/**
 * 訂正結果を Memory に適用する。
 *
 * - 対象 Memory の Confidence を CORRECTION_CONFIDENCE_PENALTY 分下げる
 * - Confidence < MEMORY_AUTO_DELETE_THRESHOLD の場合は削除する
 * - newValue が取得できていれば Content も更新する
 * - エラーは warn ログのみ（fail-warn パターン）
 */
export async function applyCorrection(
  correction: CorrectionResult,
  memoryRepository: MemoryRepository
): Promise<void> {
  if (!correction.detected || correction.targetMemories.length === 0) return;

  await Promise.all(
    correction.targetMemories.map(async (memory) => {
      const newConfidence = Math.max(0, memory.Confidence - CORRECTION_CONFIDENCE_PENALTY);

      if (newConfidence < MEMORY_AUTO_DELETE_THRESHOLD) {
        try {
          await memoryRepository.delete({
            userId: memory.UserID,
            characterId: memory.CharacterID,
            tier: memory.Tier,
            category: memory.Category,
            memoryId: memory.MemoryID,
          });
          logger.info('[promotion] 訂正により記憶を自動削除しました', {
            memoryId: memory.MemoryID,
            confidence: memory.Confidence,
          });
        } catch (err) {
          logger.warn('[promotion] 記憶の削除に失敗しました', {
            err,
            memoryId: memory.MemoryID,
          });
        }
        return;
      }

      try {
        await memoryRepository.update({
          UserID: memory.UserID,
          CharacterID: memory.CharacterID,
          MemoryID: memory.MemoryID,
          Tier: memory.Tier,
          Category: memory.Category,
          Confidence: newConfidence,
          ...(correction.newValue !== undefined && { Content: correction.newValue }),
        });
        logger.info('[promotion] 訂正により記憶の信頼度を下げました', {
          memoryId: memory.MemoryID,
          before: memory.Confidence,
          after: newConfidence,
        });
      } catch (err) {
        logger.warn('[promotion] 記憶の更新に失敗しました', {
          err,
          memoryId: memory.MemoryID,
        });
      }
    })
  );
}

/**
 * 昇格候補の Tier C 記憶を Tier B に昇格する。
 *
 * fire-and-forget 用途（エラーは warn のみ、呼び出し元はレスポンスを待たない）。
 */
export async function executePromotion(
  promotionCandidates: MemoryEntity[],
  memoryRepository: MemoryRepository
): Promise<void> {
  if (promotionCandidates.length === 0) return;

  await Promise.all(
    promotionCandidates.map(async (memory) => {
      try {
        await memoryRepository.promote(memory, 'B');
        logger.info('[promotion] Tier C → B 昇格を実行しました', {
          memoryId: memory.MemoryID,
        });
      } catch (err) {
        logger.warn('[promotion] 記憶の昇格に失敗しました', {
          err,
          memoryId: memory.MemoryID,
        });
      }
    })
  );
}
