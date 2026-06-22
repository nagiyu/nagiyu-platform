import path from 'path';
import {
  getAllArticles,
  getArticle,
  getRelatedArticles,
  getAllTechCategoryMetas,
  getTechCategory,
  getArticlesByCategory,
  getTechCategoriesForArticle,
  getFeaturedArticles,
  getSiteStats,
} from '@/lib/content';

// ESM-only パッケージ（remark/rehype/unified）は Jest の CommonJS 環境では読み込めないためモック化する
jest.mock('remark', () => ({
  remark: jest.fn(() => {
    const processor = {
      use: jest.fn().mockReturnThis(),
      process: jest.fn(async (text: string) => ({ toString: () => text })),
    };
    return processor;
  }),
}));
jest.mock('remark-rehype', () => ({}));
jest.mock('remark-gfm', () => ({}));
jest.mock('rehype-stringify', () => ({}));

// isomorphic-dompurify も jsdom 依存のためモック化する
jest.mock('isomorphic-dompurify', () => {
  const sanitize = jest.fn((html: string) => html);
  return { __esModule: true, default: { sanitize } };
});

// content ディレクトリをテスト用に設定
// FIXTURE_DIR は jest.mock('path') のファクトリ内で計算する（ホイスティング対策）
jest.mock('path', () => {
  const actual = jest.requireActual<typeof path>('path');
  // jest.mock ファクトリは他の変数より先に実行されるため、ここで計算する
  const fixtureDir = actual.join(__dirname, '../../../fixtures/content');
  return {
    ...actual,
    join: (...args: string[]) => {
      // process.cwd() + 'src' + 'content' の組み合わせをフィクスチャに差し替え
      const joined = actual.join(...args);
      const marker = actual.join('src', 'content');
      if (joined.includes(marker)) {
        return joined.replace(actual.join(process.cwd(), 'src', 'content'), fixtureDir);
      }
      return joined;
    },
  };
});

