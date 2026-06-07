/**
 * seoValidation.ts のユニットテスト
 *
 * メタデータ重複・欠落検出、JSON-LD 構造検証、sitemap 網羅性検証の各関数を検証する。
 */

import {
  validatePageMetas,
  validateJsonLdBase,
  validateWebSiteJsonLd,
  validateOrganizationJsonLd,
  validateBlogPostingJsonLd,
  validateBreadcrumbJsonLd,
  validateSitemapCoverage,
  detectDuplicateSitemapUrls,
  SEO_VALIDATION_ERRORS,
  type PageMeta,
  type JsonLdData,
  type SitemapEntry,
} from '@/lib/seoValidation';

// ============================================================
// validatePageMetas
// ============================================================

describe('validatePageMetas', () => {
  describe('emptyTitles / emptyDescriptions', () => {
    it('title が空のページを検出する', () => {
      const pages: PageMeta[] = [
        { path: '/', title: 'トップ', description: '説明' },
        { path: '/about', title: '', description: 'About 説明' },
        { path: '/tech', title: '   ', description: '技術記事' },
      ];
      const result = validatePageMetas(pages);
      expect(result.emptyTitles).toEqual(['/about', '/tech']);
    });

    it('description が空のページを検出する', () => {
      const pages: PageMeta[] = [
        { path: '/', title: 'トップ', description: '' },
        { path: '/about', title: 'About', description: '   ' },
        { path: '/tech', title: '技術記事', description: '説明あり' },
      ];
      const result = validatePageMetas(pages);
      expect(result.emptyDescriptions).toEqual(['/', '/about']);
    });

    it('すべて正常な場合は空配列を返す', () => {
      const pages: PageMeta[] = [
        { path: '/', title: 'トップ', description: '説明' },
        { path: '/about', title: 'About', description: 'About 説明' },
      ];
      const result = validatePageMetas(pages);
      expect(result.emptyTitles).toEqual([]);
      expect(result.emptyDescriptions).toEqual([]);
    });

    it('空の配列を渡した場合はすべて空配列を返す', () => {
      const result = validatePageMetas([]);
      expect(result.emptyTitles).toEqual([]);
      expect(result.emptyDescriptions).toEqual([]);
      expect(result.duplicateTitles).toEqual([]);
      expect(result.duplicateDescriptions).toEqual([]);
    });
  });

  describe('duplicateTitles / duplicateDescriptions', () => {
    it('title が重複しているグループを返す', () => {
      const pages: PageMeta[] = [
        { path: '/a', title: '同じタイトル', description: '説明 A' },
        { path: '/b', title: '同じタイトル', description: '説明 B' },
        { path: '/c', title: '別タイトル', description: '説明 C' },
      ];
      const result = validatePageMetas(pages);
      expect(result.duplicateTitles).toHaveLength(1);
      expect(result.duplicateTitles[0]).toEqual(expect.arrayContaining(['/a', '/b']));
      expect(result.duplicateTitles[0]).toHaveLength(2);
    });

    it('description が重複しているグループを返す', () => {
      const pages: PageMeta[] = [
        { path: '/x', title: 'タイトル X', description: '共通説明' },
        { path: '/y', title: 'タイトル Y', description: '共通説明' },
        { path: '/z', title: 'タイトル Z', description: '共通説明' },
      ];
      const result = validatePageMetas(pages);
      expect(result.duplicateDescriptions).toHaveLength(1);
      expect(result.duplicateDescriptions[0]).toHaveLength(3);
    });

    it('重複がない場合は空配列を返す', () => {
      const pages: PageMeta[] = [
        { path: '/a', title: 'タイトル A', description: '説明 A' },
        { path: '/b', title: 'タイトル B', description: '説明 B' },
      ];
      const result = validatePageMetas(pages);
      expect(result.duplicateTitles).toEqual([]);
      expect(result.duplicateDescriptions).toEqual([]);
    });

    it('空文字は重複チェック対象外', () => {
      // 空文字は emptyTitles で検出済みのため、重複グループには含めない
      const pages: PageMeta[] = [
        { path: '/a', title: '', description: '説明 A' },
        { path: '/b', title: '', description: '説明 B' },
      ];
      const result = validatePageMetas(pages);
      expect(result.duplicateTitles).toEqual([]);
    });

    it('3 件以上の重複も正しく検出する', () => {
      const pages: PageMeta[] = [
        { path: '/p1', title: '重複タイトル', description: '説明 1' },
        { path: '/p2', title: '重複タイトル', description: '説明 2' },
        { path: '/p3', title: '重複タイトル', description: '説明 3' },
        { path: '/p4', title: '一意のタイトル', description: '説明 4' },
      ];
      const result = validatePageMetas(pages);
      expect(result.duplicateTitles).toHaveLength(1);
      expect(result.duplicateTitles[0]).toHaveLength(3);
    });
  });
});

