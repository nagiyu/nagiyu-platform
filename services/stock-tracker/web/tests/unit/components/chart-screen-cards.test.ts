/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TickerSummaryCard from '../../../components/TickerSummaryCard';
import HoldingCard from '../../../components/HoldingCard';
import TickerAlertListCard from '../../../components/TickerAlertListCard';
import type { TickerSummary } from '../../../types/stock';
import type { AlertResponse } from '../../../types/alert';

jest.mock('../../../components/StockChart', () => ({
  __esModule: true,
  default: () => React.createElement('div', null, 'StockChartMock'),
}));

jest.mock('../../../components/AlertSettingsModal', () => ({
  __esModule: true,
  default: () => null,
}));

describe('チャート画面カードコンポーネント', () => {
  it('TickerSummaryCard: サマリー情報を表示する', () => {
    const summary: TickerSummary = {
      tickerId: 'NASDAQ:NVDA',
      symbol: 'NVDA',
      name: 'NVIDIA',
      open: 100,
      high: 120,
      low: 90,
      close: 110,
      volume: 1000,
      updatedAt: '2026-01-01T00:00:00.000Z',
      buyPatternCount: 2,
      sellPatternCount: 1,
      buyAlertCount: { enabled: 1, disabled: 0 },
      sellAlertCount: { enabled: 0, disabled: 0 },
      patternDetails: [],
      holding: null,
    };

    render(
      React.createElement(TickerSummaryCard, {
        summary,
        loading: false,
        error: '',
        onChanged: jest.fn(async () => undefined),
      })
    );

    expect(screen.getByText('サマリー')).toBeTruthy();
    // 投資判断: ラベルと「未生成」テキストは別ノードになっている
    expect(screen.getByText('投資判断:')).toBeTruthy();
    expect(screen.getByText('未生成')).toBeTruthy();
    expect(screen.getByText('買いシグナル: 2')).toBeTruthy();
    expect(screen.getByText('売りシグナル: 1')).toBeTruthy();
    expect(screen.getByRole('button', { name: '詳細' })).toBeTruthy();
  });

  it('TickerSummaryCard: サポート/レジスタンスを表示し、詳細ダイアログを開ける', () => {
    const summary: TickerSummary = {
      tickerId: 'NASDAQ:NVDA',
      symbol: 'NVDA',
      name: 'NVIDIA',
      open: 100,
      high: 120,
      low: 90,
      close: 110,
      volume: 1000,
      updatedAt: '2026-01-01T00:00:00.000Z',
      buyPatternCount: 2,
      sellPatternCount: 1,
      buyAlertCount: { enabled: 1, disabled: 0 },
      sellAlertCount: { enabled: 0, disabled: 0 },
      patternDetails: [],
      holding: null,
      aiAnalysisResult: {
        priceMovementAnalysis: '値動き分析',
        patternAnalysis: 'パターン分析',
        supportLevels: [100, 95, 90],
        resistanceLevels: [120, 125, 130],
        relatedMarketTrend: '市場動向',
        investmentJudgment: { signal: 'BULLISH', reason: '上昇トレンド' },
      },
    };

    render(
      React.createElement(TickerSummaryCard, {
        summary,
        loading: false,
        error: '',
        onChanged: jest.fn(async () => undefined),
      })
    );

    expect(screen.getByText('サポートレベル')).toBeTruthy();
    expect(screen.getByText('レジスタンスレベル')).toBeTruthy();
    expect(screen.getByText('100')).toBeTruthy();
    expect(screen.getByText('95')).toBeTruthy();
    expect(screen.getByText('90')).toBeTruthy();
    expect(screen.getByText('120')).toBeTruthy();
    expect(screen.getByText('125')).toBeTruthy();
    expect(screen.getByText('130')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '詳細' }));
    expect(screen.getByText('AI 解析')).toBeTruthy();
    expect(screen.getByText('StockChartMock')).toBeTruthy();
  });

  it('TickerSummaryCard: 投資判断 BULLISH を Chip で表示する', () => {
    const summary: TickerSummary = {
      tickerId: 'NASDAQ:NVDA',
      symbol: 'NVDA',
      name: 'NVIDIA',
      open: 100,
      high: 120,
      low: 90,
      close: 110,
      volume: 1000,
      updatedAt: '2026-01-01T00:00:00.000Z',
      buyPatternCount: 2,
      sellPatternCount: 1,
      buyAlertCount: { enabled: 1, disabled: 0 },
      sellAlertCount: { enabled: 0, disabled: 0 },
      patternDetails: [],
      holding: null,
      aiAnalysisResult: {
        priceMovementAnalysis: '値動き分析',
        patternAnalysis: 'パターン分析',
        supportLevels: [],
        resistanceLevels: [],
        relatedMarketTrend: '市場動向',
        investmentJudgment: { signal: 'BULLISH', reason: '上昇トレンド' },
      },
    };

    render(
      React.createElement(TickerSummaryCard, {
        summary,
        loading: false,
        error: '',
        onChanged: jest.fn(async () => undefined),
      })
    );

    // BULLISH: 強気ラベルが Chip として表示される
    const chip = screen.getByTestId('summary-investment-signal');
    expect(chip.textContent).toBe('強気');
    // 「未生成」は表示されない
    expect(screen.queryByTestId('summary-investment-signal-unset')).toBeNull();
  });

  it('TickerSummaryCard: 投資判断 NEUTRAL を Chip で表示する', () => {
    const summary: TickerSummary = {
      tickerId: 'NASDAQ:NVDA',
      symbol: 'NVDA',
      name: 'NVIDIA',
      open: 100,
      high: 120,
      low: 90,
      close: 110,
      volume: 1000,
      updatedAt: '2026-01-01T00:00:00.000Z',
      buyPatternCount: 0,
      sellPatternCount: 0,
      buyAlertCount: { enabled: 0, disabled: 0 },
      sellAlertCount: { enabled: 0, disabled: 0 },
      patternDetails: [],
      holding: null,
      aiAnalysisResult: {
        priceMovementAnalysis: '値動き分析',
        patternAnalysis: 'パターン分析',
        supportLevels: [],
        resistanceLevels: [],
        relatedMarketTrend: '市場動向',
        investmentJudgment: { signal: 'NEUTRAL', reason: '様子見' },
      },
    };

    render(
      React.createElement(TickerSummaryCard, {
        summary,
        loading: false,
        error: '',
        onChanged: jest.fn(async () => undefined),
      })
    );

    const chip = screen.getByTestId('summary-investment-signal');
    expect(chip.textContent).toBe('中立');
    expect(screen.queryByTestId('summary-investment-signal-unset')).toBeNull();
  });

  it('TickerSummaryCard: 投資判断 BEARISH を Chip で表示する', () => {
    const summary: TickerSummary = {
      tickerId: 'NASDAQ:NVDA',
      symbol: 'NVDA',
      name: 'NVIDIA',
      open: 100,
      high: 120,
      low: 90,
      close: 110,
      volume: 1000,
      updatedAt: '2026-01-01T00:00:00.000Z',
      buyPatternCount: 0,
      sellPatternCount: 0,
      buyAlertCount: { enabled: 0, disabled: 0 },
      sellAlertCount: { enabled: 0, disabled: 0 },
      patternDetails: [],
      holding: null,
      aiAnalysisResult: {
        priceMovementAnalysis: '値動き分析',
        patternAnalysis: 'パターン分析',
        supportLevels: [],
        resistanceLevels: [],
        relatedMarketTrend: '市場動向',
        investmentJudgment: { signal: 'BEARISH', reason: '下落トレンド' },
      },
    };

    render(
      React.createElement(TickerSummaryCard, {
        summary,
        loading: false,
        error: '',
        onChanged: jest.fn(async () => undefined),
      })
    );

    const chip = screen.getByTestId('summary-investment-signal');
    expect(chip.textContent).toBe('弱気');
    expect(screen.queryByTestId('summary-investment-signal-unset')).toBeNull();
  });

  it('TickerSummaryCard: aiAnalysisResult なしの場合は「未生成」テキストを表示する', () => {
    const summary: TickerSummary = {
      tickerId: 'NASDAQ:NVDA',
      symbol: 'NVDA',
      name: 'NVIDIA',
      open: 100,
      high: 120,
      low: 90,
      close: 110,
      volume: 1000,
      updatedAt: '2026-01-01T00:00:00.000Z',
      buyPatternCount: 0,
      sellPatternCount: 0,
      buyAlertCount: { enabled: 0, disabled: 0 },
      sellAlertCount: { enabled: 0, disabled: 0 },
      patternDetails: [],
      holding: null,
      // aiAnalysisResult は未設定
    };

    render(
      React.createElement(TickerSummaryCard, {
        summary,
        loading: false,
        error: '',
        onChanged: jest.fn(async () => undefined),
      })
    );

    // Chip は表示されず「未生成」テキストが出る
    expect(screen.queryByTestId('summary-investment-signal')).toBeNull();
    expect(screen.getByTestId('summary-investment-signal-unset').textContent).toBe('未生成');
  });

  it('TickerSummaryCard: predictedReturn がある場合に表示する', () => {
    const summary: TickerSummary = {
      tickerId: 'NASDAQ:NVDA',
      symbol: 'NVDA',
      name: 'NVIDIA',
      open: 100,
      high: 120,
      low: 90,
      close: 110,
      volume: 1000,
      updatedAt: '2026-01-01T00:00:00.000Z',
      buyPatternCount: 0,
      sellPatternCount: 0,
      buyAlertCount: { enabled: 0, disabled: 0 },
      sellAlertCount: { enabled: 0, disabled: 0 },
      patternDetails: [],
      holding: null,
      aiAnalysisResult: {
        priceMovementAnalysis: '値動き分析',
        patternAnalysis: 'パターン分析',
        supportLevels: [],
        resistanceLevels: [],
        relatedMarketTrend: '市場動向',
        investmentJudgment: { signal: 'BULLISH', predictedReturn: 1.23, reason: '上昇' },
      },
    };

    render(
      React.createElement(TickerSummaryCard, {
        summary,
        loading: false,
        error: '',
        onChanged: jest.fn(async () => undefined),
      })
    );

    expect(screen.getByTestId('summary-predicted-return').textContent).toBe('+1.23%');
  });

  it('TickerSummaryCard: predictedReturn がない場合は予測リターン行を表示しない', () => {
    const summary: TickerSummary = {
      tickerId: 'NASDAQ:NVDA',
      symbol: 'NVDA',
      name: 'NVIDIA',
      open: 100,
      high: 120,
      low: 90,
      close: 110,
      volume: 1000,
      updatedAt: '2026-01-01T00:00:00.000Z',
      buyPatternCount: 0,
      sellPatternCount: 0,
      buyAlertCount: { enabled: 0, disabled: 0 },
      sellAlertCount: { enabled: 0, disabled: 0 },
      patternDetails: [],
      holding: null,
      aiAnalysisResult: {
        priceMovementAnalysis: '値動き分析',
        patternAnalysis: 'パターン分析',
        supportLevels: [],
        resistanceLevels: [],
        relatedMarketTrend: '市場動向',
        investmentJudgment: { signal: 'BULLISH', reason: '上昇' },
      },
    };

    render(
      React.createElement(TickerSummaryCard, {
        summary,
        loading: false,
        error: '',
        onChanged: jest.fn(async () => undefined),
      })
    );

    expect(screen.queryByTestId('summary-predicted-return')).toBeNull();
  });

  it('TickerSummaryCard: confidence がある場合に表示する', () => {
    const summary: TickerSummary = {
      tickerId: 'NASDAQ:NVDA',
      symbol: 'NVDA',
      name: 'NVIDIA',
      open: 100,
      high: 120,
      low: 90,
      close: 110,
      volume: 1000,
      updatedAt: '2026-01-01T00:00:00.000Z',
      buyPatternCount: 0,
      sellPatternCount: 0,
      buyAlertCount: { enabled: 0, disabled: 0 },
      sellAlertCount: { enabled: 0, disabled: 0 },
      patternDetails: [],
      holding: null,
      aiAnalysisResult: {
        priceMovementAnalysis: '値動き分析',
        patternAnalysis: 'パターン分析',
        supportLevels: [],
        resistanceLevels: [],
        relatedMarketTrend: '市場動向',
        investmentJudgment: { signal: 'BULLISH', confidence: 0.75, reason: '上昇' },
      },
    };

    render(
      React.createElement(TickerSummaryCard, {
        summary,
        loading: false,
        error: '',
        onChanged: jest.fn(async () => undefined),
      })
    );

    expect(screen.getByTestId('summary-confidence').textContent).toBe('75%');
  });

  it('TickerSummaryCard: confidence がない場合は確信度行を表示しない', () => {
    const summary: TickerSummary = {
      tickerId: 'NASDAQ:NVDA',
      symbol: 'NVDA',
      name: 'NVIDIA',
      open: 100,
      high: 120,
      low: 90,
      close: 110,
      volume: 1000,
      updatedAt: '2026-01-01T00:00:00.000Z',
      buyPatternCount: 0,
      sellPatternCount: 0,
      buyAlertCount: { enabled: 0, disabled: 0 },
      sellAlertCount: { enabled: 0, disabled: 0 },
      patternDetails: [],
      holding: null,
      aiAnalysisResult: {
        priceMovementAnalysis: '値動き分析',
        patternAnalysis: 'パターン分析',
        supportLevels: [],
        resistanceLevels: [],
        relatedMarketTrend: '市場動向',
        investmentJudgment: { signal: 'BULLISH', reason: '上昇' },
      },
    };

    render(
      React.createElement(TickerSummaryCard, {
        summary,
        loading: false,
        error: '',
        onChanged: jest.fn(async () => undefined),
      })
    );

    expect(screen.queryByTestId('summary-confidence')).toBeNull();
  });

  it('HoldingCard: 保有なしを表示する', () => {
    render(
      React.createElement(HoldingCard, {
        holding: null,
        tickerId: 'NASDAQ:NVDA',
        symbol: 'NVDA',
        exchangeId: 'NASDAQ',
        loading: false,
        error: '',
        onChanged: jest.fn(async () => undefined),
      })
    );

    expect(screen.getByText('保有なし')).toBeTruthy();
    expect(screen.getByRole('button', { name: '追加' })).toBeTruthy();
  });

  it('TickerAlertListCard: アラート一覧を表示する', () => {
    const alerts: AlertResponse[] = [
      {
        alertId: 'alert-1',
        tickerId: 'NASDAQ:NVDA',
        symbol: 'NVDA',
        name: 'NVIDIA',
        mode: 'Buy',
        frequency: 'MINUTE_LEVEL',
        conditions: [{ field: 'price', operator: 'gte', value: 120 }],
        enabled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ];

    render(
      React.createElement(TickerAlertListCard, {
        alerts,
        tickerId: 'NASDAQ:NVDA',
        symbol: 'NVDA',
        exchangeId: 'NASDAQ',
        loading: false,
        error: '',
        onChanged: jest.fn(async () => undefined),
      })
    );

    expect(screen.getByText('アラート')).toBeTruthy();
    expect(screen.getByText('以上 120')).toBeTruthy();
    expect(screen.getByText('有効')).toBeTruthy();
    expect(screen.getByRole('button', { name: '買い追加' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '売り追加' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: '編集' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '削除' }).length).toBeGreaterThan(0);
  });
});
