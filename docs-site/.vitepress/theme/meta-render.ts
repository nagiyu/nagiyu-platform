import { h, type VNode } from 'vue';
import { withBase } from 'vitepress';
import type { CardLink } from '../../src/doc-meta';

export function renderList(links: CardLink[]): VNode {
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

export function renderLinks(title: string, links: CardLink[]): VNode | null {
  if (links.length === 0) return null;
  return h('div', { class: 'doc-meta-row' }, [
    h('span', { class: 'doc-meta-title' }, title),
    renderList(links),
  ]);
}