// ============================================================
// validateJsonLdBase
// ============================================================

describe('validateJsonLdBase', () => {
  it('@context と @type が正常な場合は valid=true を返す', () => {
    const data: JsonLdData = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
    };
    const result = validateJsonLdBase(data);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('@context が欠落している場合はエラーを返す', () => {
    const data = { '@context': '', '@type': 'WebSite' } as unknown as JsonLdData;
    const result = validateJsonLdBase(data);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(SEO_VALIDATION_ERRORS.MISSING_AT_CONTEXT);
  });

  it('@context が https://schema.org 以外の場合はエラーを返す', () => {
    const data: JsonLdData = {
      '@context': 'http://schema.org',
      '@type': 'WebSite',
    };
    const result = validateJsonLdBase(data);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(SEO_VALIDATION_ERRORS.INVALID_AT_CONTEXT);
  });

  it('@type が欠落している場合はエラーを返す', () => {
    const data = { '@context': 'https://schema.org', '@type': '' } as unknown as JsonLdData;
    const result = validateJsonLdBase(data);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(SEO_VALIDATION_ERRORS.MISSING_AT_TYPE);
  });

  it('@context・@type 両方欠落の場合は 2 件のエラーを返す', () => {
    const data = { '@context': '', '@type': '' } as unknown as JsonLdData;
    const result = validateJsonLdBase(data);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });
});

// ============================================================
// validateWebSiteJsonLd
// ============================================================

describe('validateWebSiteJsonLd', () => {
  const validWebSite: JsonLdData = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    url: 'https://nagiyu.com',
    name: 'nagiyu',
  };

  it('正常な WebSite JSON-LD は valid=true を返す', () => {
    const result = validateWebSiteJsonLd(validWebSite);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('url が欠落している場合はエラーを返す', () => {
    const data: JsonLdData = { ...validWebSite, url: undefined };
    const result = validateWebSiteJsonLd(data);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(SEO_VALIDATION_ERRORS.WEBSITE_MISSING_URL);
  });

  it('name が欠落している場合はエラーを返す', () => {
    const data: JsonLdData = { ...validWebSite, name: undefined };
    const result = validateWebSiteJsonLd(data);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(SEO_VALIDATION_ERRORS.WEBSITE_MISSING_NAME);
  });

  it('@context が不正な場合は base エラーを継承する', () => {
    const data: JsonLdData = { ...validWebSite, '@context': 'http://schema.org' };
    const result = validateWebSiteJsonLd(data);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(SEO_VALIDATION_ERRORS.INVALID_AT_CONTEXT);
  });
});

// ============================================================
// validateOrganizationJsonLd
// ============================================================

describe('validateOrganizationJsonLd', () => {
  const validOrganization: JsonLdData = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    url: 'https://nagiyu.com',
    name: 'nagiyu',
  };

  it('正常な Organization JSON-LD は valid=true を返す', () => {
    const result = validateOrganizationJsonLd(validOrganization);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('url が欠落している場合はエラーを返す', () => {
    const data: JsonLdData = { ...validOrganization, url: undefined };
    const result = validateOrganizationJsonLd(data);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(SEO_VALIDATION_ERRORS.ORGANIZATION_MISSING_URL);
  });

  it('name が欠落している場合はエラーを返す', () => {
    const data: JsonLdData = { ...validOrganization, name: undefined };
    const result = validateOrganizationJsonLd(data);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(SEO_VALIDATION_ERRORS.ORGANIZATION_MISSING_NAME);
  });
});

// ============================================================
// validateBlogPostingJsonLd
// ============================================================

describe('validateBlogPostingJsonLd', () => {
  const validBlogPosting: JsonLdData = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: 'テスト記事タイトル',
    datePublished: '2026-04-10T00:00:00.000Z',
    author: { '@type': 'Person', name: 'なぎゆー' },
    description: 'テスト説明',
  };

  it('正常な BlogPosting JSON-LD は valid=true を返す', () => {
    const result = validateBlogPostingJsonLd(validBlogPosting);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('headline が欠落している場合はエラーを返す', () => {
    const data: JsonLdData = { ...validBlogPosting, headline: undefined };
    const result = validateBlogPostingJsonLd(data);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(SEO_VALIDATION_ERRORS.BLOG_POSTING_MISSING_HEADLINE);
  });

  it('datePublished が欠落している場合はエラーを返す', () => {
    const data: JsonLdData = { ...validBlogPosting, datePublished: undefined };
    const result = validateBlogPostingJsonLd(data);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(SEO_VALIDATION_ERRORS.BLOG_POSTING_MISSING_DATE_PUBLISHED);
  });

  it('author が欠落している場合はエラーを返す', () => {
    const data: JsonLdData = { ...validBlogPosting, author: undefined };
    const result = validateBlogPostingJsonLd(data);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(SEO_VALIDATION_ERRORS.BLOG_POSTING_MISSING_AUTHOR);
  });

  it('description が欠落している場合はエラーを返す', () => {
    const data: JsonLdData = { ...validBlogPosting, description: undefined };
    const result = validateBlogPostingJsonLd(data);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(SEO_VALIDATION_ERRORS.BLOG_POSTING_MISSING_DESCRIPTION);
  });

  it('複数フィールドが欠落している場合は複数エラーを返す', () => {
    const data: JsonLdData = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
    };
    const result = validateBlogPostingJsonLd(data);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });
});

// ============================================================
// validateBreadcrumbJsonLd
// ============================================================

describe('validateBreadcrumbJsonLd', () => {
  const validBreadcrumb: JsonLdData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'ホーム', item: 'https://nagiyu.com/' },
      { '@type': 'ListItem', position: 2, name: '技術記事', item: 'https://nagiyu.com/tech' },
      {
        '@type': 'ListItem',
        position: 3,
        name: '記事タイトル',
        item: 'https://nagiyu.com/tech/foo',
      },
    ],
  };

  it('正常な BreadcrumbList は valid=true を返す', () => {
    const result = validateBreadcrumbJsonLd(validBreadcrumb);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('itemListElement が欠落している場合はエラーを返す', () => {
    const data: JsonLdData = { ...validBreadcrumb, itemListElement: undefined };
    const result = validateBreadcrumbJsonLd(data);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(SEO_VALIDATION_ERRORS.BREADCRUMB_MISSING_ITEM_LIST);
  });

  it('itemListElement が空配列の場合はエラーを返す', () => {
    const data: JsonLdData = { ...validBreadcrumb, itemListElement: [] };
    const result = validateBreadcrumbJsonLd(data);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(SEO_VALIDATION_ERRORS.BREADCRUMB_EMPTY_ITEM_LIST);
  });

  it('アイテムに position が欠落している場合はエラーを返す', () => {
    const data: JsonLdData = {
      ...validBreadcrumb,
      itemListElement: [
        { '@type': 'ListItem', name: 'ホーム', item: 'https://nagiyu.com/' },
        { '@type': 'ListItem', position: 2, name: '技術記事', item: 'https://nagiyu.com/tech' },
      ],
    };
    const result = validateBreadcrumbJsonLd(data);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(SEO_VALIDATION_ERRORS.BREADCRUMB_ITEM_MISSING_POSITION);
  });

  it('アイテムに name が欠落している場合はエラーを返す', () => {
    const data: JsonLdData = {
      ...validBreadcrumb,
      itemListElement: [
        { '@type': 'ListItem', position: 1, item: 'https://nagiyu.com/' },
        { '@type': 'ListItem', position: 2, name: '技術記事', item: 'https://nagiyu.com/tech' },
      ],
    };
    const result = validateBreadcrumbJsonLd(data);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(SEO_VALIDATION_ERRORS.BREADCRUMB_ITEM_MISSING_NAME);
  });

  it('position が 1 から連番でない場合はエラーを返す', () => {
    const data: JsonLdData = {
      ...validBreadcrumb,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'ホーム', item: 'https://nagiyu.com/' },
        { '@type': 'ListItem', position: 3, name: '技術記事', item: 'https://nagiyu.com/tech' }, // 2 を飛ばす
      ],
    };
    const result = validateBreadcrumbJsonLd(data);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(SEO_VALIDATION_ERRORS.BREADCRUMB_ITEM_POSITION_NOT_SEQUENTIAL);
  });

  it('A2 カテゴリハブ用の 3 階層パンくずが正常であることを検証する', () => {
    // A2 ハブページ（/tech/category/{slug}）の BreadcrumbList パターン
    const categoryBreadcrumb: JsonLdData = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'ホーム', item: 'https://nagiyu.com/' },
        { '@type': 'ListItem', position: 2, name: '技術記事', item: 'https://nagiyu.com/tech' },
        {
          '@type': 'ListItem',
          position: 3,
          name: 'AWS インフラ運用ノート',
          item: 'https://nagiyu.com/tech/category/aws',
        },
      ],
    };
    const result = validateBreadcrumbJsonLd(categoryBreadcrumb);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('1 アイテムだけの BreadcrumbList も valid', () => {
    const data: JsonLdData = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'ホーム', item: 'https://nagiyu.com/' },
      ],
    };
    const result = validateBreadcrumbJsonLd(data);
    expect(result.valid).toBe(true);
  });
});

