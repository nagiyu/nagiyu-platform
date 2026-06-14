/** @jest-environment jsdom */
/**
 * SummaryDetailDialog - 予測リターン・確信度表示 Unit Tests
 *
 * 新フィールド（predictedReturn / confidence）の表示・非表示を検証する。
 */
import React from 'react';
import { render, screen } from '@testing-library/react';

// 依存コンポーネントのモック
jest.mock('../../../components/StockChart', () => ({
  __esModule: true,
  default: () => React.createElement('div', null, 'StockChartMock'),
}));

jest.mock('../../../components/AlertSettingsModal', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../../components/AiAnalysisMarkdown', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => React.createElement('span', null, content),
}));

jest.mock('@mui/material', () => {
  const createEl = (tag: string) => {
    const Comp = ({ children, ...props }: Record<string, unknown>) => {
      const { sx, ...rest } = props as { sx?: unknown } & Record<string, unknown>;
      void sx;
      return React.createElement(tag, rest, children as React.ReactNode);
    };
    Comp.displayName = `Mock_${tag}`;
    return Comp;
  };

  return {
    Box: createEl('div'),
    Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
      open ? React.createElement('div', { role: 'dialog' }, children) : null,
    DialogContent: createEl('div'),
    DialogTitle: createEl('div'),
    Divider: () => React.createElement('hr'),
    IconButton: createEl('button'),
    Menu: () => null,
    MenuItem: createEl('li'),
    Table: createEl('table'),
    TableBody: createEl('tbody'),
    TableCell: createEl('td'),
    TableContainer: createEl('div'),
    TableRow: createEl('tr'),
    Tooltip: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    Typography: createEl('span'),
  };
});

jest.mock('@nagiyu/ui', () => ({
  Button: ({ children, ...props }: Record<string, unknown>) =>
    React.createElement('button', props, children as React.ReactNode),
  Chip: ({ children, ...props }: Record<string, unknown>) =>
    React.createElement('span', props, children as React.ReactNode),
}));

jest.mock('@mui/icons-material', () => ({
  Close: () => React.createElement('span', null, 'X'),
}));

import SummaryDetailDialog from '../../../components/SummaryDetailDialog';
import type { TickerSummary } from '../../../types/stock';

/** ベースとなる TickerSummary を生成するヘルパー */
const buildSummary = (overrides: Partial<TickerSummary> = {}): TickerSummary => ({
  tickerId: 'NSDQ:AAPL',
  symbol: 'AAPL',
  name: 'Apple Inc.',
  open: 100,
  high: 110,
  low: 95,
  close: 105,
  volume: 1000000,
  updatedAt: '2026-03-04T00:00:00.000Z',
  buyPatternCount: 0,
  sellPatternCount: 0,
  buyAlertCount: { enabled: 0, disabled: 0 },
  sellAlertCount: { enabled: 0, disabled: 0 },
  patternDetails: [],
  holding: null,
  ...overrides,
});

describe('SummaryDetailDialog - 予測リターン・確信度の表示', () => {
  it('predictedReturn と confidence がある場合に表示される', () => {
    const summary = buildSummary({
      aiAnalysisResult: {
        priceMovementAnalysis: '値動き分析',
        patternAnalysis: 'パターン分析',
        supportLevels: [100, 99, 98],
        resistanceLevels: [110, 111, 112],
        relatedMarketTrend: '市場動向',
        investmentJudgment: {
          signal: 'BULLISH',
          predictedReturn: 1.23,
          confidence: 0.72,
          reason: '上昇シグナル',
        },
      },
    });

    render(
      React.createElement(SummaryDetailDialog, {
        open: true,
        summary,
        onClose: jest.fn(),
      })
    );

    // 予測リターンが表示されること
    expect(screen.getByTestId('predicted-return').textContent).toBe('+1.23%');
    // 確信度が表示されること
    expect(screen.getByTestId('confidence').textContent).toBe('72%');
    // ラベルが表示されること
    expect(screen.getByText('予測リターン:')).toBeTruthy();
    expect(screen.getByText('確信度:')).toBeTruthy();
  });

  it('predictedReturn がない旧レコードでは予測リターン行が表示されない', () => {
    const summary = buildSummary({
      aiAnalysisResult: {
        priceMovementAnalysis: '値動き分析',
        patternAnalysis: 'パターン分析',
        supportLevels: [100, 99, 98],
        resistanceLevels: [110, 111, 112],
        relatedMarketTrend: '市場動向',
        investmentJudgment: {
          signal: 'NEUTRAL',
          reason: '様子見',
          // predictedReturn と confidence を持たない旧レコード
        },
      },
    });

    render(
      React.createElement(SummaryDetailDialog, {
        open: true,
        summary,
        onClose: jest.fn(),
      })
    );

    // 旧レコードでは表示されないこと
    expect(screen.queryByTestId('predicted-return')).toBeNull();
    expect(screen.queryByTestId('confidence')).toBeNull();
    expect(screen.queryByText('予測リターン:')).toBeNull();
    expect(screen.queryByText('確信度:')).toBeNull();
  });

  it('aiAnalysisResult がない場合は投資判断セクション全体が非表示', () => {
    const summary = buildSummary({ aiAnalysisResult: undefined });

    render(
      React.createElement(SummaryDetailDialog, {
        open: true,
        summary,
        onClose: jest.fn(),
      })
    );

    expect(screen.queryByTestId('predicted-return')).toBeNull();
    expect(screen.queryByTestId('confidence')).toBeNull();
  });

  it('predictedReturn のみあって confidence がない場合は predictedReturn のみ表示', () => {
    const summary = buildSummary({
      aiAnalysisResult: {
        priceMovementAnalysis: '値動き分析',
        patternAnalysis: 'パターン分析',
        supportLevels: [100, 99, 98],
        resistanceLevels: [110, 111, 112],
        relatedMarketTrend: '市場動向',
        investmentJudgment: {
          signal: 'BULLISH',
          predictedReturn: 0.5,
          reason: '上昇シグナル',
          // confidence なし
        },
      },
    });

    render(
      React.createElement(SummaryDetailDialog, {
        open: true,
        summary,
        onClose: jest.fn(),
      })
    );

    expect(screen.getByTestId('predicted-return').textContent).toBe('+0.50%');
    expect(screen.queryByTestId('confidence')).toBeNull();
  });

  it('confidence のみあって predictedReturn がない場合は confidence のみ表示', () => {
    const summary = buildSummary({
      aiAnalysisResult: {
        priceMovementAnalysis: '値動き分析',
        patternAnalysis: 'パターン分析',
        supportLevels: [100, 99, 98],
        resistanceLevels: [110, 111, 112],
        relatedMarketTrend: '市場動向',
        investmentJudgment: {
          signal: 'BEARISH',
          confidence: 0.9,
          reason: '下落シグナル',
          // predictedReturn なし
        },
      },
    });

    render(
      React.createElement(SummaryDetailDialog, {
        open: true,
        summary,
        onClose: jest.fn(),
      })
    );

    expect(screen.queryByTestId('predicted-return')).toBeNull();
    expect(screen.getByTestId('confidence').textContent).toBe('90%');
  });
});
