import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SIDEBAR_EXCLUDED } from '../src/constants';
import { SITE_STRUCTURE, type StructureNode } from '../src/site-structure';
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

  const write = (path: string, body: string) => {
    mkdirSync(join(docs, path, '..'), { recursive: true });
    writeFileSync(join(docs, path), body);
  };

  beforeEach(() => {
    docs = mkdtempSync(join(tmpdir(), 'docs-site-'));
    write('README.md', '# トップ\n');
    write('guide/README.md', '# ガイド\n');
    write('guide/one.md', '---\ntitle: 無視される\n---\n# 一\n');
    write('guide/deep/two.md', '# 二\n');
    write('loose/x.md', '# 入口なし配下\n');
    write('templates/tpl.md', '# 雛形\n');
    write('note.txt', 'md ではない');
    mkdirSync(join(docs, 'empty'));
    write('services/alpha/README.md', '# アルファ\n');
    write('services/alpha/design.md', '# 設計\n');
    write('services/beta/design.md', '# ベータ設計\n');
    write('services/beta/arch.md', '# ベータ アーキテクチャ\n');
    write('services/beta/req.md', '# ベータ 要件\n');
    write('specs/alpha/screen/top.md', '# トップ画面\n');
    write('specs/alpha/flow/run.md', '# 実行\n');
    write('specs/gamma/batch/job.md', '# ジョブ\n');
    write('specs/platform/term/t.md', '# 共通語\n');
    write('extra/ext.md', '# 追加\n');
    write('more/m.md', '# もっと\n');
  });

  afterEach(() => rmSync(docs, { recursive: true, force: true }));

  const run = (structure: readonly StructureNode[], excluded: string[] = ['templates/**']) =>
    buildSidebar(docs, excluded, structure);

  const everything: StructureNode[] = [
    { type: 'page', path: 'README.md', title: 'はじめに' },
    { type: 'directory', path: 'guide' },
    { type: 'directory', path: 'loose' },
    { type: 'directory', path: 'empty' },
    { type: 'directory', path: 'specs/platform/term', title: '共通の用語', collapsed: false },
    { type: 'files', dir: 'more' },
    {
      type: 'services',
      designDir: 'services',
      cardsDir: 'specs',
      excludeServices: ['platform'],
      designTitle: '設計資料',
      extraDesign: { gamma: ['extra/ext.md'] },
      designLabels: { 'req.md': '要件', 'arch.md': '構成' },
    },
  ];

  it('ページとディレクトリを章立てどおりに並べる', () => {
    const sidebar = run(
      everything.filter((node) => node.type !== 'files' && node.type !== 'services'),
      ['templates/**', 'extra/**', 'more/**', 'services/**', 'specs/alpha/**', 'specs/gamma/**']
    );
    expect(sidebar[0]).toEqual({ text: 'はじめに', link: '/' });
    expect(sidebar[1]).toEqual({
      text: 'ガイド',
      link: '/guide/',
      collapsed: true,
      items: [
        { text: '一', link: '/guide/one' },
        { text: 'deep', collapsed: true, items: [{ text: '二', link: '/guide/deep/two' }] },
      ],
    });
  });

  it('入口の無いディレクトリは名前で見出しを作り、空のディレクトリは載せない', () => {
    const sidebar = run(
      everything.filter((node) => node.type !== 'files' && node.type !== 'services'),
      ['templates/**', 'extra/**', 'more/**', 'services/**', 'specs/alpha/**', 'specs/gamma/**']
    );
    const loose = sidebar.find((item) => item.text === 'loose');
    expect(loose?.link).toBeUndefined();
    expect(JSON.stringify(sidebar)).not.toContain('empty');
    expect(sidebar.find((item) => item.text === '共通の用語')?.collapsed).toBe(false);
  });

  it('サービスを設計資料とカードの和集合から作り、中身の無い小見出しは出さない', () => {
    const services = run(everything)
      .filter((item) => item.text !== 'ガイド')
      .slice();
    const alpha = services.find((item) => item.text === 'アルファ');
    expect(alpha).toEqual({
      text: 'アルファ',
      link: '/services/alpha/',
      collapsed: true,
      items: [
        {
          text: '設計資料',
          collapsed: false,
          items: [{ text: '設計', link: '/services/alpha/design' }],
        },
        {
          text: '画面',
          collapsed: false,
          items: [{ text: 'トップ画面', link: '/specs/alpha/screen/top' }],
        },
        {
          text: '処理の流れ',
          collapsed: false,
          items: [{ text: '実行', link: '/specs/alpha/flow/run' }],
        },
      ],
    });
    const names = services.map((item) => item.text);
    expect(names.indexOf('アルファ')).toBeLessThan(names.indexOf('beta'));
    expect(names.indexOf('beta')).toBeLessThan(names.indexOf('gamma'));
    expect(names).not.toContain('platform');
    const gamma = services.find((item) => item.text === 'gamma');
    expect(gamma?.link).toBeUndefined();
    expect(gamma?.items?.map((item) => item.text)).toEqual(['設計資料', 'バッチ']);
  });

  it('設計資料は対応表の名前と順で並べ、表に無いものは見出しのまま後ろに置く', () => {
    const beta = run(everything).find((item) => item.text === 'beta');
    expect(beta?.items?.[0]).toEqual({
      text: '設計資料',
      collapsed: false,
      items: [
        { text: '要件', link: '/services/beta/req' },
        { text: '構成', link: '/services/beta/arch' },
        { text: 'ベータ設計', link: '/services/beta/design' },
      ],
    });
  });

  it('グループは空なら出さず、files は除外指定を除く', () => {
    const sidebar = run(
      [
        { type: 'group', title: '空', collapsed: true, items: [{ type: 'files', dir: 'nothing' }] },
        {
          type: 'group',
          title: '章',
          collapsed: true,
          items: [{ type: 'files', dir: 'extra', exclude: ['extra/ext.md'] }],
        },
      ],
      ['**']
    );
    expect(sidebar).toEqual([]);
  });

  it('載らないページがあれば一覧つきで例外にする', () => {
    expect(() => run(everything.slice(0, 1))).toThrow(
      /サイドバーに載っていないページ[\s\S]*guide\/one\.md/
    );
  });

  it('同じページが 2 か所に載れば例外にする', () => {
    expect(() => run([...everything, { type: 'page', path: 'extra/ext.md' }])).toThrow(
      /複数の場所[\s\S]*extra\/ext\.md/
    );
  });

  it('章立てのページが無ければ例外にする', () => {
    expect(() => run([{ type: 'page', path: 'missing.md' }])).toThrow('docs にありません');
  });

  it('docs が無ければエラー', () => {
    expect(() => buildSidebar(join(docs, 'missing'), [], [])).toThrow(
      'docs ディレクトリが見つかりません'
    );
  });
});

