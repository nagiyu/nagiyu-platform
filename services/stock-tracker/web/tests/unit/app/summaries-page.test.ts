import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SummariesPage from '../../../app/summaries/page';
import { resolveAiAnalysisText } from '../../../app/summaries/ai-analysis';
import { useSession } from 'next-auth/react';
import { STOCK_TRACKER_ERROR_MESSAGES } from '../../../lib/error-messages';

jest.mock('../../../components/StockChart', () => ({
  __esModule: true,
  default: () => React.createElement('div', null, 'StockChartMock'),
}));

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
      holding: null,
    };

    it('aiAnalysisResult がある場合は統一フォーマットの解析テキストを表示する', () => {
      expect(
        resolveAiAnalysisText({
          ...baseSummary,
          aiAnalysisResult: {
            priceMovementAnalysis: '値動き分析',
            patternAnalysis: 'パターン分析',
            supportLevels: [100, 99, 98],
            resistanceLevels: [110, 111, 112],
            relatedMarketTrend: '市場動向',
            investmentJudgment: { signal: 'BULLISH', reason: '上昇継続' },
          },
        })
      ).toContain('投資判断: 強気');
    });

    it('aiAnalysisError が string の場合は失敗メッセージを表示する', () => {
      expect(resolveAiAnalysisText({ ...baseSummary, aiAnalysisError: 'OpenAI timeout' })).toBe(
        STOCK_TRACKER_ERROR_MESSAGES.AI_ANALYSIS_FAILED
      );
    });

    it('aiAnalysisResult と aiAnalysisError が両方ある場合は aiAnalysisResult を優先表示する', () => {
      expect(
        resolveAiAnalysisText({
          ...baseSummary,
          aiAnalysisResult: {
            priceMovementAnalysis: '優先される値動き分析',
            patternAnalysis: 'パターン分析',
            supportLevels: [100, 99, 98],
            resistanceLevels: [110, 111, 112],
            relatedMarketTrend: '市場動向',
            investmentJudgment: { signal: 'NEUTRAL', reason: '様子見' },
          },
          aiAnalysisError: 'OpenAI timeout',
        })
      ).toContain('優先される値動き分析');
    });

    it('aiAnalysisResult と aiAnalysisError が未定義の場合は未生成メッセージを表示する', () => {
      expect(resolveAiAnalysisText(baseSummary)).toBe(
        STOCK_TRACKER_ERROR_MESSAGES.AI_ANALYSIS_NOT_GENERATED
      );
    });
  });
});
