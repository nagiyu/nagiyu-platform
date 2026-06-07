/**
 * SEO 検証ユーティリティ
 *
 * メタデータ（title / description）の重複・欠落検出、
 * JSON-LD 構造の整合性検証、sitemap 網羅性検証の純粋関数を提供する。
 */

// ============================================================
// 型定義
// ============================================================

/** ページのメタデータ情報 */
export type PageMeta = {
  /** ページを識別するパス（例: '/', '/tech/foo'） */
  path: string;
  /** `<title>` に相当する文字列 */
  title: string;
  /** `<meta name="description">` に相当する文字列 */
  description: string;
};

/** メタデータ検証の結果 */
export type MetaValidationResult = {
  /** title が空のページ一覧 */
  emptyTitles: string[];
  /** description が空のページ一覧 */
  emptyDescriptions: string[];
  /** title が重複しているグループ（同一 title を持つ path 配列の配列） */
  duplicateTitles: string[][];
  /** description が重複しているグループ */
  duplicateDescriptions: string[][];
};

/** JSON-LD オブジェクトの最低限の型 */
export type JsonLdData = {
  '@context': string;
  '@type': string;
  [key: string]: unknown;
};

/** JSON-LD 検証の結果 */
export type JsonLdValidationResult = {
  /** 検証が通った場合 true */
  valid: boolean;
  /** 検出されたエラーメッセージ（日本語） */
  errors: string[];
};

/** sitemap エントリの最低限の型 */
export type SitemapEntry = {
  url: string;
};

/** sitemap 網羅性検証の結果 */
export type SitemapValidationResult = {
  /** sitemap に含まれていないページ URL 一覧 */
  missing: string[];
  /** sitemap に含まれているが期待しない URL 一覧 */
  unexpected: string[];
};

// ============================================================
// エラーメッセージ定数
// ============================================================

export const SEO_VALIDATION_ERRORS = {
  MISSING_AT_CONTEXT: 'JSON-LD に @context が設定されていません',
  MISSING_AT_TYPE: 'JSON-LD に @type が設定されていません',
  INVALID_AT_CONTEXT: '@context は "https://schema.org" である必要があります',
  BLOG_POSTING_MISSING_HEADLINE: 'BlogPosting に headline が設定されていません',
  BLOG_POSTING_MISSING_DATE_PUBLISHED: 'BlogPosting に datePublished が設定されていません',
  BLOG_POSTING_MISSING_AUTHOR: 'BlogPosting に author が設定されていません',
  BLOG_POSTING_MISSING_DESCRIPTION: 'BlogPosting に description が設定されていません',
  BREADCRUMB_MISSING_ITEM_LIST: 'BreadcrumbList に itemListElement が設定されていません',
  BREADCRUMB_EMPTY_ITEM_LIST: 'BreadcrumbList の itemListElement が空です',
  BREADCRUMB_ITEM_MISSING_POSITION: 'BreadcrumbList のアイテムに position が設定されていません',
  BREADCRUMB_ITEM_MISSING_NAME: 'BreadcrumbList のアイテムに name が設定されていません',
  BREADCRUMB_ITEM_POSITION_NOT_SEQUENTIAL:
    'BreadcrumbList の position が 1 から連番になっていません',
  WEBSITE_MISSING_URL: 'WebSite に url が設定されていません',
  WEBSITE_MISSING_NAME: 'WebSite に name が設定されていません',
  ORGANIZATION_MISSING_URL: 'Organization に url が設定されていません',
  ORGANIZATION_MISSING_NAME: 'Organization に name が設定されていません',
} as const;

// ============================================================
// メタデータ検証
// ============================================================

/**
 * ページメタデータの重複・欠落を検出する。
 *
 * @param pages - 検証対象のページメタデータ配列
 * @returns 検証結果
 */
export function validatePageMetas(pages: PageMeta[]): MetaValidationResult {
  const emptyTitles: string[] = [];
  const emptyDescriptions: string[] = [];

  for (const page of pages) {
    if (!page.title || page.title.trim() === '') {
      emptyTitles.push(page.path);
    }
    if (!page.description || page.description.trim() === '') {
      emptyDescriptions.push(page.path);
    }
  }

  // 重複グループを検出する
  const duplicateTitles = findDuplicateGroups(pages, (p) => p.title);
  const duplicateDescriptions = findDuplicateGroups(pages, (p) => p.description);

  return { emptyTitles, emptyDescriptions, duplicateTitles, duplicateDescriptions };
}

/**
 * 指定キー抽出関数で同一値を持つページのパスをグループ化して返す。
 * グループが 2 件以上の場合のみ結果に含まれる。
 */
function findDuplicateGroups(pages: PageMeta[], keyFn: (page: PageMeta) => string): string[][] {
  const groupMap = new Map<string, string[]>();

  for (const page of pages) {
    const key = keyFn(page).trim();
    if (key === '') continue; // 空文字は重複チェック対象外（欠落チェックで別途検出済み）
    const group = groupMap.get(key) ?? [];
    group.push(page.path);
    groupMap.set(key, group);
  }

  return [...groupMap.values()].filter((group) => group.length >= 2);
}

// ============================================================
// JSON-LD 検証
// ============================================================

/**
 * JSON-LD データの共通フィールド（@context / @type）を検証する。
 */