describe('content', () => {
  describe('getAllArticles', () => {
    it('記事一覧を返す', () => {
      const articles = getAllArticles();
      expect(Array.isArray(articles)).toBe(true);
    });

    it('存在しないディレクトリの場合は空配列を返す', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      jest.spyOn(require('fs'), 'existsSync').mockReturnValueOnce(false);
      const articles = getAllArticles();
      expect(articles).toEqual([]);
    });
  });

  describe('getArticle', () => {
    it('存在しない slug でエラーが発生する', async () => {
      await expect(getArticle('nonexistent')).rejects.toThrow('技術記事が見つかりません');
    });

    it('存在する記事を取得できる', async () => {
      const article = await getArticle('test-article-1');
      expect(article.slug).toBe('test-article-1');
      expect(article.title).toBe('Test Article 1');
      expect(article.tags).toContain('AWS');
      expect(article.author).toBe('なぎゆー');
      expect(typeof article.content).toBe('string');
    });
  });

  describe('getAllArticles (詳細)', () => {
    it('publishedAt 降順で並ぶ', () => {
      const articles = getAllArticles();
      expect(articles.length).toBeGreaterThan(0);
      const dates = articles.map((a) => a.publishedAt);
      const sorted = [...dates].sort().reverse();
      expect(dates).toEqual(sorted);
    });
  });

  describe('getRelatedArticles', () => {
    it('タグ一致した別記事を返す', () => {
      const related = getRelatedArticles('test-article-1', ['AWS']);
      expect(related.length).toBeGreaterThan(0);
      // 自分自身は除外される
      expect(related.find((a) => a.slug === 'test-article-1')).toBeUndefined();
      // タグが一致するものが含まれる
      expect(related.find((a) => a.slug === 'test-article-2')).toBeDefined();
    });

    it('一致タグなしの場合は空配列を返す', () => {
      const related = getRelatedArticles('test-article-1', ['NonExistentTag']);
      expect(related).toEqual([]);
    });

    it('limit で件数を制限できる', () => {
      const related = getRelatedArticles('test-article-1', ['AWS'], 1);
      expect(related.length).toBeLessThanOrEqual(1);
    });
  });

  describe('getAllTechCategoryMetas', () => {
    it('実在するハブのメタデータを TECH_CATEGORY_SLUGS の順で返す', () => {
      const metas = getAllTechCategoryMetas();
      // フィクスチャには aws / nextjs のみ存在し、dev-stack は存在しない
      expect(metas.map((m) => m.slug)).toEqual(['aws', 'nextjs']);
      expect(metas[0].title).toBe('AWS インフラ運用ノート');
      expect(typeof metas[0].description).toBe('string');
    });
  });

  describe('getTechCategory', () => {
    it('ハブの解説本文（HTML 変換済み）を取得できる', async () => {
      const category = await getTechCategory('aws');
      expect(category.slug).toBe('aws');
      expect(category.title).toBe('AWS インフラ運用ノート');
      expect(typeof category.content).toBe('string');
    });

    it('存在しないハブ slug でエラーが発生する', async () => {
      await expect(getTechCategory('nonexistent')).rejects.toThrow();
    });
  });

  describe('getArticlesByCategory', () => {
    it('指定カテゴリに所属する記事を publishedAt 降順で返す', () => {
      const articles = getArticlesByCategory('aws');
      // test-article-featured (aws, featured: true), test-article-1 (aws), test-article-2 (aws, nextjs) が該当
      expect(articles.map((a) => a.slug)).toEqual([
        'test-article-featured',
        'test-article-1',
        'test-article-2',
      ]);
    });

    it('単一カテゴリにのみ所属する記事を抽出する', () => {
      const articles = getArticlesByCategory('nextjs');
      expect(articles.map((a) => a.slug)).toEqual(['test-article-2']);
    });

    it('該当記事がないカテゴリでは空配列', () => {
      expect(getArticlesByCategory('dev-stack')).toEqual([]);
    });
  });

  describe('getTechCategoriesForArticle', () => {
    it('記事の categories から実在するハブのメタを返す', () => {
      const metas = getTechCategoriesForArticle(['aws', 'nextjs']);
      expect(metas.map((m) => m.slug)).toEqual(['aws', 'nextjs']);
    });

    it('実在しないハブ slug は除外する', () => {
      const metas = getTechCategoriesForArticle(['aws', 'dev-stack']);
      // dev-stack はフィクスチャに存在しないため除外される
      expect(metas.map((m) => m.slug)).toEqual(['aws']);
    });

    it('categories が未指定なら空配列', () => {
      expect(getTechCategoriesForArticle(undefined)).toEqual([]);
      expect(getTechCategoriesForArticle([])).toEqual([]);
    });
  });

  describe('getFeaturedArticles', () => {
    it('featured: true の記事のみを返す', () => {
      const articles = getFeaturedArticles();
      expect(articles.every((a) => a.featured === true)).toBe(true);
    });

    it('フィクスチャ内の特集記事（test-article-featured）が含まれる', () => {
      const articles = getFeaturedArticles();
      expect(articles.find((a) => a.slug === 'test-article-featured')).toBeDefined();
    });

    it('featured: true を持たない記事は含まれない', () => {
      const articles = getFeaturedArticles();
      // test-article-1, 2, 3 は featured を持たないため除外される
      expect(articles.find((a) => a.slug === 'test-article-1')).toBeUndefined();
      expect(articles.find((a) => a.slug === 'test-article-2')).toBeUndefined();
      expect(articles.find((a) => a.slug === 'test-article-3')).toBeUndefined();
    });

    it('limit 引数で件数を制限できる', () => {
      const articles = getFeaturedArticles(1);
      expect(articles.length).toBeLessThanOrEqual(1);
    });

    it('特集記事がゼロ件でも例外を投げず空配列を返す', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      jest.spyOn(require('fs'), 'existsSync').mockReturnValueOnce(false);
      const articles = getFeaturedArticles();
      expect(Array.isArray(articles)).toBe(true);
    });
  });

  describe('getSiteStats', () => {
    it('articleCount / categoryCount を返す', () => {
      const stats = getSiteStats();
      expect(typeof stats.articleCount).toBe('number');
      expect(typeof stats.categoryCount).toBe('number');
    });

    it('articleCount はフィクスチャの記事数と一致する', () => {
      const stats = getSiteStats();
      const articles = getAllArticles();
      expect(stats.articleCount).toBe(articles.length);
    });

    it('categoryCount はフィクスチャ内の実在するカテゴリ数と一致する', () => {
      const stats = getSiteStats();
      const categories = getAllTechCategoryMetas();
      expect(stats.categoryCount).toBe(categories.length);
    });
  });
});
