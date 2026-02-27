import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SummariesPage from '../../../app/summaries/page';

describe('SummariesPage', () => {
  let html: string;

  beforeAll(() => {
    html = renderToStaticMarkup(React.createElement(SummariesPage));
  });

  it('見出しを表示する', () => {
    expect(html).toContain('日次サマリー');
  });

  it('データがある取引所の銘柄情報を表示する', () => {
    expect(html).toContain('NASDAQ');
    expect(html).toContain('Apple Inc.');
  });

  it('NYSE の銘柄情報を表示する', () => {
    expect(html).toContain('NYSE');
    expect(html).toContain('JPMorgan Chase');
  });
});
