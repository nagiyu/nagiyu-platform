import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('@mui/material', () => {
  const createComponent = (tag: string) => {
    const MockComponent = ({ children, component, ...props }: Record<string, unknown>) => {
      const elementTag = (typeof component === 'string' ? component : tag) as string;
      const { sx, ...rest } = props as { sx?: unknown } & Record<string, unknown>;
      void sx;
      return React.createElement(elementTag, rest, children as React.ReactNode);
    };
    MockComponent.displayName = `Mock${tag}`;
    return MockComponent;
  };

  return {
    Box: createComponent('div'),
    Typography: createComponent('span'),
  };
});

jest.mock('@nagiyu/ui', () => {
  const Link = ({ children, href, target, rel, ...rest }: Record<string, unknown>) =>
    React.createElement(
      'a',
      { href: href as string, target: target as string, rel: rel as string, ...rest },
      children as React.ReactNode
    );
  Link.displayName = 'MockNagiyuLink';
  return { Link };
});

// react-markdown は ESM 専用のため、Jest からは直接ロードしない。
// MARKDOWN_COMPONENTS マップのみを named export で取り出してテストする。
jest.mock('react-markdown', () => ({ __esModule: true, default: () => null }));
jest.mock('remark-gfm', () => ({ __esModule: true, default: () => undefined }));

import { MARKDOWN_COMPONENTS } from '../../../components/AiAnalysisMarkdown';

const renderComponent = (
  key: keyof typeof MARKDOWN_COMPONENTS,
  props: Record<string, unknown>,
  children?: React.ReactNode
) => {
  const Component = MARKDOWN_COMPONENTS[key] as React.ComponentType<Record<string, unknown>>;
  return renderToStaticMarkup(React.createElement(Component, props, children));
};

describe('AiAnalysisMarkdown - MARKDOWN_COMPONENTS', () => {
  it('リンクは MUI Link 経由で a タグとなり、新規タブで開く属性を付与する', () => {
    const html = renderComponent('a', { href: 'https://example.com' }, 'リンク先');

    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('リンク先');
  });

  it('段落は p タグとしてレンダリングされる', () => {
    const html = renderComponent('p', {}, '本日は大きな値動きが見られました。');

    expect(html).toContain('<p');
    expect(html).toContain('本日は大きな値動きが見られました。');
  });

  it('箇条書き（ul, li）は ul/li タグとしてレンダリングされる', () => {
    const ulHtml = renderComponent('ul', {}, '上昇トレンド');
    const liHtml = renderComponent('li', {}, 'ボリューム増加');

    expect(ulHtml).toContain('<ul');
    expect(ulHtml).toContain('上昇トレンド');
    expect(liHtml).toContain('<li');
    expect(liHtml).toContain('ボリューム増加');
  });

  it('番号付きリスト（ol）は ol タグとしてレンダリングされる', () => {
    const html = renderComponent('ol', {}, '一番目');

    expect(html).toContain('<ol');
    expect(html).toContain('一番目');
  });

  it('強調（strong, em）は strong/em タグとしてレンダリングされる', () => {
    const strongHtml = renderComponent('strong', {}, '重要');
    const emHtml = renderComponent('em', {}, '強調');

    expect(strongHtml).toContain('<strong');
    expect(strongHtml).toContain('重要');
    expect(emHtml).toContain('<em');
    expect(emHtml).toContain('強調');
  });

  it('コードは code タグとしてレンダリングされる', () => {
    const html = renderComponent('code', {}, 'AAPL');

    expect(html).toContain('<code');
    expect(html).toContain('AAPL');
  });

  it('見出し（h1, h2, h3）はそれぞれ h3, h4, h5 タグとしてレンダリングされる', () => {
    const h1Html = renderComponent('h1', {}, '見出し1');
    const h2Html = renderComponent('h2', {}, '見出し2');
    const h3Html = renderComponent('h3', {}, '見出し3');

    expect(h1Html).toContain('<h3');
    expect(h1Html).toContain('見出し1');
    expect(h2Html).toContain('<h4');
    expect(h2Html).toContain('見出し2');
    expect(h3Html).toContain('<h5');
    expect(h3Html).toContain('見出し3');
  });
});
