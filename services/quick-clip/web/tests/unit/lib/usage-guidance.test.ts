import {
  buildDurationExceededMessage,
  checkVideoDuration,
  formatRemaining,
  hasAiRemaining,
  hasHigherTier,
  parseUsageSummary,
  readLimitErrorCode,
  resolveAiUnavailableMessage,
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
    expect(resolveAiUnavailableMessage(unlimited)).toBeNull();
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

describe('resolveAiUnavailableMessage', () => {
  it('残りがあれば null', () => {
    expect(resolveAiUnavailableMessage(usage())).toBeNull();
  });

  it('未ログインはログインへ誘う文言', () => {
    expect(
      resolveAiUnavailableMessage(usage({ tier: 'anonymous', remaining: { ai: 0, noAi: 3 } }))
    ).toBe('ログインすると AI 解析を月 1 回お試しできます');
  });

  it('ログイン済みは使い切りの文言', () => {
    expect(resolveAiUnavailableMessage(usage({ remaining: { ai: 0, noAi: 3 } }))).toBe(
      '今月の AI 解析の回数を使い切りました'
    );
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

  it.each([['IP_LIMIT_EXCEEDED'], ['INVALID_FILE_TYPE'], ['toString'], [null]])('%s は案内しない', (code) => {
    expect(resolveLimitGuidance(code, 'anonymous')).toEqual({ plans: false, signIn: false });
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
  ])(
    '%j は null',
    (body) => {
      expect(readLimitErrorCode(body)).toBeNull();
    }
  );
});
