import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ERROR_MESSAGES } from './constants';
import { readTitle, toLink, type SidebarItem } from './sidebar-utils';

/** docs/layout.json のうち、サイドバーが使う部分 */
export interface Layout {
  patterns: readonly string[];
  template: string;
  labels: Readonly<Record<string, string>>;
}

/** 新しい配置の文書から作ったサイドバーの木 */
export interface LayoutTrees {
  /** サービス名 → `services/<service>/` の下の木 */
  services: ReadonlyMap<string, SidebarItem[]>;
  /** `platform/` の下の木 */
  platform: SidebarItem[];
  /** 木に載せた文書の docs 直下からの相対パス */
  paths: string[];
}

const LAYOUT_FILE = 'layout.json';
const SERVICES_ROOT = 'services';
const PLATFORM_ROOT = 'platform';

export function loadLayout(docsDir: string): Layout {
  const file = join(docsDir, LAYOUT_FILE);
  if (!existsSync(file)) throw new Error(ERROR_MESSAGES.LAYOUT_NOT_FOUND(file));
  return JSON.parse(readFileSync(file, 'utf8')) as Layout;
}

/** 雛形のディレクトリ配下を除外するパターン (`dir/**` 形式)。雛形は読み物ではないため。 */
export function templateExclusion(layout: Layout): string {
  return `${layout.template}/**`;
}

interface Segment {
  regex: RegExp;
  /** プレースホルダを含まない固定の名前か。固定の名前だけが表示名の対応表を引ける */
  literal: boolean;
}

function compileSegment(segment: string): Segment {
  const literal = !/<[a-z]+>/.test(segment);
  const source = segment
    .split(/(<[a-z]+>)/)
    .map((part) =>
      /^<[a-z]+>$/.test(part) ? '([^/]+)' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    )
    .join('');
  return { regex: new RegExp(`^${source}$`), literal };
}

interface TreeNode {
  literal: boolean;
  /** 配下のファイルに当たった patterns の最小の番号。並びを patterns の順にするため */
  rank: number;
  children: Map<string, TreeNode>;
  /** ファイルなら docs 直下からの相対パス */
  path?: string;
}

function newNode(literal: boolean, rank: number): TreeNode {
  return { literal, rank, children: new Map() };
}

function toItems(docsDir: string, labels: Layout['labels'], node: TreeNode): SidebarItem[] {
  return [...node.children.entries()]
    .sort(([a, x], [b, y]) => x.rank - y.rank || a.localeCompare(b))
    .map(([name, child]): SidebarItem => {
      const label = child.literal ? labels[name] : undefined;
      if (child.path !== undefined) {
        const fallback = name.replace(/\.md$/, '');
        return {
          text: label ?? readTitle(join(docsDir, child.path), fallback),
          link: toLink(child.path),
        };
      }
      return {
        text: label ?? name,
        collapsed: false,
        items: toItems(docsDir, labels, child),
      };
    });
}

/**
 * 新しい配置の文書から、サイドバーの木を作る。
 * patterns に当たる文書だけを木にし、並びは patterns の順、同じ形に当たるものは名前順にする。
 * 当たらない文書 (旧配置) は触らない。
 *
 * @param files docs 直下からの相対パス。除外すべきものは呼び出し側で除いておく
 */
export function buildLayoutTrees(
  docsDir: string,
  layout: Layout,
  files: readonly string[]
): LayoutTrees {
  const patterns = layout.patterns.map((pattern) => pattern.split('/').map(compileSegment));
  const root = newNode(true, Infinity);
  const paths: string[] = [];

  for (const path of files) {
    const parts = path.split('/');
    const index = patterns.findIndex(
      (segments) =>
        segments.length === parts.length &&
        segments.every((segment, i) => segment.regex.test(parts[i]))
    );
    if (index === -1) continue;

    paths.push(path);
    let node = root;
    parts.forEach((part, i) => {
      let child = node.children.get(part);
      if (!child) {
        child = newNode(patterns[index][i].literal, index);
        node.children.set(part, child);
      }
      child.rank = Math.min(child.rank, index);
      if (i === parts.length - 1) child.path = path;
      node = child;
    });
  }

  const services = new Map<string, SidebarItem[]>();
  const serviceRoot = root.children.get(SERVICES_ROOT);
  const platformRoot = root.children.get(PLATFORM_ROOT);
  for (const [name, node] of serviceRoot?.children ?? []) {
    services.set(name, toItems(docsDir, layout.labels, node));
  }
  return {
    services,
    platform: platformRoot ? toItems(docsDir, layout.labels, platformRoot) : [],
    paths,
  };
}
