import {
  TIER_DESCRIPTIONS,
  TIER_LABELS,
  confidenceToStars,
  formatLastReferenced,
} from '@/lib/memory/format';

describe('confidenceToStars', () => {
  it('0.0 → 0、1.0 → 5', () => {
    expect(confidenceToStars(0)).toBe(0);
    expect(confidenceToStars(1)).toBe(5);
  });

  it('中間値を四捨五入', () => {
    expect(confidenceToStars(0.5)).toBe(3);
    expect(confidenceToStars(0.8)).toBe(4);
    expect(confidenceToStars(0.7)).toBe(4);
  });

  it('範囲外はクランプ', () => {
    expect(confidenceToStars(-1)).toBe(0);
    expect(confidenceToStars(2)).toBe(5);
  });
});

describe('formatLastReferenced', () => {
  it('undefined は「まだ話していない」', () => {
    expect(formatLastReferenced(undefined)).toBe('まだ話していない');
  });

  it('YYYY/MM/DD 形式（ゼロ埋め）', () => {
    const ms = new Date(2026, 0, 5).getTime();
    expect(formatLastReferenced(ms)).toBe('2026/01/05');
  });
});

describe('TIER_LABELS / TIER_DESCRIPTIONS', () => {
  it('全 Tier のラベルと説明を持つ', () => {
    for (const tier of ['A', 'B', 'C', 'D'] as const) {
      expect(TIER_LABELS[tier]).toBeTruthy();
      expect(TIER_DESCRIPTIONS[tier]).toBeTruthy();
    }
  });
});
