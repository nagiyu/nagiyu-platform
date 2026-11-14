import {
  buildDurationExceededMessage,
  checkVideoDuration,
  formatRemaining,
  hasAiRemaining,
  hasHigherTier,
  hasLimitGuidance,
  parseUsageSummary,
  readLimitErrorCode,
  isUsageExhaustedForSelection,
  resolveUsageNotice,
  resolveErrorGuidance,
  resolveLimitGuidance,
  type UsageSummary,
} from '@/lib/usage-guidance';

const usage = (overrides: Partial<UsageSummary> = {}): UsageSummary => ({
  tier: 'free',
  limits: { aiPerMonth: 1, noAiPerMonth: 10, maxDurationSec: 10800 },
  remaining: { ai: 1, noAi: 10 },
  ...overrides,
});

describe('parseUsageSummary', () => {
  it('/api/usage の応答から段・上限・残りを取り出す', () => {
    expect(
      parseUsageSummary({
        month: '2026-11',
        tier: 'standard',
        limits: { aiPerMonth: 10, noAiPerMonth: 30, maxDurationSec: 14400 },
        used: { ai: 1, noAi: 2 },
        remaining: { ai: 9, noAi: 28 },
      })
    ).toEqual({
      tier: 'standard',
      limits: { aiPerMonth: 10, noAiPerMonth: 30, maxDurationSec: 14400 },
      remaining: { ai: 9, noAi: 28 },
    });
  });

  it.each([
    ['null', null],
    ['文字列', 'x'],
    ['limits が無い', { tier: 'free', remaining: { ai: 0, noAi: 0 } }],
    ['remaining が無い', { tier: 'free', limits: {} }],
    [
      '未知の段',
      {
        tier: 'gold',
        limits: { aiPerMonth: 1, noAiPerMonth: 1, maxDurationSec: 1 },
        remaining: { ai: 0, noAi: 0 },
      },
    ],
    [
      '数値でない残り',
      {
        tier: 'free',
        limits: { aiPerMonth: 1, noAiPerMonth: 1, maxDurationSec: 1 },
        remaining: { ai: '1', noAi: 0 },
      },
    ],
    [
      '負の残り',
      {
        tier: 'free',
        limits: { aiPerMonth: 1, noAiPerMonth: 1, maxDurationSec: 1 },
        remaining: { ai: -1, noAi: 0 },
      },
    ],
  ])('%s は null にする', (_label, body) => {
    expect(parseUsageSummary(body)).toBeNull();
  });
});

describe('残り回数', () => {
  it('AI ありの残りの有無を判定する', () => {
    expect(hasAiRemaining(usage())).toBe(true);
    expect(hasAiRemaining(usage({ remaining: { ai: 0, noAi: 3 } }))).toBe(false);
  });

  it('残りの表示文を組み立てる', () => {
    expect(formatRemaining(usage({ remaining: { ai: 1, noAi: 9 } }))).toBe(
      '今月の残り: AI 解析あり 1 回 / なし 9 回'
    );
  });
});

describe('上限なし (unlimited)', () => {
  const unlimited = usage({
    tier: 'unlimited',
    limits: { aiPerMonth: null, noAiPerMonth: null, maxDurationSec: 14400 },
    remaining: { ai: null, noAi: null },
  });

  it('/api/usage の null を上限なしとして受け入れる', () => {
    expect(
      parseUsageSummary({
        month: '2026-11',
        tier: 'unlimited',
        limits: { aiPerMonth: null, noAiPerMonth: null, maxDurationSec: 14400 },
        used: { ai: 0, noAi: 0 },
        remaining: { ai: null, noAi: null },
      })
    ).toEqual(unlimited);
  });

  it('null 以外の数でない値は受け入れない', () => {
    expect(
      parseUsageSummary({
        tier: 'unlimited',
        limits: { aiPerMonth: null, noAiPerMonth: null, maxDurationSec: 14400 },
        remaining: { ai: 'x', noAi: null },
      })
    ).toBeNull();
  });

  it('AI ありは常に選べる', () => {
    expect(hasAiRemaining(unlimited)).toBe(true);
    expect(resolveUsageNotice(unlimited, true)).toBeNull();
  });

  it('残りの表示文は無制限と分かる', () => {
    expect(formatRemaining(unlimited)).toBe('今月の残り: 無制限');
  });

  it('片方だけ上限なしなら、その種類だけ無制限と表示する', () => {
    expect(formatRemaining(usage({ remaining: { ai: 2, noAi: null } }))).toBe(
      '今月の残り: AI 解析あり 2 回 / なし 無制限'
    );
  });
});

