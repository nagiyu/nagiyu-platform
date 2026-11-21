import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface SidebarItem {
  text: string;
  link?: string;
  collapsed?: boolean;
  items?: SidebarItem[];
}

export const INDEX_FILE = 'README.md';

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
export function isExcluded(relativePath: string, excluded: readonly string[]): boolean {
  return excluded.some((glob) => {
    const prefix = glob.replace(/\*\*$/, '');
    return relativePath === prefix.replace(/\/$/, '') || relativePath.startsWith(prefix);
  });
}

/** ファイルの最初の `# 見出し` (frontmatter は除く)。無ければ fallback。 */
export function readTitle(file: string, fallback: string): string {
  return extractTitle(stripFrontmatter(readFileSync(file, 'utf8'))) ?? fallback;
}

export function sortedNames(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).sort((a, b) => a.localeCompare(b)) : [];
}

export function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

/** docs 配下の .md を docs 直下からの相対パスで列挙する。 */
export function listMarkdown(docsDir: string, relativeDir = ''): string[] {
  return sortedNames(join(docsDir, relativeDir)).flatMap((name) => {
    const relativePath = relativeDir ? `${relativeDir}/${name}` : name;
    if (isDirectory(join(docsDir, relativePath))) return listMarkdown(docsDir, relativePath);
    return name.endsWith('.md') ? [relativePath] : [];
  });
}

/** 生成中に、どのページを載せたかを集める。漏れと重複の検出に使う。 */
export interface BuildContext {
  docsDir: string;
  excluded: readonly string[];
  claimed: Set<string>;
  duplicates: Set<string>;
}

export function claim(ctx: BuildContext, relativePath: string): void {
  if (ctx.claimed.has(relativePath)) ctx.duplicates.add(relativePath);
  ctx.claimed.add(relativePath);
}
