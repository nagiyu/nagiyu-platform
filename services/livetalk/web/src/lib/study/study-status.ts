import {
  getStudyTrialRemainingMs,
  isStudyTrialActive,
  resolveStudyTier,
} from '@nagiyu/livetalk-core';
import type { StudyStatus } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 勉強の状態を決める。区分と期間の判定は core の関数に任せ、ここでは表示用の形に直すだけにする。
 *
 * @param effectiveRoles - セッションの有効なロール (手動のロールと課金の権利から求めたもの)
 * @param createdAt - Profile の作成時刻 (Unix ms)。Profile がまだない (同意前など) ときは null。
 *   お試しは Profile の作成から数えるため、無い間は始まっておらず、札を出さない
 * @param nowMs - 現在時刻 (Unix ms)
 */
export function computeStudyStatus(
  effectiveRoles: readonly string[],
  createdAt: number | null,
  nowMs: number
): StudyStatus {
  if (resolveStudyTier(effectiveRoles) !== 'free' || createdAt === null) {
    return { state: 'hidden' };
  }
  if (!isStudyTrialActive(createdAt, nowMs)) {
    return { state: 'ended' };
  }
  // 残り 1 時間でも「あと 1 日」と見せるため、日に切り上げる
  return {
    state: 'trial',
    remainingDays: Math.max(1, Math.ceil(getStudyTrialRemainingMs(createdAt, nowMs) / DAY_MS)),
  };
}