describe('実際の docs の章立て', () => {
  const realDocs = join(__dirname, '../../docs');

  it('漏れも重複もなく生成できる', () => {
    const sidebar = buildSidebar(realDocs, SIDEBAR_EXCLUDED, SITE_STRUCTURE);
    expect(sidebar.map((item) => item.text)).toEqual([
      'はじめに',
      'サービス',
      '共通基盤',
      '開発の進め方',
    ]);
    const services = sidebar[1].items ?? [];
    const devSync = services.find((item) => item.text === 'dev-sync');
    expect(JSON.stringify(devSync)).toContain('/development/dev-sync');
    const guide = JSON.stringify(sidebar[3]);
    expect(guide).not.toContain('/development/dev-sync');
    expect(guide).toContain('仕様カードの書き方');
  });

  it('サービスの設計資料にサービス名を繰り返さない', () => {
    const sidebar = buildSidebar(realDocs, SIDEBAR_EXCLUDED, SITE_STRUCTURE);
    const shareTogether = (sidebar[1].items ?? []).find((item) =>
      item.link?.includes('/services/share-together/')
    );
    const design = shareTogether?.items?.find((item) => item.text === '設計資料');
    expect(design?.items?.map((item) => item.text)).toEqual([
      '要件定義',
      '外部設計',
      'アーキテクチャ',
    ]);
  });
});
