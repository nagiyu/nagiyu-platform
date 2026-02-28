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

  it('ローディング状態を表示する', () => {
    expect(html).toContain('読み込み中...');
  });
});
