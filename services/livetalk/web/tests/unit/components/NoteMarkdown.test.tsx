import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// @mui/material はサーバーサイドレンダリングで sx を処理できないため、軽量なモックに置き換える。
jest.mock('@mui/material', () => {
  const createComponent = (tag: string) => {
    const MockComponent = ({ children, component, ...props }: Record<string, unknown>) => {
      const elementTag = (typeof component === 'string' ? component : tag) as string;
      // sx はスタイルプロパティのため DOM に渡さない
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

// @nagiyu/ui の Link を a タグにマッピングするモック
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

// react-markdown は ESM 専用のため Jest から直接ロードしない。
// MARKDOWN_COMPONENTS マップを named export から取り出してテストする。
jest.mock('react-markdown', () => ({ __esModule: true, default: () => null }));
jest.mock('remark-gfm', () => ({ __esModule: true, default: () => undefined }));

import { MARKDOWN_COMPONENTS } from '../../../src/components/NoteMarkdown';

/**
 * MARKDOWN_COMPONENTS の各マッピングを renderToStaticMarkup で検証するヘルパー。
 */
const renderComponent = (
  key: keyof typeof MARKDOWN_COMPONENTS,
  props: Record<string, unknown>,
  children?: React.ReactNode
) => {
  const Component = MARKDOWN_COMPONENTS[key] as React.ComponentType<Record<string, unknown>>;
  return renderToStaticMarkup(React.createElement(Component, props, children));
};

describe('NoteMarkdown - MARKDOWN_COMPONENTS', () => {
  it('リンクは nagiyu/ui Link 経由で a タグとなり、新規タブで開く属性を付与する', () => {
    const html = renderComponent('a', { href: 'https://example.com' }, 'リンク先');

    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('リンク先');
  });

  it('段落は p タグとしてレンダリングされる', () => {
    const html = renderComponent('p', {}, 'ノートの本文テキストです。');

    expect(html).toContain('<p');
    expect(html).toContain('ノートの本文テキストです。');
  });

  it('箇条書き（ul, li）は ul/li タグとしてレンダリングされる', () => {
    const ulHtml = renderComponent('ul', {}, '項目一覧');
    const liHtml = renderComponent('li', {}, '各項目の内容');

    expect(ulHtml).toContain('<ul');
    expect(ulHtml).toContain('項目一覧');
    expect(liHtml).toContain('<li');
    expect(liHtml).toContain('各項目の内容');
  });

  it('番号付きリスト（ol）は ol タグとしてレンダリングされる', () => {
    const html = renderComponent('ol', {}, '一番目の手順');

    expect(html).toContain('<ol');
    expect(html).toContain('一番目の手順');
  });

  it('強調（strong, em）は strong/em タグとしてレンダリングされる', () => {
    const strongHtml = renderComponent('strong', {}, '重要なポイント');
    const emHtml = renderComponent('em', {}, '補足説明');

    expect(strongHtml).toContain('<strong');
    expect(strongHtml).toContain('重要なポイント');
    expect(emHtml).toContain('<em');
    expect(emHtml).toContain('補足説明');
  });

  it('インラインコードは code タグとしてレンダリングされる', () => {
    const html = renderComponent('code', {}, 'someFunction()');

    expect(html).toContain('<code');
    expect(html).toContain('someFunction()');
  });

  it('見出し（h1, h2, h3）はそれぞれ h3, h4, h5 タグとしてレンダリングされる', () => {
    const h1Html = renderComponent('h1', {}, '大見出し');
    const h2Html = renderComponent('h2', {}, '中見出し');
    const h3Html = renderComponent('h3', {}, '小見出し');

    expect(h1Html).toContain('<h3');
    expect(h1Html).toContain('大見出し');
    expect(h2Html).toContain('<h4');
    expect(h2Html).toContain('中見出し');
    expect(h3Html).toContain('<h5');
    expect(h3Html).toContain('小見出し');
  });
});
