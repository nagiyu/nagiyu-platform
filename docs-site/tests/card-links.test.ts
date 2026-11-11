import { adrLink, cardLink, kindLabel, parseCardMeta, sourceLink } from '../src/card-links';

describe('card-links', () => {
  it('sources は GitHub のファイルへのリンクになる', () => {
    expect(sourceLink('services/a/b.ts')).toEqual({
      label: 'services/a/b.ts',
      href: 'https://github.com/nagiyu/nagiyu-platform/blob/develop/services/a/b.ts',
      external: true,
    });
  });

  it('related_adr は docs 内のページへのリンクになり、番号は表示に残す', () => {
    expect(adrLink('services/livetalk/architecture.md#2.12')).toEqual({
      label: 'services/livetalk/architecture.md#2.12',
      href: '/services/livetalk/architecture',
      external: false,
    });
  });

  it('カード ID は仕様カードのページへのリンクになる', () => {
    expect(cardLink('livetalk/term/care').href).toBe('/specs/livetalk/term/care');
  });

  it('kind の表示名。未知の値はそのまま返す', () => {
    expect(kindLabel('batch')).toBe('バッチ');
    expect(kindLabel('screen')).toBe('画面');
    expect(kindLabel('api')).toBe('API');
    expect(kindLabel('other')).toBe('other');
  });

  it('kind があれば表示情報を取り出す', () => {
    const meta = parseCardMeta({
      kind: 'flow',
      service: 'admin',
      sources: ['a.ts', 1],
      related_adr: ['services/admin/architecture.md#ADR-003'],
      related_cards: ['x/y/z'],
      terms: ['p/term/q'],
    });
    expect(meta?.kind).toBe('flow');
    expect(meta?.service).toBe('admin');
    expect(meta?.sources).toHaveLength(1);
    expect(meta?.adrs).toHaveLength(1);
    expect(meta?.cards[0].href).toBe('/specs/x/y/z');
    expect(meta?.terms[0].href).toBe('/specs/p/term/q');
  });

  it('kind が無ければ (仕様カードでなければ) undefined', () => {
    expect(parseCardMeta({ title: 'x' })).toBeUndefined();
  });

  it('欠けたフィールドは空として扱う', () => {
    expect(parseCardMeta({ kind: 'term' })).toEqual({
      kind: 'term',
      service: undefined,
      sources: [],
      adrs: [],
      cards: [],
      terms: [],
    });
  });
});
