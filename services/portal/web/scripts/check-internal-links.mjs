// @ts-check
/**
 * Portal 内部リンクチェックスクリプト
 *
 * Markdown / MDX コンテンツおよび JSX ページコンポーネントから内部リンクを抽出し、
 * 対応するファイルやルートが実在するかを検証します。
 *
 * 使用方法: node scripts/check-internal-links.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/** @typedef {{ file: string; line: number; href: string; reason: string }} BrokenLink */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Portal web ディレクトリの絶対パス */
const PORTAL_DIR = path.resolve(__dirname, '..');
/** コンテンツディレクトリ */
const CONTENT_DIR = path.join(PORTAL_DIR, 'src', 'content');
/** src ディレクトリ */
const SRC_DIR = path.join(PORTAL_DIR, 'src');
/** public ディレクトリ（静的ファイルの存在確認に使用） */
const PUBLIC_DIR = path.join(PORTAL_DIR, 'public');

/**
 * 静的ページの存在パス一覧（app ディレクトリ内に page.tsx があるルート）
 * Next.js の App Router に合わせて定義。
 */
const STATIC_ROUTES = new Set(['/', '/about', '/privacy', '/terms', '/tech']);

/**
 * ファイルを再帰的に列挙する
 * @param {string} dir - 探索ディレクトリ
 * @param {string[]} exts - 対象拡張子（例: ['.md', '.tsx']）
 * @returns {string[]}
 */
function walkFiles(dir, exts) {
  if (!fs.existsSync(dir)) return [];
  /** @type {string[]} */
  const results = [];
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
 * 以下パターンを対象とする:
 * - Markdown: `[text](/path)` 形式
 * - JSX Link/a: `href="/path"` 形式
 * アンカー部（#anchor）は除外し、外部リンク（http:// / https://）は除外する。
 *
 * @param {string} content - ファイルの内容
 * @returns {{ href: string; line: number }[]}
 */
function extractInternalLinks(content) {
  /** @type {{ href: string; line: number }[]} */
  const links = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Markdown リンク: [text](/path) または [text](/path "title")
    const mdLinkRegex = /\[[^\]]*\]\((\S+?)(?:\s+"[^"]*")?\)/g;
    let match;
    while ((match = mdLinkRegex.exec(line)) !== null) {
      const href = match[1].split('#')[0]; // アンカー除去
      if (href.startsWith('/') && !href.startsWith('//')) {
        links.push({ href, line: lineNumber });
      }
    }

    // JSX/TSX の href 属性: href="/path" または href={`/path`}
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
 * `/tech/{slug}` ルートが実在するか確認する。
 * `src/content/tech/{slug}.md` の存在で判定。
 * @param {string} slug
 * @returns {boolean}
 */
function techArticleExists(slug) {
  return fs.existsSync(path.join(CONTENT_DIR, 'tech', `${slug}.md`));
}

/**
 * 静的ページが実在するか確認する。
 * `src/app/{path}/page.tsx` の存在で判定。
 * @param {string} href
 * @returns {boolean}
 */
function staticPageExists(href) {
  if (STATIC_ROUTES.has(href)) {
    return true;
  }
  // app ディレクトリに page.tsx があるか直接確認
  const relativePath = href === '/' ? '' : href;
  const pagePath = path.join(SRC_DIR, 'app', relativePath, 'page.tsx');
  return fs.existsSync(pagePath);
}

/**
 * href が有効なルートかどうかを判定する。
 * @param {string} href
 * @returns {{ valid: boolean; reason: string }}
 */
function validateHref(href) {
  // 空文字や外部リンクは対象外
  if (!href || !href.startsWith('/')) {
    return { valid: true, reason: '' };
  }

  // /tech/{slug} パターン（/tech/category は別パターンで扱わず、記事として判定する）
  const techMatch = href.match(/^\/tech\/([^/?#]+)$/);
  if (techMatch) {
    const slug = techMatch[1];
    // /tech/category は廃止済みルートのため、記事として判定しそのまま無効とする。
    if (techArticleExists(slug)) return { valid: true, reason: '' };
    return { valid: false, reason: `技術記事 src/content/tech/${slug}.md が存在しない` };
  }

  // 上記いずれの分岐にも該当しないパス（例: /services・/tech/tags・/tech/category/*）は、
  // 静的ページ・public ファイルにも無ければ「対応するページが存在しない」として無効になる。

  // /tech のみ（一覧ページ）は静的ページとして判定済み
  if (href === '/tech') return { valid: true, reason: '' };

  // 静的ページの確認
  if (staticPageExists(href)) return { valid: true, reason: '' };

  // public/ 配下の静的ファイル（画像等）の確認
  // クエリ文字列を除去してから判定（アンカーは呼び出し元で除去済み）
  // 同等のロジックを src/lib/linkChecker.ts にも実装。両者を同期すること。
  const hrefWithoutQuery = href.split('?')[0];
  const resolved = path.resolve(PUBLIC_DIR, '.' + hrefWithoutQuery);
  // パストラバーサル防御: resolved が PUBLIC_DIR の配下であることを確認
  const isInsidePublic = resolved === PUBLIC_DIR || resolved.startsWith(PUBLIC_DIR + path.sep);
  if (isInsidePublic && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
    return { valid: true, reason: '' };
  }

  return { valid: false, reason: `対応するページが存在しない (${href})` };
}

/**
 * 指定ファイルのリンク切れを検出する。
 * @param {string} filePath - 絶対パス
 * @returns {BrokenLink[]}
 */
function checkFile(filePath) {
  /** @type {BrokenLink[]} */
  const broken = [];
  const content = fs.readFileSync(filePath, 'utf8');
  const links = extractInternalLinks(content);

  for (const { href, line } of links) {
    const { valid, reason } = validateHref(href);
    if (!valid) {
      broken.push({
        file: path.relative(PORTAL_DIR, filePath),
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
 * @returns {BrokenLink[]}
 */
export function checkAllInternalLinks() {
  const mdFiles = walkFiles(CONTENT_DIR, ['.md', '.mdx']);
  const tsxFiles = walkFiles(path.join(SRC_DIR, 'app'), ['.tsx']);
  const allFiles = [...mdFiles, ...tsxFiles];

  /** @type {BrokenLink[]} */
  const allBroken = [];
  for (const file of allFiles) {
    allBroken.push(...checkFile(file));
  }
  return allBroken;
}

// CLI として直接実行された場合のみ出力を行う
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const startTime = Date.now();
  const broken = checkAllInternalLinks();
  const elapsed = Date.now() - startTime;

  if (broken.length === 0) {
    console.log(`内部リンク切れなし（検査完了 ${elapsed}ms）`);
    process.exit(0);
  } else {
    console.error(`内部リンク切れ ${broken.length} 件を検出（検査完了 ${elapsed}ms）\n`);
    for (const item of broken) {
      console.error(`  ${item.file}:${item.line}  ${item.href}`);
      console.error(`    理由: ${item.reason}`);
    }
    process.exit(1);
  }
}
