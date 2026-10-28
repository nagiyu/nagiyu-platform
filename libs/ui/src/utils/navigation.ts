/**
 * ナビゲーション項目の「今いるページ」判定に必要な最小限の形。
 * Header の NavigationItem と構造的に互換にし、循環 import を避ける。
 */
export interface NavigationTarget {
  href: string;
  children?: NavigationTarget[];
}

/**
 * href / pathname を比較用のパスに正規化する。
 * クエリ・ハッシュを除き、末尾スラッシュを落とす。`/` で始まらない href（`#` 等）は null。
 */
function normalizePath(value: string): string | null {
  if (!value.startsWith('/')) {
    return null;
  }
  const path = value.split(/[?#]/)[0].replace(/\/+$/, '');
  return path === '' ? '/' : path;
}

/**
 * pathname が href のパスと一致、または区切り（`/`）単位で配下にあるかを返す。
 * `/tech-notes` が `/tech` に誤って一致しないよう、文字列の前方一致ではなく区切りで比べる。
 * `/` は完全一致のときだけ一致させる（全ページに一致して常時選択になるのを防ぐ）。
 */
function matchesPath(pathname: string, hrefPath: string): boolean {
  if (hrefPath === '/') {
    return pathname === '/';
  }
  return pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
}

/**
 * 現在のパスに最も長く一致するナビ項目（子項目を含む）を 1 件返す。
 * 一致なし・pathname が null のときは null。
 * href ではなく項目そのものを返すのは、同じ href を持つ別項目まで同時に選択されないようにするため。
 * 兄弟の `/mylist` と `/mylist/register` のように入れ子の href があっても 1 件に絞るため、最長一致を採る。
 */
export function findCurrentItem<T extends NavigationTarget>(
  items: T[],
  pathname: string | null
): T | null {
  if (pathname === null) {
    return null;
  }
  const current = normalizePath(pathname);
  if (current === null) {
    return null;
  }

  let best: T | null = null;
  let bestLength = -1;

  const visit = (list: T[]) => {
    for (const item of list) {
      const hrefPath = normalizePath(item.href);
      if (hrefPath !== null && matchesPath(current, hrefPath) && hrefPath.length > bestLength) {
        best = item;
        bestLength = hrefPath.length;
      }
      if (item.children) {
        visit(item.children as T[]);
      }
    }
  };
  visit(items);

  return best;
}
