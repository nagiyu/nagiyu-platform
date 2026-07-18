import * as fs from 'fs';
import * as path from 'path';
import { RETIRED_ARTICLE_REDIRECTS, buildRedirects } from '../../../src/lib/redirects';

/**
 * src/content/tech/ 配下の .md ファイルから slug 一覧を取得するヘルパー
 */
function getActualArticleSlugs(): Set<string> {
  const techDir = path.join(process.cwd(), 'src', 'content', 'tech');
  const files = fs.readdirSync(techDir).filter((f) => f.endsWith('.md'));
  return new Set(files.map((f) => f.replace(/\.md$/, '')));
}

describe('RETIRED_ARTICLE_REDIRECTS', () => {
  describe('source の重複・競合チェック', () => {
    it('source に現存する記事 slug と重複がないこと', () => {
      const articleSlugs = getActualArticleSlugs();
      const conflictingSources = RETIRED_ARTICLE_REDIRECTS.filter(({ source }) => {
        // source は /tech/{slug} 形式
        const match = source.match(/^\/tech\/([^/]+)$/);
        if (!match) return false;
        return articleSlugs.has(match[1]);
      });

      expect(conflictingSources).toHaveLength(0);
    });

    it('source の重複がないこと', () => {
      const sources = RETIRED_ARTICLE_REDIRECTS.map(({ source }) => source);
      const uniqueSources = new Set(sources);
      expect(uniqueSources.size).toBe(sources.length);
    });
  });

  describe('destination の実在チェック', () => {
    it('/tech/{slug} 形式の destination に実在する記事 slug が対応していること', () => {
      const articleSlugs = getActualArticleSlugs();
      const techArticleDestinations = RETIRED_ARTICLE_REDIRECTS.filter(({ destination }) =>
        /^\/tech\/[^/]+$/.test(destination)
      ).filter(({ destination }) => {
        // /tech/category/* は除外
        return !destination.startsWith('/tech/category/');
      });

      const notFound = techArticleDestinations.filter(({ destination }) => {
        const slug = destination.replace('/tech/', '');
        return !articleSlugs.has(slug);
      });

      expect(notFound).toHaveLength(0);
    });

    it('destination が /tech/category/* を指さないこと（カテゴリハブは廃止済み）', () => {
      const categoryDestinations = RETIRED_ARTICLE_REDIRECTS.filter(({ destination }) =>
        destination.startsWith('/tech/category/')
      );
      expect(categoryDestinations).toHaveLength(0);
    });

    it('destination が /services・/tech/tags を指さないこと', () => {
      const removed = RETIRED_ARTICLE_REDIRECTS.filter(
        ({ destination }) =>
          destination.startsWith('/services') || destination.startsWith('/tech/tags')
      );
      expect(removed).toHaveLength(0);
    });
  });

  describe('/services・/tech/tags・/tech/category の /tech への集約リダイレクト', () => {
    it('/services と /services/:path* が /tech へ寄せられていること', () => {
      const map = new Map(RETIRED_ARTICLE_REDIRECTS.map((r) => [r.source, r.destination]));
      expect(map.get('/services')).toBe('/tech');
      expect(map.get('/services/:path*')).toBe('/tech');
    });

    it('/tech/tags/:tag* が /tech へ寄せられていること', () => {
      const map = new Map(RETIRED_ARTICLE_REDIRECTS.map((r) => [r.source, r.destination]));
      expect(map.get('/tech/tags/:tag*')).toBe('/tech');
    });

    it('/tech/category/:category* が /tech へ寄せられていること', () => {
      const map = new Map(RETIRED_ARTICLE_REDIRECTS.map((r) => [r.source, r.destination]));
      expect(map.get('/tech/category/:category*')).toBe('/tech');
    });
  });

  describe('マッピング件数', () => {
    it('16 件のリダイレクトが定義されていること', () => {
      expect(RETIRED_ARTICLE_REDIRECTS).toHaveLength(16);
    });
  });
});

describe('buildRedirects', () => {
  it('permanent: true の Next.js Redirect 配列を返すこと', () => {
    const redirects = buildRedirects();

    expect(redirects.length).toBe(RETIRED_ARTICLE_REDIRECTS.length);
    for (const redirect of redirects) {
      expect(redirect.permanent).toBe(true);
      expect(typeof redirect.source).toBe('string');
      expect(typeof redirect.destination).toBe('string');
    }
  });

  it('buildRedirects() の source/destination が RETIRED_ARTICLE_REDIRECTS と一致すること', () => {
    const redirects = buildRedirects();

    RETIRED_ARTICLE_REDIRECTS.forEach(({ source, destination }, index) => {
      expect(redirects[index].source).toBe(source);
      expect(redirects[index].destination).toBe(destination);
    });
  });

  it('特定のリダイレクトが含まれること（スモークテスト）', () => {
    const redirects = buildRedirects();
    const redirectMap = new Map(redirects.map((r) => [r.source, r.destination]));

    expect(redirectMap.get('/tech/eventbridge-scheduler')).toBe(
      '/tech/eventbridge-rule-scheduling'
    );
    expect(redirectMap.get('/tech/video-codec-comparison')).toBe('/tech');
    expect(redirectMap.get('/tech/zod-runtime-validation')).toBe('/tech/discriminated-union-api');
    // カテゴリハブ廃止後は /tech へ集約
    expect(redirectMap.get('/tech/aws-ses-transactional-mail')).toBe('/tech');
    expect(redirectMap.get('/tech/category/:category*')).toBe('/tech');
  });
});
