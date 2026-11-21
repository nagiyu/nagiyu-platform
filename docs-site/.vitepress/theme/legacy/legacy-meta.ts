import { h, type VNode } from 'vue';
import { kindLabel, type LegacyCardMeta } from '../../../src/legacy/card-meta';
import { renderLinks } from '../meta-render';

/** 旧カードの種別とサービスのバッジ */
export function renderLegacyBadges(meta: LegacyCardMeta): VNode {
  return h('div', { class: 'doc-meta-badges' }, [
    h('span', { class: 'doc-meta-badge' }, kindLabel(meta.kind)),
    meta.service ? h('span', { class: 'doc-meta-badge' }, meta.service) : null,
  ]);
}

export function renderLegacyAdrs(meta: LegacyCardMeta): VNode | null {
  return renderLinks('関連する ADR', meta.adrs);
}
