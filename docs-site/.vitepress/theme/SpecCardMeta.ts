import { defineComponent, h, type VNode } from 'vue';
import { useData, withBase } from 'vitepress';
import { kindLabel, parseCardMeta, type CardLink } from '../../src/card-links';

function renderList(links: CardLink[]): VNode {
  return h(
    'ul',
    links.map((link) =>
      h('li', [
        h(
          'a',
          link.external
            ? { href: link.href, target: '_blank', rel: 'noopener noreferrer' }
            : { href: withBase(link.href) },
          link.label
        ),
      ])
    )
  );
}

function renderLinks(title: string, links: CardLink[]): VNode | null {
  if (links.length === 0) return null;
  return h('div', { class: 'spec-meta-row' }, [
    h('span', { class: 'spec-meta-title' }, title),
    renderList(links),
  ]);
}

/** コードのパスは数が多く縦に長くなるため、畳んでおく。 */
function renderSources(links: CardLink[]): VNode | null {
  if (links.length === 0) return null;
  return h('details', { class: 'spec-meta-row' }, [
    h('summary', { class: 'spec-meta-title' }, `コード (${links.length} ファイル)`),
    renderList(links),
  ]);
}

/** frontmatter に kind があるページ (仕様カード) の本文の上に、種別と関連情報を小さく出す。 */
export default defineComponent({
  name: 'SpecCardMeta',
  setup() {
    const { frontmatter } = useData();
    return () => {
      const meta = parseCardMeta(frontmatter.value);
      if (!meta) return null;
      return h('aside', { class: 'spec-meta', 'aria-label': 'このページの情報' }, [
        h('div', { class: 'spec-meta-badges' }, [
          h('span', { class: 'spec-meta-badge' }, kindLabel(meta.kind ?? '')),
          meta.service ? h('span', { class: 'spec-meta-badge' }, meta.service) : null,
        ]),
        renderSources(meta.sources),
        renderLinks('関連する ADR', meta.adrs),
        renderLinks('関連するカード', meta.cards),
        renderLinks('用語', meta.terms),
      ]);
    };
  },
});
