import { defineComponent, h, type VNode } from 'vue';
import { useData } from 'vitepress';
import { parseSources, type CardLink } from '../../src/doc-meta';
import { parseLegacyMeta } from '../../src/legacy/card-meta';
import { renderLegacyAdrs, renderLegacyBadges } from './legacy/legacy-meta';
import { renderList } from './meta-render';

/** コードのパスは数が多く縦に長くなるため、畳んでおく。 */
function renderSources(links: CardLink[]): VNode | null {
  if (links.length === 0) return null;
  return h('details', { class: 'doc-meta-row' }, [
    h('summary', { class: 'doc-meta-title' }, `コード (${links.length} ファイル)`),
    renderList(links),
  ]);
}

/** 出典 (sources) を持つ文書と旧カードの本文の上に、出典と旧カードの情報を小さく出す。 */
export default defineComponent({
  name: 'DocMeta',
  setup() {
    const { frontmatter } = useData();
    return () => {
      const sources = parseSources(frontmatter.value);
      const legacy = parseLegacyMeta(frontmatter.value);
      if (sources.length === 0 && !legacy) return null;
      return h('aside', { class: 'doc-meta', 'aria-label': 'このページの情報' }, [
        legacy ? renderLegacyBadges(legacy) : null,
        renderSources(sources),
        legacy ? renderLegacyAdrs(legacy) : null,
      ]);
    };
  },
});
