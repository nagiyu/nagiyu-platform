import { REPOSITORY_BLOB_URL } from './constants';

export interface CardLink {
  label: string;
  /** サイト内リンクは base を含まない絶対パス、外部リンクは URL */
  href: string;
  external: boolean;
}

export interface CardMeta {
  kind?: string;
  service?: string;
  sources: CardLink[];
  adrs: CardLink[];
  cards: CardLink[];
  terms: CardLink[];
}

const KIND_LABELS: Record<string, string> = {
  batch: 'バッチ',
  flow: 'フロー',
  term: '用語',
  screen: '画面',
  api: 'API',
};

/** kind の表示名。未知の値はそのまま返す。 */
export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** sources のパス (リポジトリルートから) を GitHub のファイルへのリンクにする。 */
export function sourceLink(path: string): CardLink {
  return { label: path, href: `${REPOSITORY_BLOB_URL}${path}`, external: true };
}

/**
 * related_adr の参照 (`services/livetalk/architecture.md#2.12`) を docs 内のページへのリンクにする。
 * 見出しの ID は ADR 番号と一致しないため、リンク先はページまでにとどめ、番号は表示にだけ残す。
 */
export function adrLink(ref: string): CardLink {
  const [path] = ref.split('#');
  return { label: ref, href: `/${path.replace(/\.md$/, '')}`, external: false };
}

/** カード ID (`livetalk/term/care`) を仕様カードのページへのリンクにする。 */
export function cardLink(id: string): CardLink {
  return { label: id, href: `/specs/${id}`, external: false };
}

/**
 * frontmatter から表示用の情報を取り出す。仕様カードでなければ (kind が無ければ) undefined。
 */
export function parseCardMeta(frontmatter: Record<string, unknown>): CardMeta | undefined {
  const kind = frontmatter.kind;
  if (typeof kind !== 'string') return undefined;
  return {
    kind,
    service: typeof frontmatter.service === 'string' ? frontmatter.service : undefined,
    sources: toStringArray(frontmatter.sources).map(sourceLink),
    adrs: toStringArray(frontmatter.related_adr).map(adrLink),
    cards: toStringArray(frontmatter.related_cards).map(cardLink),
    terms: toStringArray(frontmatter.terms).map(cardLink),
  };
}
