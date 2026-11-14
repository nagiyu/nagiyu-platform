/**
 * 利用回数の制限を画面に出すための判定と文言の組み立て。
 * 画面 (app/) に判定を持たせず、表示に依らないものをここに集める。
 */

import type { UsageDenyCode, UsageSnapshot, UsageTier } from '@nagiyu/quick-clip-core';

export type { UsageTier };

/** `GET /api/usage` の応答 (サーバー側の `UsageSnapshot` のうち画面が使う部分) */
export type UsageSummary = Pick<UsageSnapshot, 'tier' | 'limits' | 'remaining'>;

/** ジョブ作成が上限で断られたときのエラーコード */
export type LimitErrorCode = UsageDenyCode;

/** 上限のとき、利用者を誘導する先 */
export type LimitGuidance = {
  /** プランの画面への案内を出すか */
  plans: boolean;
  /** ログインの案内を出すか (未ログインのときだけ) */
  signIn: boolean;
};

export const USAGE_MESSAGES = {
  AI_LABEL: 'AI 解析 (文字起こし・感情分析) を使う',
  REMAINING_PREFIX: '今月の残り',
  REMAINING_UNLIMITED: '無制限',
  AI_UNAVAILABLE_ANONYMOUS: 'ログインすると AI 解析を月 1 回お試しできます',
  AI_UNAVAILABLE_EXHAUSTED: '今月の AI 解析の回数を使い切りました',
  ALL_EXHAUSTED: '今月の利用回数 (AI 解析あり・なし) を使い切りました',
  ALL_EXHAUSTED_ANONYMOUS:
    '今月の利用回数を使い切りました。ログインすると回数が増え、AI 解析も月 1 回お試しできます',
  NO_AI_EXHAUSTED: '今月の AI 解析なしの回数を使い切りました。AI 解析ありなら使えます',
  SIGN_IN_ACTION: 'ログインする',
  PLANS_ACTION: 'プランを見る',
} as const;

// 断る理由を足したときに判定から漏れないよう、サーバー側の型から全件を求める
const LIMIT_ERROR_CODES: Readonly<Record<LimitErrorCode, true>> = {
  AI_LIMIT_EXCEEDED: true,
  NO_AI_LIMIT_EXCEEDED: true,
  IP_LIMIT_EXCEEDED: true,
  DURATION_LIMIT_EXCEEDED: true,
};

const isLimitErrorCode = (value: unknown): value is LimitErrorCode =>
  typeof value === 'string' && Object.hasOwn(LIMIT_ERROR_CODES, value);

