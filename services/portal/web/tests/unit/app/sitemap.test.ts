/**
 * sitemap.ts のユニットテスト
 *
 * Next.js の MetadataRoute.Sitemap 出力内容を検証する。
 * - 静的エントリーが含まれること
 * - /tech/category/* エントリーが含まれないこと（カテゴリハブは廃止済み）
 * - 技術記事エントリーが含まれること
 * - sitemap.xml の URL 形式が正しいこと
 * - /services・/tech/tags・/tech/category 配下のエントリーを含まないこと
 */

import sitemap from '@/app/sitemap';

// content モジュールをモック化する（ファイルシステムアクセスを回避）
jest.mock('@/lib/content', () => ({
  getAllArticles: jest.fn(() => [
    {
      slug: 'test-article-1',
      title: 'テスト記事1',
      description: 'テスト',
      publishedAt: '2026-04-10',
      updatedAt: '2026-04-15',
      tags: ['AWS', 'Next.js'],
      categories: ['aws'],
    },
    {
      slug: 'test-article-2',
      title: 'テスト記事2',
      description: 'テスト',
      publishedAt: '2026-04-05',
      tags: ['AWS'],
      categories: ['aws', 'nextjs'],
    },
  ]),
}));

describe('sitemap', () => {
  const SITE_URL = 'https://nagiyu.com';

  describe('静的エントリー', () => {
    it('トップページ（/）が含まれる', () => {
      const entries = sitemap();
      const urls = entries.map((e) => e.url);
      expect(urls).toContain(`${SITE_URL}/`);
    });

    it('about ページが含まれる', () => {
      const entries = sitemap();
      const urls = entries.map((e) => e.url);
      expect(urls).toContain(`${SITE_URL}/about`);
    });

    it('contact ページが含まれる', () => {
      const entries = sitemap();
      const urls = entries.map((e) => e.url);
      expect(urls).toContain(`${SITE_URL}/contact`);
    });

    it('privacy ページが含まれる', () => {
      const entries = sitemap();
      const urls = entries.map((e) => e.url);
      expect(urls).toContain(`${SITE_URL}/privacy`);
    });

    it('terms ページが含まれる', () => {
      const entries = sitemap();
      const urls = entries.map((e) => e.url);
      expect(urls).toContain(`${SITE_URL}/terms`);
    });

    it('tech 一覧ページが含まれる', () => {
      const entries = sitemap();
      const urls = entries.map((e) => e.url);
      expect(urls).toContain(`${SITE_URL}/tech`);
    });

    it('services 一覧ページは含まれない', () => {
      const entries = sitemap();
      const urls = entries.map((e) => e.url);
      expect(urls).not.toContain(`${SITE_URL}/services`);
    });
  });

  describe('/services・/tech/tags・/tech/category を含まないこと', () => {
    it('/services 配下のエントリーが一切含まれない', () => {
      const entries = sitemap();
      const urls = entries.map((e) => e.url);
      expect(urls.some((u) => u.includes('/services'))).toBe(false);
    });

    it('/tech/tags 配下のエントリーが一切含まれない', () => {
      const entries = sitemap();
      const urls = entries.map((e) => e.url);
      expect(urls.some((u) => u.includes('/tech/tags'))).toBe(false);
    });

    it('/tech/category 配下のエントリーが一切含まれない（カテゴリハブは廃止済み）', () => {
      const entries = sitemap();
      const urls = entries.map((e) => e.url);
      expect(urls.some((u) => u.includes('/tech/category'))).toBe(false);
    });
  });

  describe('技術記事エントリー', () => {
    it('記事エントリーが含まれる', () => {
      const entries = sitemap();
      const urls = entries.map((e) => e.url);
      expect(urls).toContain(`${SITE_URL}/tech/test-article-1`);
      expect(urls).toContain(`${SITE_URL}/tech/test-article-2`);
    });

    it('updatedAt がある記事は lastModified に updatedAt を使用する', () => {
      const entries = sitemap();
      const article1 = entries.find((e) => e.url === `${SITE_URL}/tech/test-article-1`);
      expect(article1).toBeDefined();
      if (!article1) return;
      expect(article1.lastModified).toEqual(new Date('2026-04-15'));
    });

    it('updatedAt がない記事は lastModified に publishedAt を使用する', () => {
      const entries = sitemap();
      const article2 = entries.find((e) => e.url === `${SITE_URL}/tech/test-article-2`);
      expect(article2).toBeDefined();
      if (!article2) return;
      expect(article2.lastModified).toEqual(new Date('2026-04-05'));
    });
  });

  describe('URL 形式', () => {
    it('すべてのエントリーが https://nagiyu.com で始まる', () => {
      const entries = sitemap();
      entries.forEach((entry) => {
        expect(entry.url).toMatch(/^https:\/\/nagiyu\.com/);
      });
    });

    it('重複した URL が存在しない', () => {
      const entries = sitemap();
      const urls = entries.map((e) => e.url);
      const unique = new Set(urls);
      expect(unique.size).toBe(urls.length);
    });

    it('空の配列を返さない（エントリーが 1 件以上ある）', () => {
      const entries = sitemap();
      expect(entries.length).toBeGreaterThan(0);
    });
  });

  describe('priority および changeFrequency', () => {
    it('トップページの priority が 1.0', () => {
      const entries = sitemap();
      const top = entries.find((e) => e.url === `${SITE_URL}/`);
      expect(top?.priority).toBe(1.0);
    });

    it('tech 一覧ページの priority が 0.9', () => {
      const entries = sitemap();
      const tech = entries.find((e) => e.url === `${SITE_URL}/tech`);
      expect(tech?.priority).toBe(0.9);
    });
  });
});
