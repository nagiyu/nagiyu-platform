import { REPOSITORY_BLOB_URL } from './constants';

export interface CardLink {
  label: string;
  /** サイト内リンクは base を含まない絶対パス、外部リンクは URL */
  href: string;
  external: boolean;
}

/** sources のパス (リポジトリルートから) を GitHub のファイルへのリンクにする。 */
export function sourceLink(path: string): CardLink {
  return { label: path, href: `${REPOSITORY_BLOB_URL}${path}`, external: true };
}

/** frontmatter の sources をリンクにする。文字列以外の要素は読み飛ばす。 */
export function parseSources(frontmatter: Record<string, unknown>): CardLink[] {
  const sources = frontmatter.sources;
  if (!Array.isArray(sources)) return [];
  return sources.filter((v): v is string => typeof v === 'string').map(sourceLink);
}
