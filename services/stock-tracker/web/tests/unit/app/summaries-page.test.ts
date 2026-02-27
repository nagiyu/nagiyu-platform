import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SummariesPage from '../../../app/summaries/page';

describe('SummariesPage', () => {
  it('仮データの取引所グループと空状態を表示する', () => {
    const html = renderToStaticMarkup(React.createElement(SummariesPage));

    expect(html).toContain('日次サマリー');
    expect(html).toContain('NASDAQ');
    expect(html).toContain('Apple Inc.');
    expect(html).toContain('データがありません');
  });
});
