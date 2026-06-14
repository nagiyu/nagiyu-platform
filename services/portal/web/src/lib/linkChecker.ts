import fs from 'fs';
import path from 'path';

/** リンク切れ情報 */
export interface BrokenLink {
  /** 検査対象ファイルの相対パス */
  file: string;
  /** リンクが出現した行番号 */
  line: number;
  /** リンク先の href */
  href: string;
  /** リンク切れの理由 */
  reason: string;
}

/**
 * エラーメッセージ定数
 */
export const ERROR_MESSAGES = {
  TECH_ARTICLE_NOT_FOUND: (slug: string) => `技術記事 src/content/tech/${slug}.md が存在しない`,
  TECH_TAG_NOT_FOUND: (tagSlug: string) => `タグスラッグ '${tagSlug}' に対応する記事が存在しない`,
  TECH_CATEGORY_NOT_FOUND: (slug: string) =>
    `カテゴリ src/content/tech-category/${slug}.md が存在しない、または該当記事がない`,
  SERVICE_DOC_NOT_FOUND: (slug: string, doc: string) =>
    `サービスドキュメント src/content/services/${slug}/${doc}.md が存在しない`,
  SERVICE_NOT_FOUND: (slug: string) =>
    `サービス src/content/services/${slug}/index.md が存在しない`,
  PAGE_NOT_FOUND: (href: string) => `対応するページが存在しない (${href})`,
} as const;

/**
 * public/ 配下の静的ファイルとして実在するか確認する。
 * パストラバーサル攻撃を防ぐため、解決後のパスが publicDir 配下であることを検証する。
 *
 * 同等のロジックを scripts/check-internal-links.mjs にも実装。両者を同期すること。
 */
export function publicFileExists(href: string, publicDir: string): boolean {
  // クエリ文字列を除去（アンカーは呼び出し元で除去済みだが念のため除去）
  const cleanHref = href.split('?')[0].split('#')[0];
  // public ディレクトリ起点でパスを解決
  const resolved = path.resolve(publicDir, '.' + cleanHref);
  // パストラバーサル防御: resolved が publicDir の配下であることを確認
  const isInsidePublic = resolved === publicDir || resolved.startsWith(publicDir + path.sep);
  if (!isInsidePublic) return false;
  // ファイルとして実在するか確認
  return fs.existsSync(resolved) && fs.statSync(resolved).isFile();
}

/**
 * 静的ページの存在パス一覧（app ディレクトリ内に page.tsx があるルート）
 */
const STATIC_ROUTES = new Set(['/', '/about', '/privacy', '/terms', '/tech', '/services']);

/**
 * ファイルを再帰的に列挙する
 */
export function walkFiles(dir: string, exts: string[]): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath, exts));
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * 文字列からリンクを抽出する。
 *
 * 以下パターンを対象とする:
 * - Markdown: `[text](/path)` 形式
 * - JSX Link/a: `href="/path"` 形式
 *
 * アンカー部（#anchor）は除外し、外部リンク（http:// / https://）は除外する。
 */
