import {
  AFFECTION_BIDIRECTIONALITY_WEIGHT,
  AFFECTION_INFO_DISCLOSURE_WEIGHT,
  AFFECTION_TIME_CONTINUITY_BONUS,
} from '../constants.js';
import type { AffectionFactors } from './types.js';

/**
 * chat-usecase が会話完了時にリアルタイム反映する delta を計算する。
 *
 * infoDisclosure + timeContinuity の 2 軸のみ扱う。
 * bidirectionality は日次バッチで別途反映するため、ここには含まない。
 */
export function calculateAffectionDelta(factors: AffectionFactors): number {
  let delta = 0;
  delta += factors.infoDisclosure * AFFECTION_INFO_DISCLOSURE_WEIGHT;
  delta += factors.isNewActiveDay ? AFFECTION_TIME_CONTINUITY_BONUS : 0;
  return delta;
}

/**
 * bidirectionality スコア（0〜1）から日次バッチ反映分の delta を計算する。
 */
export function calculateBidirectionalityDelta(score: number): number {
  return score * AFFECTION_BIDIRECTIONALITY_WEIGHT;
}

/**
 * 現在のレベルに delta を加算する。
 *
 * 上昇のみ・降下なし（ADR-005 / Replika 教訓）。
 * delta が負の場合（将来の実装ミス防止）も currentLevel を下回らない。
 */
export function updateAffectionLevel(currentLevel: number, delta: number): number {
  return Math.max(currentLevel, currentLevel + delta);
}

/**
 * 前回インタラクション時刻と現在時刻を比較し、今日が新規接触日かを返す（UTC 基準）。
 *
 * 同一日内の複数接触は 1 日分のみカウントする設計。
 * prevLastInteractionAtMs が undefined の場合は初回接触とみなし true を返す。
 */
export function isNewActiveDay(
  prevLastInteractionAtMs: number | undefined,
  nowMs: number
): boolean {
  if (prevLastInteractionAtMs === undefined) return true;
  const prevDay = new Date(prevLastInteractionAtMs).toISOString().slice(0, 10);
  const nowDay = new Date(nowMs).toISOString().slice(0, 10);
  return prevDay !== nowDay;
}