describe('isUsageExhaustedForSelection', () => {
  it.each([
    ['AI あり選択で AI ありが 0', 0, 5, true, true],
    ['AI あり選択で AI なしだけ 0', 1, 0, true, false],
    ['AI なし選択で AI なしが 0', 1, 0, false, true],
    ['AI なし選択で AI ありだけ 0', 0, 5, false, false],
    ['両方残っている', 1, 5, true, false],
  ])('%s', (_name, ai, noAi, aiAnalysis, expected) => {
    expect(isUsageExhaustedForSelection(usage({ remaining: { ai, noAi } }), aiAnalysis)).toBe(
      expected
    );
  });

  it('上限なしは尽きない', () => {
    const unlimitedUsage = usage({ remaining: { ai: null, noAi: null } });
    expect(isUsageExhaustedForSelection(unlimitedUsage, true)).toBe(false);
    expect(isUsageExhaustedForSelection(unlimitedUsage, false)).toBe(false);
  });
});

describe('resolveUsageNotice', () => {
  it('残りがあれば null', () => {
    expect(resolveUsageNotice(usage(), true)).toBeNull();
  });

  it('未ログインの AI ありだけ 0 はログインへ誘う文言', () => {
    expect(
      resolveUsageNotice(usage({ tier: 'anonymous', remaining: { ai: 0, noAi: 3 } }), false)
    ).toEqual({
      message: 'ログインすると AI 解析を月 1 回お試しできます',
      guidance: { plans: false, signIn: true },
    });
  });

  it('ログイン済みの AI ありだけ 0 は使い切りの文言とプランの案内', () => {
    expect(resolveUsageNotice(usage({ remaining: { ai: 0, noAi: 3 } }), false)).toEqual({
      message: '今月の AI 解析の回数を使い切りました',
      guidance: { plans: true, signIn: false },
    });
  });

  it('ログイン済みの両方 0 は両方使い切りの文言とプランの案内', () => {
    expect(resolveUsageNotice(usage({ remaining: { ai: 0, noAi: 0 } }), false)).toEqual({
      message: '今月の利用回数 (AI 解析あり・なし) を使い切りました',
      guidance: { plans: true, signIn: false },
    });
  });

  it('一番上の段の両方 0 はプランを案内しない', () => {
    expect(
      resolveUsageNotice(usage({ tier: 'pro', remaining: { ai: 0, noAi: 0 } }), false)
    ).toEqual({
      message: '今月の利用回数 (AI 解析あり・なし) を使い切りました',
      guidance: { plans: false, signIn: false },
    });
  });

  it('未ログインの両方 0 はログインへ誘う', () => {
    expect(
      resolveUsageNotice(usage({ tier: 'anonymous', remaining: { ai: 0, noAi: 0 } }), false)
    ).toEqual({
      message:
        '今月の利用回数を使い切りました。ログインすると回数が増え、AI 解析も月 1 回お試しできます',
      guidance: { plans: false, signIn: true },
    });
  });

  it('AI なしだけ 0 でスイッチ off なら、AI ありを促す', () => {
    expect(resolveUsageNotice(usage({ remaining: { ai: 1, noAi: 0 } }), false)).toEqual({
      message: '今月の AI 解析なしの回数を使い切りました。AI 解析ありなら使えます',
      guidance: { plans: true, signIn: false },
    });
  });

  it('AI なしだけ 0 でもスイッチ on なら案内しない', () => {
    expect(resolveUsageNotice(usage({ remaining: { ai: 1, noAi: 0 } }), true)).toBeNull();
  });
});

describe('resolveLimitGuidance', () => {
  it.each(['AI_LIMIT_EXCEEDED', 'NO_AI_LIMIT_EXCEEDED', 'DURATION_LIMIT_EXCEEDED'])(
    '%s はプランの画面へ案内する',
    (code) => {
      expect(resolveLimitGuidance(code, 'free')).toEqual({ plans: true, signIn: false });
    }
  );

  it('unlimited にはプランの画面を案内しない', () => {
    expect(resolveLimitGuidance('DURATION_LIMIT_EXCEEDED', 'unlimited')).toEqual({
      plans: false,
      signIn: false,
    });
  });

  it('未ログインはログインの案内も添える', () => {
    expect(resolveLimitGuidance('AI_LIMIT_EXCEEDED', 'anonymous')).toEqual({
      plans: true,
      signIn: true,
    });
  });

  it('段が分からないときはログインを案内しない', () => {
    expect(resolveLimitGuidance('AI_LIMIT_EXCEEDED', null)).toEqual({ plans: true, signIn: false });
  });

  it.each([['IP_LIMIT_EXCEEDED'], ['INVALID_FILE_TYPE'], ['toString'], [null]])(
    '%s は案内しない',
    (code) => {
      expect(resolveLimitGuidance(code, 'anonymous')).toEqual({ plans: false, signIn: false });
    }
  );
});