export function validateJsonLdBase(data: JsonLdData): JsonLdValidationResult {
  const errors: string[] = [];

  if (!data['@context']) {
    errors.push(SEO_VALIDATION_ERRORS.MISSING_AT_CONTEXT);
  } else if (data['@context'] !== 'https://schema.org') {
    errors.push(SEO_VALIDATION_ERRORS.INVALID_AT_CONTEXT);
  }

  if (!data['@type']) {
    errors.push(SEO_VALIDATION_ERRORS.MISSING_AT_TYPE);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * WebSite JSON-LD の必須フィールドを検証する。
 */
export function validateWebSiteJsonLd(data: JsonLdData): JsonLdValidationResult {
  const base = validateJsonLdBase(data);
  const errors = [...base.errors];

  if (!data['url']) {
    errors.push(SEO_VALIDATION_ERRORS.WEBSITE_MISSING_URL);
  }
  if (!data['name']) {
    errors.push(SEO_VALIDATION_ERRORS.WEBSITE_MISSING_NAME);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Organization JSON-LD の必須フィールドを検証する。
 */
export function validateOrganizationJsonLd(data: JsonLdData): JsonLdValidationResult {
  const base = validateJsonLdBase(data);
  const errors = [...base.errors];

  if (!data['url']) {
    errors.push(SEO_VALIDATION_ERRORS.ORGANIZATION_MISSING_URL);
  }
  if (!data['name']) {
    errors.push(SEO_VALIDATION_ERRORS.ORGANIZATION_MISSING_NAME);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * BlogPosting JSON-LD の必須フィールドを検証する。
 * Schema.org BlogPosting 仕様に基づく。
 */
export function validateBlogPostingJsonLd(data: JsonLdData): JsonLdValidationResult {
  const base = validateJsonLdBase(data);
  const errors = [...base.errors];

  if (!data['headline']) {
    errors.push(SEO_VALIDATION_ERRORS.BLOG_POSTING_MISSING_HEADLINE);
  }
  if (!data['datePublished']) {
    errors.push(SEO_VALIDATION_ERRORS.BLOG_POSTING_MISSING_DATE_PUBLISHED);
  }
  if (!data['author']) {
    errors.push(SEO_VALIDATION_ERRORS.BLOG_POSTING_MISSING_AUTHOR);
  }
  if (!data['description']) {
    errors.push(SEO_VALIDATION_ERRORS.BLOG_POSTING_MISSING_DESCRIPTION);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * BreadcrumbList JSON-LD の必須フィールドと整合性を検証する。
 * Schema.org BreadcrumbList 仕様に基づく。
 */
export function validateBreadcrumbJsonLd(data: JsonLdData): JsonLdValidationResult {
  const base = validateJsonLdBase(data);
  const errors = [...base.errors];

  const itemListElement = data['itemListElement'];

  if (!itemListElement) {
    errors.push(SEO_VALIDATION_ERRORS.BREADCRUMB_MISSING_ITEM_LIST);
    return { valid: false, errors };
  }

  if (!Array.isArray(itemListElement) || itemListElement.length === 0) {
    errors.push(SEO_VALIDATION_ERRORS.BREADCRUMB_EMPTY_ITEM_LIST);
    return { valid: false, errors };
  }

  // 各アイテムの必須フィールドチェック
  for (const item of itemListElement as Record<string, unknown>[]) {
    if (item['position'] === undefined || item['position'] === null) {
      errors.push(SEO_VALIDATION_ERRORS.BREADCRUMB_ITEM_MISSING_POSITION);
    }
    if (!item['name']) {
      errors.push(SEO_VALIDATION_ERRORS.BREADCRUMB_ITEM_MISSING_NAME);
    }
  }

  // position が 1 から連番であることを確認
  const positions = (itemListElement as Record<string, unknown>[])
    .map((item) => item['position'])
    .filter((pos): pos is number => typeof pos === 'number')
    .sort((a, b) => a - b);

  const expectedPositions = Array.from({ length: positions.length }, (_, i) => i + 1);
  if (JSON.stringify(positions) !== JSON.stringify(expectedPositions)) {
    errors.push(SEO_VALIDATION_ERRORS.BREADCRUMB_ITEM_POSITION_NOT_SEQUENTIAL);
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================
// sitemap 網羅性検証
// ============================================================

/**
 * sitemap に含まれるべき URL と実際の sitemap エントリを比較して
 * 不足・余分な URL を検出する。
 *
 * @param expectedUrls - sitemap に含まれるべき URL の Set または配列
 * @param sitemapEntries - 実際の sitemap エントリ配列
 * @returns 検証結果
 */
export function validateSitemapCoverage(
  expectedUrls: string[] | Set<string>,
  sitemapEntries: SitemapEntry[]
): SitemapValidationResult {
  const expected = new Set(expectedUrls);
  const actual = new Set(sitemapEntries.map((entry) => entry.url));

  const missing = [...expected].filter((url) => !actual.has(url));
  const unexpected = [...actual].filter((url) => !expected.has(url));

  return { missing, unexpected };
}

/**
 * sitemap エントリに重複 URL がないか確認する。
 *
 * @param sitemapEntries - 検証対象のエントリ配列
 * @returns 重複している URL 一覧
 */
export function detectDuplicateSitemapUrls(sitemapEntries: SitemapEntry[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const entry of sitemapEntries) {
    if (seen.has(entry.url)) {
      duplicates.add(entry.url);
    }
    seen.add(entry.url);
  }

  return [...duplicates];
}
