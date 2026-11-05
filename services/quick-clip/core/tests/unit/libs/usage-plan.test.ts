import { USAGE_LIMITS, getUsageLimit, resolveUsageTier } from '../../../src/libs/usage-plan.js';

describe('resolveUsageTier', () => {
  it('未ログインは anonymous になる', () => {
    expect(resolveUsageTier(undefined)).toBe('anonymous');
  });

  it('ログイン済みで権限が無ければ free になる', () => {
    expect(resolveUsageTier([])).toBe('free');
    expect(resolveUsageTier(['user-manager'])).toBe('free');
  });

  it('quick-clip:premium を持つロールがあれば premium になる', () => {
    expect(resolveUsageTier(['quick-clip-premium'])).toBe('premium');
    expect(resolveUsageTier(['user-manager', 'quick-clip-premium'])).toBe('premium');
  });
});

describe('getUsageLimit', () => {
  it('段ごとの上限を返す', () => {
    expect(getUsageLimit('anonymous')).toEqual({
      aiPerMonth: 0,
      noAiPerMonth: 3,
      maxDurationSec: 3600,
    });
    expect(getUsageLimit('free')).toBe(USAGE_LIMITS.free);
    expect(getUsageLimit('premium').maxDurationSec).toBe(240 * 60);
  });
});