// 段を足したときに検証から漏れないよう、サーバー側の段の型から全段を求める
const TIERS: Readonly<Record<UsageTier, true>> = {
  anonymous: true,
  free: true,
  standard: true,
  pro: true,
  unlimited: true,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** 回数、または上限なしを表す null */
const isCountOrUnlimited = (value: unknown): value is number | null =>
  value === null || isCount(value);

/**
 * `/api/usage` の応答を検証して取り出す。
 * 形が合わないものは null を返し、呼び出し側は残りの表示を出さない扱いにする。
 */
export const parseUsageSummary = (body: unknown): UsageSummary | null => {
  if (!isRecord(body) || !isRecord(body.limits) || !isRecord(body.remaining)) {
    return null;
  }
  const { tier, limits, remaining } = body;
  if (typeof tier !== 'string' || !Object.hasOwn(TIERS, tier)) {
    return null;
  }
  if (
    !isCountOrUnlimited(limits.aiPerMonth) ||
    !isCountOrUnlimited(limits.noAiPerMonth) ||
    !isCount(limits.maxDurationSec) ||
    !isCountOrUnlimited(remaining.ai) ||
    !isCountOrUnlimited(remaining.noAi)
  ) {
    return null;
  }
  return {
    tier: tier as UsageTier,
    limits: {
      aiPerMonth: limits.aiPerMonth,
      noAiPerMonth: limits.noAiPerMonth,
      maxDurationSec: limits.maxDurationSec,
    },
    remaining: { ai: remaining.ai, noAi: remaining.noAi },
  };
};

/** AI 解析ありの残りがあるか */
export const hasAiRemaining = (usage: UsageSummary): boolean =>
  usage.remaining.ai === null || usage.remaining.ai > 0;

/** 残り回数の表示文 */
export const formatRemaining = (usage: UsageSummary): string => {
  if (usage.remaining.ai === null && usage.remaining.noAi === null) {
    return `${USAGE_MESSAGES.REMAINING_PREFIX}: ${USAGE_MESSAGES.REMAINING_UNLIMITED}`;
  }
  const format = (count: number | null): string =>
    count === null ? USAGE_MESSAGES.REMAINING_UNLIMITED : `${count} 回`;
  return `${USAGE_MESSAGES.REMAINING_PREFIX}: AI 解析あり ${format(usage.remaining.ai)} / なし ${format(usage.remaining.noAi)}`;
};

/** 回数が尽きているか。上限なし (null) は尽きない */
const isExhausted = (remaining: number | null): boolean => remaining === 0;

/**
 * 今の選択で送ると、回数でサーバーに断られるか。
 * サーバーは選択した側 (AI ありか、なしか) の残りだけで判定するため、同じ見方にそろえる。
 */
export const isUsageExhaustedForSelection = (usage: UsageSummary, aiAnalysis: boolean): boolean =>
  isExhausted(aiAnalysis ? usage.remaining.ai : usage.remaining.noAi);

/** 利用回数の案内。文言と、添える誘導先 */
export type UsageNotice = {
  message: string;
  guidance: LimitGuidance;
};

/**
 * 回数について利用者に知らせる案内。出す必要がなければ null。
 * 未ログインは AI ありの上限が 0 回のため、AI ありだけが尽きた状態は「使い切り」ではなくログインへ誘う文言にする。
 * AI なしだけが尽きた場合は、AI ありを選べるうちはスイッチをオフにしているときだけ知らせる (オンなら送れるため)。
 */
export const resolveUsageNotice = (
  usage: UsageSummary,
  aiAnalysis: boolean
): UsageNotice | null => {
  const anonymous = usage.tier === 'anonymous';
  const aiExhausted = isExhausted(usage.remaining.ai);
  const noAiExhausted = isExhausted(usage.remaining.noAi);

  let message: string;
  if (aiExhausted && noAiExhausted) {
    message = anonymous ? USAGE_MESSAGES.ALL_EXHAUSTED_ANONYMOUS : USAGE_MESSAGES.ALL_EXHAUSTED;
  } else if (aiExhausted) {
    message = anonymous
      ? USAGE_MESSAGES.AI_UNAVAILABLE_ANONYMOUS
      : USAGE_MESSAGES.AI_UNAVAILABLE_EXHAUSTED;
  } else if (noAiExhausted && !aiAnalysis) {
    message = USAGE_MESSAGES.NO_AI_EXHAUSTED;
  } else {
    return null;
  }
  return {
    message,
    guidance: { plans: !anonymous && hasHigherTier(usage.tier), signIn: anonymous },
  };
};

/**
 * 段の上に、さらに上限の広い段があるか。
 * 段の値の大小ではなく、一番上の段かどうかで決める (上限の値は変わる前提のため)。
 */
export const hasHigherTier = (tier: UsageTier | null): boolean =>
  tier !== 'pro' && tier !== 'unlimited';

/**
 * 上限のときの誘導先を決める。
 * 未ログインはログインでも上限が広がるため、ログインの案内も添える。
 * IP の上限は利用者の操作では解消できないため、案内は出さない。
 * 一番上の段には上げ先が無いため、プランの画面は案内しない。
 */
export const resolveLimitGuidance = (
  code: string | null,
  tier: UsageTier | null
): LimitGuidance => {
  if (!isLimitErrorCode(code) || code === 'IP_LIMIT_EXCEEDED') {
    return { plans: false, signIn: false };
  }
  return { plans: hasHigherTier(tier), signIn: tier === 'anonymous' };
};

/** 動画の長さを超過判定した結果 */
export type DurationCheck = {
  exceeded: boolean;
  /** 動画の長さ (分、切り上げ) */
  videoMinutes: number;
  /** 上限 (分、切り捨て) */
  limitMinutes: number;
};

/**
 * 動画の長さが段の上限を超えているかを判定する。
 * 分の表示は、超過しているのに「60 分 / 上限 60 分」と見えないよう動画側を切り上げる。
 */
export const checkVideoDuration = (durationSec: number, maxDurationSec: number): DurationCheck => ({
  exceeded: durationSec > maxDurationSec,
  videoMinutes: Math.ceil(durationSec / 60),
  limitMinutes: Math.floor(maxDurationSec / 60),
});

/** 長さ超過の警告文 */
export const buildDurationExceededMessage = (check: DurationCheck): string =>
  `この動画は ${check.videoMinutes} 分で、ご利用の上限 (${check.limitMinutes} 分) を超えています`;

/** 失敗応答の本文から、上限のエラーコードを取り出す。該当しなければ null */
export const readLimitErrorCode = (body: unknown): LimitErrorCode | null => {
  return isRecord(body) && isLimitErrorCode(body.error) ? body.error : null;
};
