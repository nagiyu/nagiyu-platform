import { extractTitle, readmeToIndex, toLink } from '../src/sidebar-utils';

describe('extractTitle', () => {
  it('最初の h1 を返す', () => {
    expect(extractTitle('前置き\n# 見出し\n## 小見出し')).toBe('見出し');
  });

  it('コードブロック内の # は見出しとして拾わない', () => {
    expect(extractTitle('```bash\n# コメント\n```\n# 本物')).toBe('本物');
  });

  it('見出しが無ければ undefined', () => {
    expect(extractTitle('## h2 だけ')).toBeUndefined();
  });

  it('末尾の # を取り除く', () => {
    expect(extractTitle('# 見出し ##')).toBe('見出し');
  });
});

describe('toLink / readmeToIndex', () => {
  it('README.md はディレクトリの URL になる', () => {
    expect(toLink('README.md')).toBe('/');
    expect(toLink('specs/README.md')).toBe('/specs/');
  });

  it('通常のファイルは拡張子を除く', () => {
    expect(toLink('development/rules.md')).toBe('/development/rules');
  });

  it('README.md だけを index.md に書き換える', () => {
    expect(readmeToIndex('README.md')).toBe('index.md');
    expect(readmeToIndex('a/b/README.md')).toBe('a/b/index.md');
    expect(readmeToIndex('a/NOT-README.md')).toBe('a/NOT-README.md');
  });
});
