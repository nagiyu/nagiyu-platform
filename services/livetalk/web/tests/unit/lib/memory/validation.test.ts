import {
  MEMORY_CATEGORY_MAX_LENGTH,
  MEMORY_CONTENT_MAX_LENGTH,
  VISIBLE_TIERS,
  parseTierQuery,
  validateMemoryPatch,
} from '@/lib/memory/validation';

describe('validateMemoryPatch', () => {
  it('content のみで成功（trim される）', () => {
    const r = validateMemoryPatch({ content: '  コーヒーが好き  ' });
    expect(r).toEqual({ ok: true, value: { content: 'コーヒーが好き' } });
  });

  it('category のみで成功', () => {
    const r = validateMemoryPatch({ category: 'food' });
    expect(r).toEqual({ ok: true, value: { category: 'food' } });
  });

  it('content と category の両方', () => {
    const r = validateMemoryPatch({ content: 'A', category: 'hobby' });
    expect(r).toEqual({ ok: true, value: { content: 'A', category: 'hobby' } });
  });

  it('オブジェクトでなければ EMPTY_PATCH', () => {
    expect(validateMemoryPatch(null)).toEqual({ ok: false, error: 'EMPTY_PATCH' });
    expect(validateMemoryPatch('x')).toEqual({ ok: false, error: 'EMPTY_PATCH' });
  });

  it('content も category も無ければ EMPTY_PATCH', () => {
    expect(validateMemoryPatch({})).toEqual({ ok: false, error: 'EMPTY_PATCH' });
  });

  it('content が文字列でなければ INVALID_CONTENT', () => {
    expect(validateMemoryPatch({ content: 123 })).toEqual({ ok: false, error: 'INVALID_CONTENT' });
  });

  it('content が空白のみなら INVALID_CONTENT', () => {
    expect(validateMemoryPatch({ content: '   ' })).toEqual({
      ok: false,
      error: 'INVALID_CONTENT',
    });
  });

  it('content が長すぎると CONTENT_TOO_LONG', () => {
    const long = 'a'.repeat(MEMORY_CONTENT_MAX_LENGTH + 1);
    expect(validateMemoryPatch({ content: long })).toEqual({
      ok: false,
      error: 'CONTENT_TOO_LONG',
    });
  });

  it('category が文字列でなければ INVALID_CATEGORY', () => {
    expect(validateMemoryPatch({ category: 5 })).toEqual({ ok: false, error: 'INVALID_CATEGORY' });
  });

  it('category に不正文字があれば INVALID_CATEGORY', () => {
    expect(validateMemoryPatch({ category: 'Food!' })).toEqual({
      ok: false,
      error: 'INVALID_CATEGORY',
    });
    expect(validateMemoryPatch({ category: '好み' })).toEqual({
      ok: false,
      error: 'INVALID_CATEGORY',
    });
  });

  it('category が長すぎると CATEGORY_TOO_LONG', () => {
    const long = 'a'.repeat(MEMORY_CATEGORY_MAX_LENGTH + 1);
    expect(validateMemoryPatch({ category: long })).toEqual({
      ok: false,
      error: 'CATEGORY_TOO_LONG',
    });
  });
});

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
