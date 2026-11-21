import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ERROR_MESSAGES } from '../constants';
import type { LayoutTrees } from '../layout-tree';
import {
  INDEX_FILE,
  claim,
  isDirectory,
  isExcluded,
  readTitle,
  sortedNames,
  toLink,
  type BuildContext,
  type SidebarItem,
} from '../sidebar-utils';
import { CARD_KINDS, type StructureNode } from './site-structure';

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

    if (isDirectory(join(ctx.docsDir, relativePath))) {
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

/**
 * サービスの項目を作る。新しい配置の木を先に置き、旧配置の設計資料とカードを続ける。
 * サービスの一覧は、旧配置と新しい配置のどちらかに文書があるものすべて。
 */
function buildServices(
  ctx: BuildContext,
  node: Extract<StructureNode, { type: 'services' }>,
  trees: LayoutTrees
): SidebarItem[] {
  const dirNames = (dir: string) =>
    sortedNames(join(ctx.docsDir, dir)).filter(
      (name) =>
        isDirectory(join(ctx.docsDir, dir, name)) && !isExcluded(`${dir}/${name}`, ctx.excluded)
    );
  const services = [
    ...new Set([...dirNames(node.designDir), ...dirNames(node.cardsDir), ...trees.services.keys()]),
  ]
    .filter((name) => !node.excludeServices.includes(name))
    .sort((a, b) => a.localeCompare(b));

  return services.flatMap((name) => {
    const designDir = `${node.designDir}/${name}`;
    const indexRelative = `${designDir}/${INDEX_FILE}`;
    const hasIndex = existsSync(join(ctx.docsDir, indexRelative));
    if (hasIndex) claim(ctx, indexRelative);

    const design = [
      ...buildDesignFiles(ctx, designDir, node.designLabels),
      ...(node.extraDesign[name] ?? []).map((path) => pageItem(ctx, path)),
    ];
    const items = [
      ...(trees.services.get(name) ?? []),
      ...group(node.designTitle, false, design),
      ...CARD_KINDS.flatMap((kind) =>
        group(kind.title, false, buildFiles(ctx, `${node.cardsDir}/${name}/${kind.dir}`))
      ),
    ];
    if (!hasIndex && items.length === 0) return [];
    return [
      {
        text: hasIndex ? readTitle(join(ctx.docsDir, indexRelative), name) : name,
        ...(hasIndex ? { link: toLink(indexRelative) } : {}),
        collapsed: true,
        items,
      },
    ];
  });
}

function buildNode(ctx: BuildContext, node: StructureNode, trees: LayoutTrees): SidebarItem[] {
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
        node.items.flatMap((child) => buildNode(ctx, child, trees))
      );
    case 'services':
      return buildServices(ctx, node, trees);
    case 'platformTree':
      return trees.platform;
  }
}

/**
 * 旧配置の章立てからサイドバーを作る。新しい配置の木は、章立ての該当箇所に差し込む。
 */
export function buildLegacySidebar(
  ctx: BuildContext,
  structure: readonly StructureNode[],
  trees: LayoutTrees
): SidebarItem[] {
  return structure.flatMap((node) => buildNode(ctx, node, trees));
}
