import { adrLink, kindLabel, parseLegacyMeta } from '../../src/legacy/card-meta';

describe('legacy/card-meta', () => {
  it('related_adr は docs 内のページへのリンクになり、番号は表示に残す', () => {
    expect(adrLink('services/livetalk/architecture.md#2.12')).toEqual({
      label: 'services/livetalk/architecture.md#2.12',
      href: '/services/livetalk/architecture',
      external: false,
    });
  });

  it('kind の表示名。未知の値はそのまま返す', () => {
    expect(kindLabel('batch')).toBe('バッチ');
    expect(kindLabel('screen')).toBe('画面');
    expect(kindLabel('api')).toBe('API');
    expect(kindLabel('other')).toBe('other');
  });

  it('kind があれば旧カードの情報を取り出す', () => {
    const meta = parseLegacyMeta({
      kind: 'flow',
      service: 'admin',
      related_adr: ['services/admin/architecture.md#ADR-003', 1],
    });
    expect(meta?.kind).toBe('flow');
    expect(meta?.service).toBe('admin');
    expect(meta?.adrs).toHaveLength(1);
  });

  it('kind が無ければ (旧カードでなければ) undefined', () => {
    expect(parseLegacyMeta({ title: 'x' })).toBeUndefined();
  });

  it('欠けたフィールドは空として扱う', () => {
    expect(parseLegacyMeta({ kind: 'term' })).toEqual({
      kind: 'term',
      service: undefined,
      adrs: [],
    });
  });
});