// ============================================================
// validateSitemapCoverage
// ============================================================

describe('validateSitemapCoverage', () => {
  it('すべての期待 URL が含まれている場合は missing が空', () => {
    const expected = ['https://nagiyu.com/', 'https://nagiyu.com/about'];
    const entries: SitemapEntry[] = [
      { url: 'https://nagiyu.com/' },
      { url: 'https://nagiyu.com/about' },
    ];
    const result = validateSitemapCoverage(expected, entries);
    expect(result.missing).toEqual([]);
    expect(result.unexpected).toEqual([]);
  });

  it('期待 URL が欠落している場合は missing に含まれる', () => {
    const expected = ['https://nagiyu.com/', 'https://nagiyu.com/tech'];
    const entries: SitemapEntry[] = [{ url: 'https://nagiyu.com/' }];
    const result = validateSitemapCoverage(expected, entries);
    expect(result.missing).toContain('https://nagiyu.com/tech');
  });

  it('期待しない URL がある場合は unexpected に含まれる', () => {
    const expected = ['https://nagiyu.com/'];
    const entries: SitemapEntry[] = [
      { url: 'https://nagiyu.com/' },
      { url: 'https://nagiyu.com/old-deleted-page' },
    ];
    const result = validateSitemapCoverage(expected, entries);
    expect(result.unexpected).toContain('https://nagiyu.com/old-deleted-page');
  });

  it('A2 カテゴリハブが sitemap に含まれているかを検証できる', () => {
    // A2 で追加された /tech/category/{slug} が sitemap に含まれる必要がある
    const categoryUrls = [
      'https://nagiyu.com/tech/category/aws',
      'https://nagiyu.com/tech/category/nextjs',
      'https://nagiyu.com/tech/category/dev-stack',
    ];
    const entries: SitemapEntry[] = [
      { url: 'https://nagiyu.com/' },
      { url: 'https://nagiyu.com/tech' },
      { url: 'https://nagiyu.com/tech/category/aws' },
      { url: 'https://nagiyu.com/tech/category/nextjs' },
      { url: 'https://nagiyu.com/tech/category/dev-stack' },
    ];
    const result = validateSitemapCoverage(categoryUrls, entries);
    expect(result.missing).toEqual([]);
  });

  it('A5 で削除された記事が sitemap に残っていることを検出できる', () => {
    // A5 で削除された記事の URL が unexpected として検出される
    const expected = ['https://nagiyu.com/', 'https://nagiyu.com/tech'];
    const entries: SitemapEntry[] = [
      { url: 'https://nagiyu.com/' },
      { url: 'https://nagiyu.com/tech' },
      { url: 'https://nagiyu.com/tech/deleted-old-article' }, // A5 で削除された記事
    ];
    const result = validateSitemapCoverage(expected, entries);
    expect(result.unexpected).toContain('https://nagiyu.com/tech/deleted-old-article');
  });

  it('Set を引数として渡すことができる', () => {
    const expected = new Set(['https://nagiyu.com/', 'https://nagiyu.com/about']);
    const entries: SitemapEntry[] = [
      { url: 'https://nagiyu.com/' },
      { url: 'https://nagiyu.com/about' },
    ];
    const result = validateSitemapCoverage(expected, entries);
    expect(result.missing).toEqual([]);
    expect(result.unexpected).toEqual([]);
  });

  it('空の expected と空の entries は両方空を返す', () => {
    const result = validateSitemapCoverage([], []);
    expect(result.missing).toEqual([]);
    expect(result.unexpected).toEqual([]);
  });
});

