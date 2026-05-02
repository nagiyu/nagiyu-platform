import path from 'path';
import {
  getAllServiceSlugs,
  getServiceDocument,
  getAllArticles,
  getArticle,
  getRelatedArticles,
  getAllTags,
  getArticlesByTag,
  getTagBySlug,
  tagToSlug,
  isLinkableTag,
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
  describe('getAllServiceSlugs', () => {
    it('サービスディレクトリの slug 一覧を返す', () => {
      const slugs = getAllServiceSlugs();
      expect(Array.isArray(slugs)).toBe(true);
      expect(slugs).toContain('tools');
    });

    it('存在しないディレクトリの場合は空配列を返す', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      jest.spyOn(require('fs'), 'existsSync').mockReturnValueOnce(false);
      const slugs = getAllServiceSlugs();
      expect(slugs).toEqual([]);
    });
  });

  describe('getServiceDocument', () => {
    it('tools の overview ドキュメントを取得できる', async () => {
      const doc = await getServiceDocument('tools', 'overview');
      expect(doc.slug).toBe('tools');
      expect(doc.type).toBe('overview');
      expect(typeof doc.content).toBe('string');
      expect(typeof doc.title).toBe('string');
    });

    it('存在しない slug でエラーが発生する', async () => {
      await expect(getServiceDocument('nonexistent', 'overview')).rejects.toThrow(
        'サービスドキュメントが見つかりません'
      );
    });
  });

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

  describe('getAllTags', () => {
    it('全タグを記事数の多い順に返す', () => {
      const tags = getAllTags();
      expect(tags.length).toBeGreaterThan(0);
      // 件数降順
      for (let i = 1; i < tags.length; i++) {
        expect(tags[i - 1].count).toBeGreaterThanOrEqual(tags[i].count);
      }
      // AWS は複数記事にあるはず
      const aws = tags.find((t) => t.tag === 'AWS');
      expect(aws?.count).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getArticlesByTag', () => {
    it('指定タグの記事を返す', () => {
      const articles = getArticlesByTag('AWS');
      expect(articles.length).toBeGreaterThan(0);
      articles.forEach((a) => expect(a.tags).toContain('AWS'));
    });

    it('存在しないタグでは空配列', () => {
      expect(getArticlesByTag('NonExistentTag')).toEqual([]);
    });
  });

  describe('tagToSlug', () => {
    it('小文字化してスペースをハイフンに置換する', () => {
      expect(tagToSlug('AWS Batch')).toBe('aws-batch');
      expect(tagToSlug('App Router')).toBe('app-router');
    });

    it('スラッシュをハイフンに置換する', () => {
      expect(tagToSlug('CI/CD')).toBe('ci-cd');
    });

    it('連続スペースは 1 つのハイフンに集約する', () => {
      expect(tagToSlug('Foo  Bar')).toBe('foo-bar');
    });

    it('ピリオドはそのまま残す', () => {
      expect(tagToSlug('Next.js')).toBe('next.js');
    });
  });

  describe('isLinkableTag', () => {
    it('ASCII にスラッグ化できるタグは true', () => {
      expect(isLinkableTag('AWS')).toBe(true);
      expect(isLinkableTag('AWS Batch')).toBe(true);
      expect(isLinkableTag('Next.js')).toBe(true);
      expect(isLinkableTag('CI/CD')).toBe(true);
    });

    it('日本語タグは false', () => {
      expect(isLinkableTag('セキュリティ')).toBe(false);
      expect(isLinkableTag('通知')).toBe(false);
    });
  });

  describe('getTagBySlug', () => {
    it('スラッグからタグを逆引きする', () => {
      expect(getTagBySlug('aws')).toBe('AWS');
    });

    it('存在しないスラッグは null', () => {
      expect(getTagBySlug('nonexistent-slug')).toBeNull();
    });
  });
});
