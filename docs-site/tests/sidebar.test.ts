import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SIDEBAR_EXCLUDED } from '../src/constants';
import { SITE_STRUCTURE, type StructureNode } from '../src/legacy/site-structure';
import { buildSidebar, escapeInterpolation } from '../src/sidebar';

describe('escapeInterpolation', () => {
  it('Vue の補間記号を文字参照にする', () => {
    expect(escapeInterpolation('sx={{ a }}')).toBe('sx=&#123;&#123; a &#125;&#125;');
  });
});

describe('新しい配置の木', () => {
  let docs: string;

  const write = (path: string, body: string) => {
    mkdirSync(join(docs, path, '..'), { recursive: true });
    writeFileSync(join(docs, path), body);
  };

  const layout = {
    patterns: [
      'services/<service>/requirements/purpose.md',
      'services/<service>/requirements/use-cases/<name>.md',
      'services/<service>/specs/deploy.md',
      'services/<service>/specs/screen/<name>.md',
      'platform/specs/deploy.md',
      'platform/specs/lib/<package>/<name>.md',
      'platform/rules/<name>.md',
    ],
    template: 'services/_template',
    labels: {
      requirements: '要件',
      'purpose.md': '目的',
      'use-cases': 'ユースケース',
      specs: '仕様',
      'deploy.md': 'デプロイ先',
      screen: '画面',
      lib: 'ライブラリ',
      rules: '規約',
    },
  };

  const structure: StructureNode[] = [
    { type: 'page', path: 'README.md', title: 'はじめに' },
    {
      type: 'group',
      title: 'サービス',
      collapsed: false,
      items: [
        {
          type: 'services',
          designDir: 'services',
          cardsDir: 'specs',
          excludeServices: ['platform'],
          designTitle: '設計資料',
          extraDesign: {},
          designLabels: { 'architecture.md': 'アーキテクチャ' },
        },
      ],
    },
    {
      type: 'group',
      title: '共通基盤',
      collapsed: false,
      items: [
        { type: 'platformTree' },
        { type: 'directory', path: 'specs/platform/term', title: '共通の用語' },
      ],
    },
  ];

  beforeEach(() => {
    docs = mkdtempSync(join(tmpdir(), 'docs-site-'));
    write('layout.json', JSON.stringify(layout));
    write('README.md', '# トップ\n');
    write('services/alpha/architecture.md', '# アルファ構成\n');
    write('services/alpha/requirements/purpose.md', '---\nsources: []\n---\n本文のみ\n');
    write('services/alpha/requirements/use-cases/zeta.md', '# 後ろのユースケース\n');
    write('services/alpha/requirements/use-cases/alpha.md', '# 先のユースケース\n');
    write('services/alpha/specs/screen/home.md', '# ホーム画面\n');
    write('services/alpha/specs/deploy.md', '# デプロイ\n');
    write('services/newonly/specs/deploy.md', '# 新規のデプロイ\n');
    write('services/_template/specs/deploy.md', '# 雛形\n');
    write('specs/alpha/screen/old.md', '# 旧画面\n');
    write('specs/platform/term/t.md', '# 共通語\n');
    write('platform/rules/docs.md', '# docs の規約\n');
    write('platform/specs/lib/common/logging.md', '# ログ\n');
    write('platform/specs/deploy.md', '# 共通のデプロイ\n');
  });

  afterEach(() => rmSync(docs, { recursive: true, force: true }));

  const run = () => buildSidebar(docs, [], structure);
  const services = () => run()[1].items ?? [];

  it('サービスの下に新しい配置の木を先に置き、旧配置の項目を続ける', () => {
    const alpha = services().find((item) => item.text === 'alpha');
    expect(alpha?.items?.map((item) => item.text)).toEqual(['要件', '仕様', '設計資料', '画面']);
    const requirements = alpha?.items?.[0];
    expect(requirements).toEqual({
      text: '要件',
      collapsed: false,
      items: [
        { text: '目的', link: '/services/alpha/requirements/purpose' },
        {
          text: 'ユースケース',
          collapsed: false,
          items: [
            { text: '先のユースケース', link: '/services/alpha/requirements/use-cases/alpha' },
            { text: '後ろのユースケース', link: '/services/alpha/requirements/use-cases/zeta' },
          ],
        },
      ],
    });
    const specs = alpha?.items?.[1];
    expect(specs?.items?.map((item) => item.text)).toEqual(['デプロイ先', '画面']);
  });

  it('新しい配置の文書だけのサービスも載せ、雛形は載せない', () => {
    const names = services().map((item) => item.text);
    expect(names).toEqual(['alpha', 'newonly']);
    expect(JSON.stringify(run())).not.toContain('_template');
  });

  it('共通基盤の先頭に platform の木を置き、固定でない名前はそのまま使う', () => {
    const platform = run()[2].items ?? [];
    expect(platform.map((item) => item.text)).toEqual(['仕様', '規約', '共通の用語']);
    const lib = platform[0].items?.find((item) => item.text === 'ライブラリ');
    expect(lib?.items).toEqual([
      {
        text: 'common',
        collapsed: false,
        items: [{ text: 'ログ', link: '/platform/specs/lib/common/logging' }],
      },
    ]);
  });

  it('layout.json が無ければ例外にする', () => {
    rmSync(join(docs, 'layout.json'));
    expect(() => run()).toThrow('配置の定義が見つかりません');
  });

  it('どの配置にも当たらない文書は例外にする', () => {
    write('services/alpha/stray/x.md', '# 迷子\n');
    expect(() => run()).toThrow(/載っていないページ[\s\S]*services\/alpha\/stray\/x\.md/);
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
