import path from 'path';
import {
  getAllArticles,
  getArticle,
  getRelatedArticles,
  getFeaturedArticles,
  getCategoryLabel,
  CATEGORY_LABEL_MAP,
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

  describe('getCategoryLabel', () => {
    it('aws → AWS に変換される', () => {
      expect(getCategoryLabel('aws')).toBe('AWS');
    });

    it('nextjs → Next.js に変換される', () => {
      expect(getCategoryLabel('nextjs')).toBe('Next.js');
    });

    it('dev-stack → 開発スタック に変換される', () => {
      expect(getCategoryLabel('dev-stack')).toBe('開発スタック');
    });

    it('未知の slug はそのまま返す', () => {
      expect(getCategoryLabel('unknown-category')).toBe('unknown-category');
    });

    it('CATEGORY_LABEL_MAP に定義された slug すべてが正しく変換される', () => {
      for (const [slug, label] of Object.entries(CATEGORY_LABEL_MAP)) {
        expect(getCategoryLabel(slug)).toBe(label);
      }
    });
  });
});