describe('hasLimitGuidance', () => {
  it('どちらかの案内があれば true', () => {
    expect(hasLimitGuidance({ plans: true, signIn: false })).toBe(true);
    expect(hasLimitGuidance({ plans: false, signIn: true })).toBe(true);
  });

  it('どちらも無ければ false', () => {
    expect(hasLimitGuidance({ plans: false, signIn: false })).toBe(false);
  });
});

describe('resolveErrorGuidance', () => {
  it('長さ超過もエラーも無ければ案内しない', () => {
    expect(resolveErrorGuidance(false, null, 'anonymous')).toEqual({ plans: false, signIn: false });
  });

  it('長さ超過だけなら、長さ超過の案内になる', () => {
    expect(resolveErrorGuidance(true, null, 'free')).toEqual({ plans: true, signIn: false });
    expect(resolveErrorGuidance(true, null, 'anonymous')).toEqual({ plans: true, signIn: true });
  });

  it('エラーのコードだけなら、そのコードの案内になる', () => {
    expect(resolveErrorGuidance(false, 'AI_LIMIT_EXCEEDED', 'free')).toEqual({
      plans: true,
      signIn: false,
    });
    expect(resolveErrorGuidance(false, 'IP_LIMIT_EXCEEDED', 'anonymous')).toEqual({
      plans: false,
      signIn: false,
    });
  });

  it('両方あれば plans と signIn をそれぞれ OR で合わせる', () => {
    expect(resolveErrorGuidance(true, 'IP_LIMIT_EXCEEDED', 'anonymous')).toEqual({
      plans: true,
      signIn: true,
    });
    expect(resolveErrorGuidance(true, 'NO_AI_LIMIT_EXCEEDED', 'free')).toEqual({
      plans: true,
      signIn: false,
    });
  });

  it('一番上の段ではどちらも案内しない', () => {
    expect(resolveErrorGuidance(true, 'AI_LIMIT_EXCEEDED', 'pro')).toEqual({
      plans: false,
      signIn: false,
    });
  });
});

describe('一番上の段', () => {
  it('pro と unlimited は上の段を持たない', () => {
    expect(hasHigherTier('pro')).toBe(false);
    expect(hasHigherTier('unlimited')).toBe(false);
    expect(hasHigherTier('standard')).toBe(true);
    expect(hasHigherTier('free')).toBe(true);
    expect(hasHigherTier('anonymous')).toBe(true);
    expect(hasHigherTier(null)).toBe(true);
  });

  it.each(['AI_LIMIT_EXCEEDED', 'NO_AI_LIMIT_EXCEEDED', 'DURATION_LIMIT_EXCEEDED'])(
    '%s でも pro にはプランの画面を案内しない',
    (code) => {
      expect(resolveLimitGuidance(code, 'pro')).toEqual({ plans: false, signIn: false });
    }
  );
});

describe('動画の長さの判定', () => {
  it('上限ちょうどは超過にしない', () => {
    expect(checkVideoDuration(3600, 3600).exceeded).toBe(false);
  });

  it('上限を 1 秒でも超えたら超過とし、分は動画側を切り上げる', () => {
    expect(checkVideoDuration(3601, 3600)).toEqual({
      exceeded: true,
      videoMinutes: 61,
      limitMinutes: 60,
    });
  });

  it('警告文に動画の分と上限の分を入れる', () => {
    expect(buildDurationExceededMessage(checkVideoDuration(190 * 60, 180 * 60))).toBe(
      'この動画は 190 分で、ご利用の上限 (180 分) を超えています'
    );
  });
});

describe('readLimitErrorCode', () => {
  it.each([
    'AI_LIMIT_EXCEEDED',
    'NO_AI_LIMIT_EXCEEDED',
    'IP_LIMIT_EXCEEDED',
    'DURATION_LIMIT_EXCEEDED',
  ])('%s を取り出す', (code) => {
    expect(readLimitErrorCode({ error: code, message: 'x' })).toBe(code);
  });

  it.each([
    [null],
    ['x'],
    [{}],
    [{ error: 'INVALID_REQUEST' }],
    [{ error: 1 }],
    [{ error: 'toString' }],
    [{ error: 'constructor' }],
  ])('%j は null', (body) => {
    expect(readLimitErrorCode(body)).toBeNull();
  });
});
