import { parseSources, sourceLink } from '../src/doc-meta';

describe('doc-meta', () => {
  it('sources は GitHub のファイルへのリンクになる', () => {
    expect(sourceLink('services/a/b.ts')).toEqual({
      label: 'services/a/b.ts',
      href: 'https://github.com/nagiyu/nagiyu-platform/blob/develop/services/a/b.ts',
      external: true,
    });
  });

  it('frontmatter の sources をリンクにし、文字列以外は読み飛ばす', () => {
    const links = parseSources({ sources: ['a.ts', 1, 'b.ts'] });
    expect(links.map((link) => link.label)).toEqual(['a.ts', 'b.ts']);
  });

  it('sources が無い・配列でなければ空', () => {
    expect(parseSources({})).toEqual([]);
    expect(parseSources({ sources: 'a.ts' })).toEqual([]);
  });
});
