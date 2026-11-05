import { hasPermission } from '@nagiyu/common';

/** 利用回数の段。未ログイン・ログイン済み (無料)・有料の 3 段階 */
export type UsageTier = 'anonymous' | 'free' | 'premium';

/** 1 つの段の上限 */
export type UsageLimit = {
  /** 1 か月あたりの AI 解析ありの回数 */
  aiPerMonth: number;
  /** 1 か月あたりの AI 解析なしの回数 */
  noAiPerMonth: number;
  /** 1 本の動画の長さの上限 (秒) */
  maxDurationSec: number;
};

/**
 * 段ごとの上限の表。
 *
 * 値と段の種類は変わる前提のため、段の判定 ({@link resolveUsageTier}) とは分け、上限の値はここだけに置く。
 * 値は仮のもの。
 */
export const USAGE_LIMITS: Readonly<Record<UsageTier, UsageLimit>> = {
  anonymous: { aiPerMonth: 0, noAiPerMonth: 3, maxDurationSec: 60 * 60 },
  free: { aiPerMonth: 1, noAiPerMonth: 10, maxDurationSec: 180 * 60 },
  premium: { aiPerMonth: 10, noAiPerMonth: 30, maxDurationSec: 240 * 60 },
};

/** 有料の段にする権限 */
const PREMIUM_PERMISSION = 'quick-clip:premium';

/**
 * 持っている権限から段を決める。
 *
 * @param roles - ログイン中のユーザーのロール ID。未ログインは undefined
 */
export const resolveUsageTier = (roles: readonly string[] | undefined): UsageTier => {
  if (roles === undefined) {
    return 'anonymous';
  }
  return hasPermission([...roles], PREMIUM_PERMISSION) ? 'premium' : 'free';
};

/** 段の上限を返す */
export const getUsageLimit = (tier: UsageTier): UsageLimit => USAGE_LIMITS[tier];
