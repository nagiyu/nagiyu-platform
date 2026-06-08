/**
 * sitemap.ts のユニットテスト
 *
 * Next.js の MetadataRoute.Sitemap 出力内容を検証する。
 * - 静的エントリーが含まれること
 * - A2 で追加されたカテゴリ別ハブページが含まれること
 * - サービスドキュメント（overview / guide / faq）が含まれること
 * - 技術記事エントリーが含まれること
 * - タグページが含まれること
 * - sitemap.xml の URL 形式が正しいこと
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
  getAllServiceSlugs: jest.fn(() => ['tools', 'quick-clip']),
  getAllTags: jest.fn(() => [
    { tag: 'AWS', count: 3 },
    { tag: 'Next.js', count: 2 },
    { tag: '単一記事タグ', count: 1 }, // count < 2 のためリンク化対象外
  ]),
  getAllTechCategoryMetas: jest.fn(() => [
    { slug: 'aws', title: 'AWS インフラ運用ノート', description: 'AWS の解説' },
    { slug: 'nextjs', title: 'Next.js 実践ガイド', description: 'Next.js の解説' },
  ]),
  isLinkableTag: jest.fn((tag: string) => {
    // ASCII のみのスラッグに変換できるタグのみ true
    const slug = tag.toLowerCase().replace(/[\s/]+/g, '-');
    return /^[a-z0-9.@_-]+$/.test(slug);
  }),
  tagToSlug: jest.fn((tag: string) =>
    tag
      .toLowerCase()
      .replace(/[\s/]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  ),
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

    it('services 一覧ページが含まれる', () => {
      const entries = sitemap();
      const urls = entries.map((e) => e.url);
      expect(urls).toContain(`${SITE_URL}/services`);
    });

    it('tech 一覧ページが含まれる', () => {
      const entries = sitemap();
      const urls = entries.map((e) => e.url);
      expect(urls).toContain(`${SITE_URL}/tech`);
    });
  });

  describe('サービスドキュメントエントリー', () => {
    it('各サービスの overview（/services/{slug}）が含まれる', () => {
      const entries = sitemap();
      const urls = entries.map((e) => e.url);
      expect(urls).toContain(`${SITE_URL}/services/tools`);
      expect(urls).toContain(`${SITE_URL}/services/quick-clip`);
    });

    it('各サービスの guide ページが含まれる', () => {
      const entries = sitemap();
      const urls = entries.map((e) => e.url);
      expect(urls).toContain(`${SITE_URL}/services/tools/guide`);
      expect(urls).toContain(`${SITE_URL}/services/quick-clip/guide`);
    });

    it('各サービスの faq ページが含まれる', () => {
      const entries = sitemap();
      const urls = entries.map((e) => e.url);
      expect(urls).toContain(`${SITE_URL}/services/tools/faq`);
      expect(urls).toContain(`${SITE_URL}/services/quick-clip/faq`);
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

  describe('タグページエントリー', () => {
    it('count >= 2 かつ isLinkableTag が true のタグページが含まれる', () => {
      const entries = sitemap();
      const urls = entries.map((e) => e.url);
      // AWS（count=3, isLinkable=true）→ 含まれる
      expect(urls).toContain(`${SITE_URL}/tech/tags/aws`);
    });

    it('count >= 2 かつ isLinkableTag が true の複数タグページが含まれる', () => {
      const entries = sitemap();
      const urls = entries.map((e) => e.url);
      // Next.js（count=2, isLinkable=true）→ 含まれる
      expect(urls).toContain(`${SITE_URL}/tech/tags/next.js`);
    });

    it('count < 2 のタグページは含まれない', () => {
      const entries = sitemap();
      const urls = entries.map((e) => e.url);
      // 単一記事タグ（count=1）→ 含まれない
      expect(urls.some((u) => u.includes('단일'))).toBe(false);
    });
  });

  describe('A2 カテゴリ別ハブエントリー', () => {
    it('カテゴリ別ハブページ（/tech/category/{slug}）が含まれる', () => {
      const entries = sitemap();
      const urls = entries.map((e) => e.url);
      expect(urls).toContain(`${SITE_URL}/tech/category/aws`);
      expect(urls).toContain(`${SITE_URL}/tech/category/nextjs`);
    });

    it('getAllTechCategoryMetas が返すすべてのカテゴリが含まれる', () => {
      const entries = sitemap();
      const categoryUrls = entries.map((e) => e.url).filter((u) => u.includes('/tech/category/'));
      // モックが ['aws', 'nextjs'] を返すため 2 件
      expect(categoryUrls).toHaveLength(2);
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