export function extractInternalLinks(content: string): { href: string; line: number }[] {
  const links: { href: string; line: number }[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Markdown リンク: [text](/path) または [text](/path "title")
    const mdLinkRegex = /\[[^\]]*\]\((\S+?)(?:\s+"[^"]*")?\)/g;
    let match: RegExpExecArray | null;
    while ((match = mdLinkRegex.exec(line)) !== null) {
      const href = match[1].split('#')[0]; // アンカー除去
      if (href.startsWith('/') && !href.startsWith('//')) {
        links.push({ href, line: lineNumber });
      }
    }

    // JSX/TSX の href 属性: href="/path" または href='/path' または href=`/path`
    const jsxHrefRegex = /href=["'`](\/?[^"'`\s]+)["'`]/g;
    while ((match = jsxHrefRegex.exec(line)) !== null) {
      const raw = match[1];
      const href = raw.split('#')[0]; // アンカー除去
      // 内部パス（/で始まる）のみ対象。外部 URL は除外。
      if (href.startsWith('/') && !href.startsWith('//') && !href.includes('://')) {
        links.push({ href, line: lineNumber });
      }
    }
  }

  return links;
}

/**
 * タグ名を URL スラッグに変換する（content.ts の tagToSlug と同じロジック）
 */
export function tagToSlug(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/[\s/]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * `/tech/{slug}` ルートが実在するか確認する。
 * `src/content/tech/{slug}.md` の存在で判定。
 */
export function techArticleExists(slug: string, contentDir: string): boolean {
  return fs.existsSync(path.join(contentDir, 'tech', `${slug}.md`));
}

/**
 * `/tech/tags/{tagSlug}` ルートが実在するか確認する。
 * タグ slug に合致する記事が 1 件以上あれば存在と判定。
 */
export function techTagExists(tagSlug: string, contentDir: string): boolean {
  const techDir = path.join(contentDir, 'tech');
  if (!fs.existsSync(techDir)) return false;
  for (const file of fs.readdirSync(techDir)) {
    if (!file.endsWith('.md')) continue;
    const content = fs.readFileSync(path.join(techDir, file), 'utf8');
    // frontmatter の tags 行を簡易パース
    const tagsMatch = content.match(/^tags:\s*\[([^\]]*)\]/m);
    if (!tagsMatch) continue;
    const tagsRaw = tagsMatch[1];
    const tagNames = tagsRaw.match(/['"]([^'"]+)['"]/g)?.map((t) => t.replace(/['"]/g, '')) ?? [];
    for (const tagName of tagNames) {
      if (tagToSlug(tagName) === tagSlug) return true;
    }
  }
  return false;
}

/**
 * `/tech/category/{slug}` ルートが実在するか確認する。
 * `src/content/tech-category/{slug}.md` が存在し、
 * かつ該当カテゴリの記事が 1 件以上あれば実在と判定。
 */
export function techCategoryExists(slug: string, contentDir: string): boolean {
  const categoryFile = path.join(contentDir, 'tech-category', `${slug}.md`);
  if (!fs.existsSync(categoryFile)) return false;

  // 該当カテゴリを持つ記事が 1 件以上あるか確認
  const techDir = path.join(contentDir, 'tech');
  if (!fs.existsSync(techDir)) return false;
  for (const file of fs.readdirSync(techDir)) {
    if (!file.endsWith('.md')) continue;
    const content = fs.readFileSync(path.join(techDir, file), 'utf8');
    const catMatch = content.match(/^categories:\s*\[([^\]]*)\]/m);
    if (!catMatch) continue;
    const cats = catMatch[1].match(/['"]([^'"]+)['"]/g)?.map((c) => c.replace(/['"]/g, '')) ?? [];
    if (cats.includes(slug)) return true;
  }
  return false;
}

/**
 * `/services/{slug}` ルートが実在するか確認する。
 * `src/content/services/{slug}/index.md` の存在で判定。
 */
export function serviceExists(slug: string, contentDir: string): boolean {
  return fs.existsSync(path.join(contentDir, 'services', slug, 'index.md'));
}

/**
 * `/services/{slug}/{doc}` ルートが実在するか確認する。
 * `src/content/services/{slug}/{doc}.md` の存在で判定。
 */
export function serviceDocExists(slug: string, doc: string, contentDir: string): boolean {
  return fs.existsSync(path.join(contentDir, 'services', slug, `${doc}.md`));
}

/**
 * 静的ページが実在するか確認する。
 * STATIC_ROUTES に含まれるか、`src/app/{path}/page.tsx` の存在で判定。
 */
export function staticPageExists(href: string, srcDir: string): boolean {
  if (STATIC_ROUTES.has(href)) {
    return true;
  }
  const relativePath = href === '/' ? '' : href;
  const pagePath = path.join(srcDir, 'app', relativePath, 'page.tsx');
  return fs.existsSync(pagePath);
}

/** validateHref の戻り値 */
export interface HrefValidationResult {
  valid: boolean;
  reason: string;
}

/**
 * href が有効なルートかどうかを判定する。
 *
 * @param href - 検証対象の href
 * @param contentDir - src/content ディレクトリの絶対パス
 * @param srcDir - src ディレクトリの絶対パス
 * @param publicDir - public ディレクトリの絶対パス（省略時は srcDir の兄弟 public を使用）
 */
export function validateHref(
  href: string,
  contentDir: string,
  srcDir: string,
  publicDir?: string
): HrefValidationResult {
  // publicDir が未指定の場合は srcDir の兄弟ディレクトリとして導出
  const resolvedPublicDir = publicDir ?? path.join(srcDir, '..', 'public');
  // 空文字や外部リンクは対象外
  if (!href || !href.startsWith('/')) {
    return { valid: true, reason: '' };
  }

  // /tech/{slug} パターン（/tech/tags や /tech/category は別パターン）
  const techMatch = href.match(/^\/tech\/([^/?#]+)$/);
  if (techMatch) {
    const slug = techMatch[1];
    if (slug === 'tags' || slug === 'category') return { valid: true, reason: '' };
    if (techArticleExists(slug, contentDir)) return { valid: true, reason: '' };
    return { valid: false, reason: ERROR_MESSAGES.TECH_ARTICLE_NOT_FOUND(slug) };
  }

  // /tech/tags/{tagSlug} パターン
  const techTagMatch = href.match(/^\/tech\/tags\/([^/?#]+)$/);
  if (techTagMatch) {
    const tagSlug = techTagMatch[1];
    if (techTagExists(tagSlug, contentDir)) return { valid: true, reason: '' };
    return { valid: false, reason: ERROR_MESSAGES.TECH_TAG_NOT_FOUND(tagSlug) };
  }

  // /tech/category/{slug} パターン
  const techCategoryMatch = href.match(/^\/tech\/category\/([^/?#]+)$/);
  if (techCategoryMatch) {
    const slug = techCategoryMatch[1];
    if (techCategoryExists(slug, contentDir)) return { valid: true, reason: '' };
    return { valid: false, reason: ERROR_MESSAGES.TECH_CATEGORY_NOT_FOUND(slug) };
  }

  // /services/{slug}/{doc} パターン
  const serviceDocMatch = href.match(/^\/services\/([^/?#]+)\/([^/?#]+)$/);
  if (serviceDocMatch) {
    const slug = serviceDocMatch[1];
    const doc = serviceDocMatch[2];
    if (serviceDocExists(slug, doc, contentDir)) return { valid: true, reason: '' };
    return { valid: false, reason: ERROR_MESSAGES.SERVICE_DOC_NOT_FOUND(slug, doc) };
  }

  // /services/{slug} パターン
  const serviceMatch = href.match(/^\/services\/([^/?#]+)$/);
  if (serviceMatch) {
    const slug = serviceMatch[1];
    if (serviceExists(slug, contentDir)) return { valid: true, reason: '' };
    return { valid: false, reason: ERROR_MESSAGES.SERVICE_NOT_FOUND(slug) };
  }

  // /services または /tech の一覧ページは静的ページとして判定済み
  if (href === '/services' || href === '/tech') return { valid: true, reason: '' };

  // 静的ページの確認
  if (staticPageExists(href, srcDir)) return { valid: true, reason: '' };

  // public/ 配下の静的ファイル（画像等）の確認
  // クエリ文字列を除去してから判定（アンカーは呼び出し元で除去済み）
  const hrefWithoutQuery = href.split('?')[0];
  if (publicFileExists(hrefWithoutQuery, resolvedPublicDir)) return { valid: true, reason: '' };

  return { valid: false, reason: ERROR_MESSAGES.PAGE_NOT_FOUND(href) };
}

/** checkAllInternalLinks のオプション */
export interface CheckOptions {
  /** src/content ディレクトリの絶対パス */
  contentDir: string;
  /** src ディレクトリの絶対パス */
  srcDir: string;
  /** portal web ルートの絶対パス（相対パス計算に使用） */
  portalDir: string;
}

/**
 * 指定ファイルのリンク切れを検出する。
 */
export function checkFile(filePath: string, options: CheckOptions): BrokenLink[] {
  const { contentDir, srcDir, portalDir } = options;
  const broken: BrokenLink[] = [];
  const content = fs.readFileSync(filePath, 'utf8');
  const links = extractInternalLinks(content);

  for (const { href, line } of links) {
    const { valid, reason } = validateHref(href, contentDir, srcDir);
    if (!valid) {
      broken.push({
        file: path.relative(portalDir, filePath),
        line,
        href,
        reason,
      });
    }
  }
  return broken;
}

/**
 * すべての対象ファイルを検査してリンク切れ一覧を返す。
 */
export function checkAllInternalLinks(options: CheckOptions): BrokenLink[] {
  const { contentDir, srcDir } = options;
  const mdFiles = walkFiles(contentDir, ['.md', '.mdx']);
  const tsxFiles = walkFiles(path.join(srcDir, 'app'), ['.tsx']);
  const allFiles = [...mdFiles, ...tsxFiles];

  const allBroken: BrokenLink[] = [];
  for (const file of allFiles) {
    allBroken.push(...checkFile(file, options));
  }
  return allBroken;
}
