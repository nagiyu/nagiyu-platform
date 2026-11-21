import type { CardLink } from '../doc-meta';
import { CARD_KINDS } from './site-structure';

/** 旧カード (frontmatter に kind があるもの) だけが本文の上に出す情報 */
export interface LegacyCardMeta {
  kind: string;
  service?: string;
  adrs: CardLink[];
}

const KIND_LABELS: Record<string, string> = Object.fromEntries(
  CARD_KINDS.map((kind) => [kind.dir, kind.title])
);

/** kind の表示名。未知の値はそのまま返す。 */
export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

/**
 * related_adr の参照 (`services/livetalk/architecture.md#2.12`) を docs 内のページへのリンクにする。
 * 見出しの ID は ADR 番号と一致しないため、リンク先はページまでにとどめ、番号は表示にだけ残す。
 */
export function adrLink(ref: string): CardLink {
  const [path] = ref.split('#');
  return { label: ref, href: `/${path.replace(/\.md$/, '')}`, external: false };
}

/** 旧カードでなければ (kind が無ければ) undefined。 */
export function parseLegacyMeta(frontmatter: Record<string, unknown>): LegacyCardMeta | undefined {
  const kind = frontmatter.kind;
  if (typeof kind !== 'string') return undefined;
  const adrs = Array.isArray(frontmatter.related_adr)
    ? frontmatter.related_adr.filter((v): v is string => typeof v === 'string')
    : [];
  return {
    kind,
    service: typeof frontmatter.service === 'string' ? frontmatter.service : undefined,
    adrs: adrs.map(adrLink),
  };
}
