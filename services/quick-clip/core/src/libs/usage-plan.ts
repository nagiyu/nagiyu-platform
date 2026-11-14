import { hasPermission } from '@nagiyu/common';

/** 利用回数の段。未ログイン・ログイン済み (無料)・有料・運営者向けの手動ロールの各段 */
export type UsageTier = 'anonymous' | 'free' | 'standard' | 'pro' | 'unlimited';

/** 1 つの段の上限 */
export type UsageLimit = {
  /**
   * 1 か月あたりの AI 解析ありの回数。null は上限なし。
   * JSON にできない Infinity ではなく null で表し、応答にそのまま載せられるようにする
   */
  aiPerMonth: number | null;
  /** 1 か月あたりの AI 解析なしの回数。null は上限なし */
  noAiPerMonth: number | null;
  /** 1 本の動画の長さの上限 (秒) */
  maxDurationSec: number;
};

const PRO_LIMIT: UsageLimit = { aiPerMonth: 8, noAiPerMonth: 10, maxDurationSec: 240 * 60 };

/**
 * 段ごとの上限の表。
 *
 * 値と段の種類は変わる前提のため、段の判定 ({@link resolveUsageTier}) とは分け、上限の値はここだけに置く。
 * 値は、2 時間の動画を基準に使い切っても各段の価格の手取りに収まるよう、原価から決めている。
 */
export const USAGE_LIMITS: Readonly<Record<UsageTier, UsageLimit>> = {
  anonymous: { aiPerMonth: 0, noAiPerMonth: 3, maxDurationSec: 60 * 60 },
  free: { aiPerMonth: 1, noAiPerMonth: 3, maxDurationSec: 120 * 60 },
  standard: { aiPerMonth: 4, noAiPerMonth: 5, maxDurationSec: 180 * 60 },
  pro: PRO_LIMIT,
  // 長さは Batch・Lambda の処理時間の制約で外せないため、プロと同じ値を参照して二重に持たない
  unlimited: { aiPerMonth: null, noAiPerMonth: null, maxDurationSec: PRO_LIMIT.maxDurationSec },
};

/**
 * 持っている権限から段を決める。
 *
 * @param roles - ログイン中のユーザーのロール ID。未ログインは undefined
 */
export const resolveUsageTier = (roles: readonly string[] | undefined): UsageTier => {
  if (roles === undefined) {
    return 'anonymous';
  }
  // 上の段のロールは下の段の権限も持つため、上の段から順に確かめる。使い放題は有料の段の並びとは別の手動ロールだが、プロと両方持っていても使い放題にする
  if (hasPermission([...roles], 'quick-clip:unlimited')) {
    return 'unlimited';
  }
  if (hasPermission([...roles], 'quick-clip:pro')) {
    return 'pro';
  }
  return hasPermission([...roles], 'quick-clip:standard') ? 'standard' : 'free';
};

/** 段の上限を返す */
export const getUsageLimit = (tier: UsageTier): UsageLimit => USAGE_LIMITS[tier];