// ============================================================
// detectDuplicateSitemapUrls
// ============================================================

describe('detectDuplicateSitemapUrls', () => {
  it('重複がない場合は空配列を返す', () => {
    const entries: SitemapEntry[] = [
      { url: 'https://nagiyu.com/' },
      { url: 'https://nagiyu.com/about' },
      { url: 'https://nagiyu.com/tech' },
    ];
    const result = detectDuplicateSitemapUrls(entries);
    expect(result).toEqual([]);
  });

  it('重複 URL を検出する', () => {
    const entries: SitemapEntry[] = [
      { url: 'https://nagiyu.com/' },
      { url: 'https://nagiyu.com/about' },
      { url: 'https://nagiyu.com/' }, // 重複
    ];
    const result = detectDuplicateSitemapUrls(entries);
    expect(result).toContain('https://nagiyu.com/');
    expect(result).toHaveLength(1);
  });

  it('複数の重複を検出する', () => {
    const entries: SitemapEntry[] = [
      { url: 'https://nagiyu.com/' },
      { url: 'https://nagiyu.com/tech' },
      { url: 'https://nagiyu.com/' }, // 重複 1
      { url: 'https://nagiyu.com/tech' }, // 重複 2
      { url: 'https://nagiyu.com/about' },
    ];
    const result = detectDuplicateSitemapUrls(entries);
    expect(result).toHaveLength(2);
    expect(result).toContain('https://nagiyu.com/');
    expect(result).toContain('https://nagiyu.com/tech');
  });

  it('3 回以上出現する URL は重複として 1 件のみ返す', () => {
    const entries: SitemapEntry[] = [
      { url: 'https://nagiyu.com/dup' },
      { url: 'https://nagiyu.com/dup' },
      { url: 'https://nagiyu.com/dup' },
    ];
    const result = detectDuplicateSitemapUrls(entries);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('https://nagiyu.com/dup');
  });

  it('空の配列を渡した場合は空配列を返す', () => {
    const result = detectDuplicateSitemapUrls([]);
    expect(result).toEqual([]);
  });
});
