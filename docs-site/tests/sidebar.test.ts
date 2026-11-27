import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SIDEBAR_EXCLUDED } from '../src/constants';
import { buildSidebar, escapeInterpolation } from '../src/sidebar';

describe('escapeInterpolation', () => {
  it('Vue の補間記号を文字参照にする', () => {
    expect(escapeInterpolation('sx={{ a }}')).toBe('sx=&#123;&#123; a &#125;&#125;');
  });
});

describe('配置から作る木', () => {
  let docs: string;

  const write = (path: string, body: string) => {
    mkdirSync(join(docs, path, '..'), { recursive: true });
    writeFileSync(join(docs, path), body);
  };

  const layout = {
    patterns: [
      'README.md',
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
      services: 'サービス',
      platform: '共通基盤',
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

  beforeEach(() => {
    docs = mkdtempSync(join(tmpdir(), 'docs-site-'));
    write('layout.json', JSON.stringify(layout));
    write('README.md', '# トップ\n');
    write('services/alpha/requirements/purpose.md', '---\nsources: []\n---\n本文のみ\n');
    write('services/alpha/requirements/use-cases/zeta.md', '# 後ろのユースケース\n');
    write('services/alpha/requirements/use-cases/alpha.md', '# 先のユースケース\n');
    write('services/alpha/specs/screen/home.md', '# ホーム画面\n');
    write('services/alpha/specs/deploy.md', '# デプロイ\n');
    write('services/newonly/specs/deploy.md', '# 新規のデプロイ\n');
    write('services/_template/specs/deploy.md', '# 雛形\n');
    write('platform/rules/docs.md', '# docs の規約\n');
    write('platform/specs/lib/common/logging.md', '# ログ\n');
    write('platform/specs/deploy.md', '# 共通のデプロイ\n');
  });

  afterEach(() => rmSync(docs, { recursive: true, force: true }));

  const run = () => buildSidebar(docs, []);
  const services = () => run()[1].items ?? [];

  it('先頭にホームを置き、サービスと共通基盤を続ける', () => {
    expect(run().map((item) => item.text)).toEqual(['はじめに', 'サービス', '共通基盤']);
    expect(run()[0]).toEqual({ text: 'はじめに', link: '/' });
  });

  it('サービスの下に要件と仕様の木を置く', () => {
    const alpha = services().find((item) => item.text === 'alpha');
    expect(alpha?.items?.map((item) => item.text)).toEqual(['要件', '仕様']);
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

  it('すべてのサービスを名前順に載せ、雛形は載せない', () => {
    const names = services().map((item) => item.text);
    expect(names).toEqual(['alpha', 'newonly']);
    expect(JSON.stringify(run())).not.toContain('_template');
  });

  it('共通基盤の先頭に platform の木を置き、固定でない名前はそのまま使う', () => {
    const platform = run()[2].items ?? [];
    expect(platform.map((item) => item.text)).toEqual(['仕様', '規約']);
    const lib = platform[0].items?.find((item) => item.text === 'ライブラリ');
    expect(lib?.items).toEqual([
      {
        text: 'common',
        collapsed: false,
        items: [{ text: 'ログ', link: '/platform/specs/lib/common/logging' }],
      },
    ]);
  });

  it('ホームの README.md が無ければ「はじめに」を置かない', () => {
    rmSync(join(docs, 'README.md'));
    expect(run().map((item) => item.text)).toEqual(['サービス', '共通基盤']);
  });

  it('配置の木が空なら章を置かない', () => {
    rmSync(join(docs, 'services'), { recursive: true });
    rmSync(join(docs, 'platform'), { recursive: true });
    expect(run().map((item) => item.text)).toEqual(['はじめに']);
  });

  it('章の表示名が layout.json に無ければキーをそのまま使う', () => {
    write('layout.json', JSON.stringify({ ...layout, labels: {} }));
    expect(run().map((item) => item.text)).toEqual(['はじめに', 'services', 'platform']);
  });

  it('同じページが複数の場所に載ると例外にする', () => {
    expect(() => buildSidebar(docs, ['README.md'])).not.toThrow();
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
    const sidebar = buildSidebar(realDocs, SIDEBAR_EXCLUDED);
    expect(sidebar.map((item) => item.text)).toEqual(['はじめに', 'サービス', '共通基盤']);
  });
});
