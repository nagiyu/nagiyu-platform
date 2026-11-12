import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ERROR_MESSAGES } from './constants';
import { CARD_KINDS, type StructureNode } from './site-structure';

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

/** 生成中に、どのページを載せたかを集める。漏れと重複の検出に使う。 */
interface BuildContext {
  docsDir: string;
  excluded: readonly string[];
  claimed: Set<string>;
  duplicates: Set<string>;
}

function claim(ctx: BuildContext, relativePath: string): void {
  if (ctx.claimed.has(relativePath)) ctx.duplicates.add(relativePath);
  ctx.claimed.add(relativePath);
}

function sortedNames(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).sort((a, b) => a.localeCompare(b)) : [];
}

function isDirectory(path: string): boolean {
  return existsSync(path) && statSync(path).isDirectory();
}

function pageItem(ctx: BuildContext, relativePath: string, title?: string): SidebarItem {
  const abs = join(ctx.docsDir, relativePath);
  if (!existsSync(abs)) throw new Error(ERROR_MESSAGES.PAGE_NOT_FOUND(relativePath));
  claim(ctx, relativePath);
  const fallback = relativePath.replace(/^.*\//, '').replace(/\.md$/, '');
  return { text: title ?? readTitle(abs, fallback), link: toLink(relativePath) };
}

function buildFiles(
  ctx: BuildContext,
  relativeDir: string,
  exclude: readonly string[] = []
): SidebarItem[] {
  return sortedNames(join(ctx.docsDir, relativeDir))
    .filter((name) => name.endsWith('.md') && name !== INDEX_FILE)
    .map((name) => `${relativeDir}/${name}`)
    .filter((path) => !exclude.includes(path) && !isExcluded(path, ctx.excluded))
    .map((path) => pageItem(ctx, path));
}

function buildDirectory(ctx: BuildContext, relativeDir: string): SidebarItem[] {
  const files: SidebarItem[] = [];
  const dirs: SidebarItem[] = [];

  for (const name of sortedNames(join(ctx.docsDir, relativeDir))) {
    const relativePath = relativeDir ? `${relativeDir}/${name}` : name;
    if (isExcluded(relativePath, ctx.excluded)) continue;
    const abs = join(ctx.docsDir, relativePath);

    if (statSync(abs).isDirectory()) {
      const item = buildDirectoryItem(ctx, relativePath);
      if (item) dirs.push(item);
    } else if (name.endsWith('.md') && name !== INDEX_FILE) {
      files.push(pageItem(ctx, relativePath));
    }
  }
  return [...files, ...dirs];
}

/** ディレクトリ 1 つ分の入れ子の項目。入口も配下も無ければ undefined。 */
function buildDirectoryItem(
  ctx: BuildContext,
  relativePath: string,
  title?: string
): SidebarItem | undefined {
  const items = buildDirectory(ctx, relativePath);
  const indexRelative = `${relativePath}/${INDEX_FILE}`;
  const hasIndex = existsSync(join(ctx.docsDir, indexRelative));
  if (!hasIndex && items.length === 0) return undefined;
  if (hasIndex) claim(ctx, indexRelative);
  const name = relativePath.replace(/^.*\//, '');
  return {
    text: title ?? (hasIndex ? readTitle(join(ctx.docsDir, indexRelative), name) : name),
    ...(hasIndex ? { link: toLink(indexRelative) } : {}),
    collapsed: true,
    items,
  };
}

function group(title: string, collapsed: boolean, items: SidebarItem[]): SidebarItem[] {
  return items.length === 0 ? [] : [{ text: title, collapsed, items }];
}

/** 設計資料を、名前の対応表の順に、表の名前で並べる。表に無いものは見出しのまま後ろに並べる。 */
function buildDesignFiles(
  ctx: BuildContext,
  relativeDir: string,
  labels: Readonly<Record<string, string>>
): SidebarItem[] {
  const order = Object.keys(labels);
  const rank = (name: string) => (order.includes(name) ? order.indexOf(name) : order.length);
  return sortedNames(join(ctx.docsDir, relativeDir))
    .filter((name) => name.endsWith('.md') && name !== INDEX_FILE)
    .filter((name) => !isExcluded(`${relativeDir}/${name}`, ctx.excluded))
    .sort((a, b) => rank(a) - rank(b))
    .map((name) => pageItem(ctx, `${relativeDir}/${name}`, labels[name]));
}

function buildServices(
  ctx: BuildContext,
  node: Extract<StructureNode, { type: 'services' }>
): SidebarItem[] {
  const dirNames = (dir: string) =>
    sortedNames(join(ctx.docsDir, dir)).filter((name) => isDirectory(join(ctx.docsDir, dir, name)));
  const services = [...new Set([...dirNames(node.designDir), ...dirNames(node.cardsDir)])]
    .filter((name) => !node.excludeServices.includes(name))
    .sort((a, b) => a.localeCompare(b));

  return services.map((name) => {
    const designDir = `${node.designDir}/${name}`;
    const indexRelative = `${designDir}/${INDEX_FILE}`;
    const hasIndex = existsSync(join(ctx.docsDir, indexRelative));
    if (hasIndex) claim(ctx, indexRelative);

    const design = [
      ...buildDesignFiles(ctx, designDir, node.designLabels),
      ...(node.extraDesign[name] ?? []).map((path) => pageItem(ctx, path)),
    ];
    const items = [
      ...group(node.designTitle, false, design),
      ...CARD_KINDS.flatMap((kind) =>
        group(kind.title, false, buildFiles(ctx, `${node.cardsDir}/${name}/${kind.dir}`))
      ),
    ];
    return {
      text: hasIndex ? readTitle(join(ctx.docsDir, indexRelative), name) : name,
      ...(hasIndex ? { link: toLink(indexRelative) } : {}),
      collapsed: true,
      items,
    };
  });
}

function buildNode(ctx: BuildContext, node: StructureNode): SidebarItem[] {
  switch (node.type) {
    case 'page':
      return [pageItem(ctx, node.path, node.title)];
    case 'files':
      return buildFiles(ctx, node.dir, node.exclude);
    case 'directory': {
      const item = buildDirectoryItem(ctx, node.path, node.title);
      if (!item) return [];
      return [node.collapsed === undefined ? item : { ...item, collapsed: node.collapsed }];
    }
    case 'group':
      return group(
        node.title,
        node.collapsed,
        node.items.flatMap((child) => buildNode(ctx, child))
      );
    case 'services':
      return buildServices(ctx, node);
  }
}

/** docs 配下の .md を docs 直下からの相対パスで列挙する。 */
function listMarkdown(docsDir: string, relativeDir = ''): string[] {
  return sortedNames(join(docsDir, relativeDir)).flatMap((name) => {
    const relativePath = relativeDir ? `${relativeDir}/${name}` : name;
    if (isDirectory(join(docsDir, relativePath))) return listMarkdown(docsDir, relativePath);
    return name.endsWith('.md') ? [relativePath] : [];
  });
}

/**
 * 章立て (structure) と docs の中身からサイドバーを作る。手で一覧を保守しないための生成。
 * どの章にも当たらない .md を黙って落とすと読み手から消えるため、載らないページ・
 * 2 か所に載るページがあれば例外で止める。
 *
 * @param docsDir docs ディレクトリの絶対パス
 * @param excluded サイトに載せない docs 直下からの相対パス (`dir/**`)
 * @param structure 章立て
 */
export function buildSidebar(
  docsDir: string,
  excluded: readonly string[],
  structure: readonly StructureNode[]
): SidebarItem[] {
  if (!existsSync(docsDir)) throw new Error(ERROR_MESSAGES.DOCS_DIR_NOT_FOUND(docsDir));
  const ctx: BuildContext = { docsDir, excluded, claimed: new Set(), duplicates: new Set() };
  const sidebar = structure.flatMap((node) => buildNode(ctx, node));

  if (ctx.duplicates.size > 0) {
    throw new Error(ERROR_MESSAGES.DUPLICATE_PAGES([...ctx.duplicates].sort()));
  }
  const unlisted = listMarkdown(docsDir).filter(
    (path) => !ctx.claimed.has(path) && !isExcluded(path, excluded)
  );
  if (unlisted.length > 0) throw new Error(ERROR_MESSAGES.UNLISTED_PAGES(unlisted));
  return sidebar;
}

/**
 * 本文の `{{` を Vue の補間として解釈させないための文字参照に置き換える。
 * docs は GitHub 上の Markdown として書かれており、`{{ }}` は補間ではなく文字として読まれる。
 */
export function escapeInterpolation(html: string): string {
  return html.replace(/\{\{/g, '&#123;&#123;').replace(/\}\}/g, '&#125;&#125;');
}
