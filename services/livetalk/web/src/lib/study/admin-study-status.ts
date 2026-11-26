import {
  STUDY_DAILY_RESEARCH_LIMIT_GLOBAL,
  createProfileRepository,
  createStudyUsageRepository,
  getStudyTrialEndsAt,
  isStudyTrialActive,
  resolveStudyDailyLimit,
  resolveStudyTier,
  type StudyTier,
} from '@nagiyu/livetalk-core';
import { formatJstDateTime } from '@nagiyu/common';

/** 無料のお試しの状態。Profile がなければ始まっていない */
export type AdminStudyTrial =
  | { state: 'not_started' }
  | { state: 'active'; endsAt: number }
  | { state: 'ended'; endsAt: number };

/** 回数の使用状況。`reached` は上限に達して、これ以上数えられないこと */
export interface AdminStudyUsageCount {
  used: number;
  limit: number;
  reached: boolean;
}

/** ステータス画面・API の勉強の節 */
export interface AdminStudyStatus {
  tier: StudyTier;
  /** 無料のときだけ持つ。運営者・スタンダードは null */
  trial: AdminStudyTrial | null;
  user: AdminStudyUsageCount;
  global: AdminStudyUsageCount;
}

/** 画面の文言 */
export const ADMIN_STUDY_LABELS = {
  SECTION_TITLE: '勉強',
  TIER_PREFIX: '区分: ',
  TIERS: {
    operator: '運営者',
    standard: 'スタンダード',
    free: '無料',
  } satisfies Record<StudyTier, string>,
  TRIAL_NOT_STARTED: 'お試し: まだ始まっていない',
  TRIAL_ACTIVE: 'お試し中',
  TRIAL_ENDED: 'お試しは終わった',
  TRIAL_ENDS_AT_PREFIX: 'お試しの終わる日時: ',
  USER_USAGE_PREFIX: '今日の回数 (あなた): ',
  GLOBAL_USAGE_PREFIX: '今日の回数 (全利用者): ',
  REACHED: '上限に達している',
} as const;

const toCount = (used: number, limit: number): AdminStudyUsageCount => ({
  used,
  limit,
  reached: used >= limit,
});

/**
 * 勉強の節を組み立てる。区分・お試し・上限の判定は core の関数に任せ、ここでは並べるだけにする。
 *
 * @param effectiveRoles - セッションの有効なロール
 * @param profileCreatedAt - Profile の作成時刻 (Unix ms)。Profile がなければ null
 * @param usage - 今日の回数
 * @param nowMs - 現在時刻 (Unix ms)
 */
export function buildAdminStudyStatus(
  effectiveRoles: readonly string[],
  profileCreatedAt: number | null,
  usage: { userTotal: number; globalTotal: number },
  nowMs: number
): AdminStudyStatus {
  const tier = resolveStudyTier(effectiveRoles);
  let trial: AdminStudyTrial | null = null;
  if (tier === 'free') {
    if (profileCreatedAt === null) {
      trial = { state: 'not_started' };
    } else {
      const endsAt = getStudyTrialEndsAt(profileCreatedAt);
      trial = isStudyTrialActive(profileCreatedAt, nowMs)
        ? { state: 'active', endsAt }
        : { state: 'ended', endsAt };
    }
  }
  // お試しが始まっていない間は、勉強の対象にもならないため、上限は 0 として扱う
  const trialActive = trial?.state === 'active';
  return {
    tier,
    trial,
    user: toCount(usage.userTotal, resolveStudyDailyLimit(tier, trialActive)),
    global: toCount(usage.globalTotal, STUDY_DAILY_RESEARCH_LIMIT_GLOBAL),
  };
}

/** 回数の 1 行。上限に達していれば、そうとわかる印を足す */
export function formatUsageCount(prefix: string, count: AdminStudyUsageCount): string {
  const base = `${prefix}${count.used} / ${count.limit}`;
  return count.reached ? `${base} (${ADMIN_STUDY_LABELS.REACHED})` : base;
}

/** お試しの 2 行 (状態と終わる日時)。日時は日本時間 */
export function formatTrialLines(trial: AdminStudyTrial): string[] {
  if (trial.state === 'not_started') return [ADMIN_STUDY_LABELS.TRIAL_NOT_STARTED];
  const label =
    trial.state === 'active' ? ADMIN_STUDY_LABELS.TRIAL_ACTIVE : ADMIN_STUDY_LABELS.TRIAL_ENDED;
  return [label, `${ADMIN_STUDY_LABELS.TRIAL_ENDS_AT_PREFIX}${formatJstDateTime(trial.endsAt)}`];
}

/** 画面に出す行を、上から順に返す */
export function formatAdminStudyLines(status: AdminStudyStatus): string[] {
  return [
    `${ADMIN_STUDY_LABELS.TIER_PREFIX}${ADMIN_STUDY_LABELS.TIERS[status.tier]}`,
    ...(status.trial ? formatTrialLines(status.trial) : []),
    formatUsageCount(ADMIN_STUDY_LABELS.USER_USAGE_PREFIX, status.user),
    formatUsageCount(ADMIN_STUDY_LABELS.GLOBAL_USAGE_PREFIX, status.global),
  ];
}

/** Profile と今日の回数を読んで、勉強の節を作る */
export async function loadAdminStudyStatus(
  userId: string,
  effectiveRoles: readonly string[],
  nowMs: number
): Promise<AdminStudyStatus> {
  const [profile, usage] = await Promise.all([
    createProfileRepository().getById({ userId }),
    createStudyUsageRepository().readToday(userId, nowMs),
  ]);
  return buildAdminStudyStatus(effectiveRoles, profile?.createdAt ?? null, usage, nowMs);
}
