import path from 'path';
import { getAllServiceSlugs, getServiceDocument, getAllArticles, getArticle } from '@/lib/content';

// content ディレクトリをテスト用に設定
const FIXTURE_DIR = path.join(__dirname, '../../../fixtures/content');

jest.mock('path', () => {
  const actual = jest.requireActual<typeof path>('path');
  return {
    ...actual,
    join: (...args: string[]) => {
      // process.cwd() + 'src' + 'content' の組み合わせをフィクスチャに差し替え
      const joined = actual.join(...args);
      const marker = actual.join('src', 'content');
      if (joined.includes(marker)) {
        return joined.replace(actual.join(process.cwd(), 'src', 'content'), FIXTURE_DIR);
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
