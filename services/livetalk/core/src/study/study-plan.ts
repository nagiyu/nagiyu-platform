import { hasPermission } from '@nagiyu/common';
import { STUDY_DAILY_RESEARCH_LIMIT_PER_USER, STUDY_FREE_TRIAL_DAYS } from '../constants.js';

/** 勉強の回数の区分。運営者の手動ロール・有料のスタンダード・それ以外 (無料) */
export type StudyTier = 'operator' | 'standard' | 'free';

const DAY_MS = 24 * 60 * 60 * 1000;

/** 無料のお試しの長さ (ms) */
export const STUDY_FREE_TRIAL_DURATION_MS = STUDY_FREE_TRIAL_DAYS * DAY_MS;

/**
 * 区分ごとの 1 日の上限の表。
 *
 * 区分の判定 ({@link resolveStudyTier}) とは分け、上限の値はここだけに置く。
 * 無料の値はお試し中のもので、お試しのあとは {@link resolveStudyDailyLimit} が 0 にする。
 * 運営者・スタンダード・無料 (お試し中) が同じ値でも、区分ごとに独立して変えられるよう別の項目で持つ。
 */
export const STUDY_DAILY_LIMITS: Readonly<Record<StudyTier, number>> = {
  operator: STUDY_DAILY_RESEARCH_LIMIT_PER_USER,
  standard: STUDY_DAILY_RESEARCH_LIMIT_PER_USER,
  free: STUDY_DAILY_RESEARCH_LIMIT_PER_USER,
};

/**
 * 有効なロールから区分を決める。
 *
 * 運営者は有料の段の並びとは別の手動ロールで、スタンダードと両方持っていても運営者にする。
 *
 * @param effectiveRoles - 手動のロールと有効な権利から求めたロール ID
 */
export function resolveStudyTier(effectiveRoles: readonly string[]): StudyTier {
  const roles = [...effectiveRoles];
  if (hasPermission(roles, 'livetalk:operator')) {
    return 'operator';
  }
  return hasPermission(roles, 'livetalk:standard') ? 'standard' : 'free';
}

/**
 * 無料のお試しが続いているか。ちょうどお試しの長さが経った時刻で終わる。
 *
 * @param createdAt - Profile の作成時刻 (Unix ms。最初に LiveTalk を開いた時刻)
 * @param nowMs - 現在時刻 (Unix ms)
 */
export function isStudyTrialActive(createdAt: number, nowMs: number): boolean {
  return nowMs < getStudyTrialEndsAt(createdAt);
}

/** お試しが終わる時刻 (Unix ms) */
export function getStudyTrialEndsAt(createdAt: number): number {
  return createdAt + STUDY_FREE_TRIAL_DURATION_MS;
}

/** お試しの残り時間 (ms)。終わっていれば 0 */
export function getStudyTrialRemainingMs(createdAt: number, nowMs: number): number {
  return Math.max(0, getStudyTrialEndsAt(createdAt) - nowMs);
}

/**
 * その利用者の勉強の 1 日の上限を返す。0 は勉強しない。
 *
 * @param tier - 区分
 * @param trialActive - お試しが続いているか。無料のときだけ見る
 */
export function resolveStudyDailyLimit(tier: StudyTier, trialActive: boolean): number {
  if (tier === 'free' && !trialActive) {
    return 0;
  }
  return STUDY_DAILY_LIMITS[tier];
}
