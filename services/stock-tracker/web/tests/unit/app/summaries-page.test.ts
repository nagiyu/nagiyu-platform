import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SummariesPage from '../../../app/summaries/page';
import { useSession } from 'next-auth/react';

jest.mock('next-auth/react', () => ({
  useSession: jest.fn(),
}));

describe('SummariesPage', () => {
  let html: string;
  const mockedUseSession = useSession as jest.MockedFunction<typeof useSession>;

  beforeAll(() => {
    mockedUseSession.mockReturnValue({
      data: null,
      status: 'unauthenticated',
      update: jest.fn(),
    });
    html = renderToStaticMarkup(React.createElement(SummariesPage));
  });

  it('見出しを表示する', () => {
    expect(html).toContain('日次サマリー');
  });

  it('ローディング状態を表示する', () => {
    expect(html).toContain('読み込み中...');
  });

  it('取引所セレクトボックスを表示する', () => {
    expect(html).toContain('取引所');
  });
});
