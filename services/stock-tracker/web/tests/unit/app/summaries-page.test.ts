import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SummariesPage, { resolveAiAnalysisText } from '../../../app/summaries/page';
import { useSession } from 'next-auth/react';
import { STOCK_TRACKER_ERROR_MESSAGES } from '../../../lib/error-messages';

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

  describe('resolveAiAnalysisText', () => {
    const baseSummary = {
      tickerId: 'TSE:7203',
      symbol: '7203',
      name: 'トヨタ自動車',
      open: 1000,
      high: 1010,
      low: 990,
      close: 1005,
      updatedAt: '2026-03-01T00:00:00.000Z',
      buyPatternCount: 0,
      sellPatternCount: 0,
      patternDetails: [],
    };

    it('aiAnalysis が string の場合は解析テキストを表示する', () => {
      expect(resolveAiAnalysisText({ ...baseSummary, aiAnalysis: 'AI解析テキスト' })).toBe(
        'AI解析テキスト'
      );
    });

    it('aiAnalysisError が string の場合は失敗メッセージを表示する', () => {
      expect(resolveAiAnalysisText({ ...baseSummary, aiAnalysisError: 'OpenAI timeout' })).toBe(
        STOCK_TRACKER_ERROR_MESSAGES.AI_ANALYSIS_FAILED
      );
    });

    it('aiAnalysis と aiAnalysisError が未定義の場合は未生成メッセージを表示する', () => {
      expect(resolveAiAnalysisText(baseSummary)).toBe(
        STOCK_TRACKER_ERROR_MESSAGES.AI_ANALYSIS_NOT_GENERATED
      );
    });
  });
});
