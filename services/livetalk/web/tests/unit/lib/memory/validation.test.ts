import { VISIBLE_TIERS, parseTierQuery } from '@/lib/memory/validation';

describe('parseTierQuery', () => {
  it('null は許容（tier: null）', () => {
    expect(parseTierQuery(null)).toEqual({ ok: true, tier: null });
  });

  it('空文字は許容（tier: null）', () => {
    expect(parseTierQuery('')).toEqual({ ok: true, tier: null });
  });

  it('有効な Tier を受理', () => {
    expect(parseTierQuery('A')).toEqual({ ok: true, tier: 'A' });
    expect(parseTierQuery('D')).toEqual({ ok: true, tier: 'D' });
  });

  it('不正な値は失敗', () => {
    expect(parseTierQuery('Z')).toEqual({ ok: false });
  });
});

describe('VISIBLE_TIERS', () => {
  it('A/B/C のみで D を含まない', () => {
    expect(VISIBLE_TIERS).toEqual(['A', 'B', 'C']);
  });
});
