import { USAGE_LIMITS, getUsageLimit, resolveUsageTier } from '../../../src/libs/usage-plan.js';

describe('resolveUsageTier', () => {
  it('未ログインは anonymous になる', () => {
    expect(resolveUsageTier(undefined)).toBe('anonymous');
  });

  it('ログイン済みで権限が無ければ free になる', () => {
    expect(resolveUsageTier([])).toBe('free');
    expect(resolveUsageTier(['user-manager'])).toBe('free');
  });

  it('quick-clip:standard を持つロールがあれば standard になる', () => {
    expect(resolveUsageTier(['quick-clip-standard'])).toBe('standard');
    expect(resolveUsageTier(['user-manager', 'quick-clip-standard'])).toBe('standard');
  });

  it('quick-clip:pro を持つロールがあれば、standard の権限も持っていても pro になる', () => {
    expect(resolveUsageTier(['quick-clip-pro'])).toBe('pro');
    expect(resolveUsageTier(['quick-clip-standard', 'quick-clip-pro'])).toBe('pro');
  });
});

describe('resolveUsageTier (unlimited)', () => {
  it('quick-clip:unlimited を持つロールがあれば unlimited になる', () => {
    expect(resolveUsageTier(['quick-clip-unlimited'])).toBe('unlimited');
  });

  it('プロと両方持っていても unlimited になる', () => {
    expect(resolveUsageTier(['quick-clip-pro', 'quick-clip-unlimited'])).toBe('unlimited');
    expect(resolveUsageTier(['quick-clip-unlimited', 'quick-clip-standard'])).toBe('unlimited');
  });
});

describe('getUsageLimit', () => {
  it('段ごとの上限を返す', () => {
    expect(getUsageLimit('anonymous')).toEqual({
      aiPerMonth: 0,
      noAiPerMonth: 3,
      maxDurationSec: 60 * 60,
    });
    expect(getUsageLimit('free')).toBe(USAGE_LIMITS.free);
    expect(getUsageLimit('standard').maxDurationSec).toBe(180 * 60);
  });

  it('unlimited は月の回数が上限なし (null) で、長さはプロを参照する', () => {
    expect(getUsageLimit('unlimited')).toEqual({
      aiPerMonth: null,
      noAiPerMonth: null,
      maxDurationSec: USAGE_LIMITS.pro.maxDurationSec,
    });
    expect(JSON.parse(JSON.stringify(getUsageLimit('unlimited')))).toEqual(
      getUsageLimit('unlimited')
    );
  });
});
