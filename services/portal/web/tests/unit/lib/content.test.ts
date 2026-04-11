import path from 'path';
import { getAllServiceSlugs, getServiceDocument, getAllArticles, getArticle } from '@/lib/content';

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
  });
});
