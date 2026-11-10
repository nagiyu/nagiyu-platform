import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildSidebar,
  escapeInterpolation,
  extractTitle,
  readmeToIndex,
  toLink,
} from '../src/sidebar';

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

describe('escapeInterpolation', () => {
  it('Vue の補間記号を文字参照にする', () => {
    expect(escapeInterpolation('sx={{ a }}')).toBe('sx=&#123;&#123; a &#125;&#125;');
  });
});

describe('buildSidebar', () => {
  let docs: string;

  beforeEach(() => {
    docs = mkdtempSync(join(tmpdir(), 'docs-site-'));
    mkdirSync(join(docs, 'guide', 'deep'), { recursive: true });
    mkdirSync(join(docs, 'templates'));
    mkdirSync(join(docs, 'loose'));
    mkdirSync(join(docs, 'empty'));
    writeFileSync(join(docs, 'README.md'), '# トップ\n');
    writeFileSync(join(docs, 'b.md'), '# B 文書\n');
    writeFileSync(join(docs, 'a.md'), '---\ntitle: 無視される\n---\n# A 文書\n');
    writeFileSync(join(docs, 'no-title.md'), '本文だけ\n');
    writeFileSync(join(docs, 'note.txt'), 'md ではない');
    writeFileSync(join(docs, 'guide', 'README.md'), '# ガイド\n');
    writeFileSync(join(docs, 'guide', 'one.md'), '# 一\n');
    writeFileSync(join(docs, 'guide', 'deep', 'two.md'), '# 二\n');
    writeFileSync(join(docs, 'templates', 'tpl.md'), '# 雛形\n');
    writeFileSync(join(docs, 'loose', 'x.md'), '# 入口なし配下\n');
  });

  afterEach(() => rmSync(docs, { recursive: true, force: true }));

  it('ディレクトリ構成から入れ子のサイドバーを作る', () => {
    const sidebar = buildSidebar(docs, ['templates/**']);

    expect(sidebar[0]).toEqual({ text: 'トップ', link: '/' });
    expect(sidebar.slice(1, 4).map((item) => item.text)).toEqual(['A 文書', 'B 文書', 'no-title']);

    const guide = sidebar.find((item) => item.text === 'ガイド');
    expect(guide).toEqual({
      text: 'ガイド',
      link: '/guide/',
      collapsed: true,
      items: [
        { text: '一', link: '/guide/one' },
        {
          text: 'deep',
          collapsed: true,
          items: [{ text: '二', link: '/guide/deep/two' }],
        },
      ],
    });
  });

  it('除外したディレクトリ、空のディレクトリ、md 以外は載せない', () => {
    const texts = JSON.stringify(buildSidebar(docs, ['templates/**']));
    expect(texts).not.toContain('雛形');
    expect(texts).not.toContain('empty');
    expect(texts).not.toContain('note');
  });

  it('README.md が無いディレクトリはディレクトリ名で見出しを作り、リンクを持たない', () => {
    const loose = buildSidebar(docs, []).find((item) => item.text === 'loose');
    expect(loose?.link).toBeUndefined();
    expect(loose?.items).toEqual([{ text: '入口なし配下', link: '/loose/x' }]);
  });

  it('docs が無ければエラー', () => {
    expect(() => buildSidebar(join(docs, 'missing'), [])).toThrow(
      'docs ディレクトリが見つかりません'
    );
  });

  it('ルートの README.md が無ければトップのリンクを作らない', () => {
    rmSync(join(docs, 'README.md'));
    expect(buildSidebar(docs, ['templates/**'])[0].link).not.toBe('/');
  });
});
