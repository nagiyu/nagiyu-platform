import { existsSync } from 'node:fs';
import { ERROR_MESSAGES } from './constants';
import { buildLayoutTrees, loadLayout, templateExclusion } from './layout-tree';
import {
  INDEX_FILE,
  claim,
  isExcluded,
  listMarkdown,
  toLink,
  type BuildContext,
  type SidebarItem,
} from './sidebar-utils';

const HOME_TITLE = 'はじめに';
const SERVICES_KEY = 'services';
const PLATFORM_KEY = 'platform';

/**
 * docs の中身からサイドバーを作る。手で一覧を保守しないための生成。
 * layout.json の patterns に当たる文書を木にし、ホームの README.md を先頭に「はじめに」として置く。
 * 配置に当たらない .md を黙って落とすと読み手から消えるため、載らないページ・
 * 2 か所に載るページがあれば例外で止める。
 *
 * @param docsDir docs ディレクトリの絶対パス
 * @param excluded サイトに載せない docs 直下からの相対パス (`dir/**`)。layout.json の雛形は自動で除く
 */
export function buildSidebar(docsDir: string, excluded: readonly string[]): SidebarItem[] {
  if (!existsSync(docsDir)) throw new Error(ERROR_MESSAGES.DOCS_DIR_NOT_FOUND(docsDir));
  const layout = loadLayout(docsDir);
  const allExcluded = [...excluded, templateExclusion(layout)];
  const ctx: BuildContext = {
    docsDir,
    excluded: allExcluded,
    claimed: new Set(),
    duplicates: new Set(),
  };

  const files = listMarkdown(docsDir).filter((path) => !isExcluded(path, allExcluded));
  const trees = buildLayoutTrees(docsDir, layout, files);
  trees.paths.forEach((path) => claim(ctx, path));

  const labels = layout.labels;
  const services = [...trees.services.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, items]): SidebarItem => ({ text: name, collapsed: true, items }));
  const sidebar: SidebarItem[] = [];
  if (files.includes(INDEX_FILE)) sidebar.push({ text: HOME_TITLE, link: toLink(INDEX_FILE) });
  if (services.length > 0) {
    sidebar.push({ text: labels[SERVICES_KEY] ?? SERVICES_KEY, collapsed: false, items: services });
  }
  if (trees.platform.length > 0) {
    sidebar.push({
      text: labels[PLATFORM_KEY] ?? PLATFORM_KEY,
      collapsed: false,
      items: trees.platform,
    });
  }

  if (ctx.duplicates.size > 0) {
    throw new Error(ERROR_MESSAGES.DUPLICATE_PAGES([...ctx.duplicates].sort()));
  }
  const unlisted = files.filter((path) => !ctx.claimed.has(path));
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
