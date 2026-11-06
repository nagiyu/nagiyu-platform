/**
 * 利用回数の制限を画面に出すための判定と文言の組み立て。
 * 画面 (app/) に判定を持たせず、表示に依らないものをここに集める。
 */

export type UsageTier = 'anonymous' | 'free' | 'standard' | 'pro';

/** `GET /api/usage` の応答 */
export type UsageSummary = {
  tier: UsageTier;
  limits: { aiPerMonth: number; noAiPerMonth: number; maxDurationSec: number };
  remaining: { ai: number; noAi: number };
};

/** ジョブ作成が上限で断られたときのエラーコード */
export type LimitErrorCode =
  'AI_LIMIT_EXCEEDED' | 'NO_AI_LIMIT_EXCEEDED' | 'IP_LIMIT_EXCEEDED' | 'DURATION_LIMIT_EXCEEDED';

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
  AI_UNAVAILABLE_ANONYMOUS: 'ログインすると AI 解析を月 1 回お試しできます',
  AI_UNAVAILABLE_EXHAUSTED: '今月の AI 解析の回数を使い切りました',
  SIGN_IN_ACTION: 'ログインする',
  PLANS_ACTION: 'プランを見る',
} as const;

const LIMIT_ERROR_CODES: readonly string[] = [
  'AI_LIMIT_EXCEEDED',
  'NO_AI_LIMIT_EXCEEDED',
  'IP_LIMIT_EXCEEDED',
  'DURATION_LIMIT_EXCEEDED',
];

const TIERS: readonly string[] = ['anonymous', 'free', 'standard', 'pro'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

/**
 * `/api/usage` の応答を検証して取り出す。
 * 形が合わないものは null を返し、呼び出し側は残りの表示を出さない扱いにする。
 */
export const parseUsageSummary = (body: unknown): UsageSummary | null => {
  if (!isRecord(body) || !isRecord(body.limits) || !isRecord(body.remaining)) {
    return null;
  }
  const { tier, limits, remaining } = body;
  if (typeof tier !== 'string' || !TIERS.includes(tier)) {
    return null;
  }
  if (
    !isCount(limits.aiPerMonth) ||
    !isCount(limits.noAiPerMonth) ||
    !isCount(limits.maxDurationSec) ||
    !isCount(remaining.ai) ||
    !isCount(remaining.noAi)
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
export const hasAiRemaining = (usage: UsageSummary): boolean => usage.remaining.ai > 0;

/** 残り回数の表示文 */
export const formatRemaining = (usage: UsageSummary): string =>
  `${USAGE_MESSAGES.REMAINING_PREFIX}: AI 解析あり ${usage.remaining.ai} 回 / なし ${usage.remaining.noAi} 回`;

/**
 * AI ありが選べないときの理由。選べるなら null。
 * 未ログインは上限が 0 回のため「使い切り」ではなく、ログインへ誘導する文言にする。
 */
export const resolveAiUnavailableMessage = (usage: UsageSummary): string | null => {
  if (hasAiRemaining(usage)) {
    return null;
  }
  return usage.tier === 'anonymous'
    ? USAGE_MESSAGES.AI_UNAVAILABLE_ANONYMOUS
    : USAGE_MESSAGES.AI_UNAVAILABLE_EXHAUSTED;
};

/**
 * 段の上に、さらに上限の広い段があるか。
 * 段の値の大小ではなく、一番上の段かどうかで決める (上限の値は変わる前提のため)。
 */
export const hasHigherTier = (tier: UsageTier | null): boolean => tier !== 'pro';

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
  if (code === null || !LIMIT_ERROR_CODES.includes(code) || code === 'IP_LIMIT_EXCEEDED') {
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
  if (isRecord(body) && typeof body.error === 'string' && LIMIT_ERROR_CODES.includes(body.error)) {
    return body.error as LimitErrorCode;
  }
  return null;
};
