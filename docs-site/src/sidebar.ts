import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ERROR_MESSAGES } from './constants';

export interface SidebarItem {
  text: string;
  link?: string;
  collapsed?: boolean;
  items?: SidebarItem[];
}

const INDEX_FILE = 'README.md';

/**
 * Markdown の最初の `# 見出し` を返す。コードブロック内の `#` を拾わないよう、フェンス内は読み飛ばす。
 *
 * @returns 見出しが無ければ undefined
 */
export function extractTitle(markdown: string): string | undefined {
  let inFence = false;
  for (const line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^#\s+(.+?)\s*#*\s*$/.exec(line);
    if (match) return match[1];
  }
  return undefined;
}

/** frontmatter (先頭の `---` で囲まれた部分) を取り除いた本文を返す。 */
function stripFrontmatter(markdown: string): string {
  const text = markdown.replace(/\r\n/g, '\n');
  if (!text.startsWith('---\n')) return text;
  const end = text.indexOf('\n---', 4);
  return end === -1 ? text : text.slice(end + 4);
}

/**
 * README.md を index.md として扱うための書き換え (VitePress の rewrites に渡す)。
 * パターン指定では直下の README.md と入れ子を 1 つで書けないため、関数で行う。
 */
export function readmeToIndex(path: string): string {
  return path.replace(/(^|\/)README\.md$/, '$1index.md');
}

/**
 * docs 内の相対パスを、サイトの URL に変換する。README.md はディレクトリの入口 (index) になる。
 *
 * @param relativePath docs 直下からの相対パス (例: `specs/README.md`)。base は含まない
 */
export function toLink(relativePath: string): string {
  const withoutExt = relativePath.replace(/\.md$/, '');
  if (withoutExt === 'README') return '/';
  if (withoutExt.endsWith('/README')) return `/${withoutExt.slice(0, -'README'.length)}`;
  return `/${withoutExt}`;
}

/** サイトに載せないパスかを判定する (`dir/**` 形式のみ対応)。 */
function isExcluded(relativePath: string, excluded: readonly string[]): boolean {
  return excluded.some((glob) => {
    const prefix = glob.replace(/\*\*$/, '');
    return relativePath === prefix.replace(/\/$/, '') || relativePath.startsWith(prefix);
  });
}

function readTitle(file: string, fallback: string): string {
  return extractTitle(stripFrontmatter(readFileSync(file, 'utf8'))) ?? fallback;
}

function buildDirectory(
  docsDir: string,
  relativeDir: string,
  excluded: readonly string[]
): SidebarItem[] {
  const absDir = join(docsDir, relativeDir);
  const entries = readdirSync(absDir).sort((a, b) => a.localeCompare(b));
  const files: SidebarItem[] = [];
  const dirs: SidebarItem[] = [];

  for (const name of entries) {
    const relativePath = relativeDir ? `${relativeDir}/${name}` : name;
    if (isExcluded(relativePath, excluded)) continue;
    const abs = join(docsDir, relativePath);

    if (statSync(abs).isDirectory()) {
      const items = buildDirectory(docsDir, relativePath, excluded);
      const indexPath = join(abs, INDEX_FILE);
      const hasIndex = existsSync(indexPath);
      if (!hasIndex && items.length === 0) continue;
      dirs.push({
        text: hasIndex ? readTitle(indexPath, name) : name,
        ...(hasIndex ? { link: toLink(`${relativePath}/${INDEX_FILE}`) } : {}),
        collapsed: true,
        items,
      });
    } else if (name.endsWith('.md') && name !== INDEX_FILE) {
      files.push({
        text: readTitle(abs, name.replace(/\.md$/, '')),
        link: toLink(relativePath),
      });
    }
  }
  return [...files, ...dirs];
}

/**
 * docs のディレクトリ構成からサイドバーを作る。手で一覧を保守しないための生成。
 * 各ディレクトリの README.md が入口になり、見出しは各ファイルの最初の `# 見出し` を使う。
 *
 * @param docsDir docs ディレクトリの絶対パス
 * @param excluded サイトに載せない docs 直下からの相対パス (`dir/**`)
 */
export function buildSidebar(docsDir: string, excluded: readonly string[]): SidebarItem[] {
  if (!existsSync(docsDir)) throw new Error(ERROR_MESSAGES.DOCS_DIR_NOT_FOUND(docsDir));
  const rootIndex = join(docsDir, INDEX_FILE);
  const top: SidebarItem[] = existsSync(rootIndex)
    ? [{ text: readTitle(rootIndex, 'docs'), link: '/' }]
    : [];
  return [...top, ...buildDirectory(docsDir, '', excluded)];
}

/**
 * 本文の `{{` を Vue の補間として解釈させないための文字参照に置き換える。
 * docs は GitHub 上の Markdown として書かれており、`{{ }}` は補間ではなく文字として読まれる。
 */
export function escapeInterpolation(html: string): string {
  return html.replace(/\{\{/g, '&#123;&#123;').replace(/\}\}/g, '&#125;&#125;');
}
