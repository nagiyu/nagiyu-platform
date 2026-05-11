/** @jest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import KpiCards, {
  buildKpiItems,
  formatPercent,
  formatCount,
} from '../../../../components/prediction-evaluation/KpiCards';
import type { KpiSummary } from '../../../../lib/prediction-evaluation/types';

const buildKpi = (overrides: Partial<KpiSummary> = {}): KpiSummary => ({
  totalAccuracy: 65.5,
  directionalAccuracy: 60.1,
  neutralRatio: 22.4,
  judgedCount: 142,
  aiFailureCount: 5,
  ...overrides,
});

describe('KpiCards helpers', () => {
  it('formatPercent は数値を 1 桁の % 文字列にする', () => {
    expect(formatPercent(65.5)).toBe('65.5%');
    expect(formatPercent(0)).toBe('0.0%');
  });

  it('formatPercent は null / NaN を — にする', () => {
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(Number.NaN)).toBe('—');
  });

  it('formatCount は ja-JP のロケール表記', () => {
    expect(formatCount(1234)).toBe('1,234');
  });

  it('buildKpiItems は 5 つの KPI を返す', () => {
    const items = buildKpiItems(buildKpi());
    expect(items.map((item) => item.key)).toEqual([
      'total-accuracy',
      'directional-accuracy',
      'neutral-ratio',
      'judged-count',
      'ai-failure-count',
    ]);
  });
});

describe('KpiCards rendering', () => {
  it('5 つのカードと数値を表示する', () => {
    render(React.createElement(KpiCards, { kpi: buildKpi() }));

    expect(screen.getByTestId('kpi-value-total-accuracy').textContent).toBe('65.5%');
    expect(screen.getByTestId('kpi-value-directional-accuracy').textContent).toBe('60.1%');
    expect(screen.getByTestId('kpi-value-neutral-ratio').textContent).toBe('22.4%');
    expect(screen.getByTestId('kpi-value-judged-count').textContent).toBe('142');
    expect(screen.getByTestId('kpi-value-ai-failure-count').textContent).toBe('5');
  });

  it('null 値は — として表示される', () => {
    render(
      React.createElement(KpiCards, {
        kpi: buildKpi({
          totalAccuracy: null,
          directionalAccuracy: null,
          neutralRatio: null,
          judgedCount: 0,
        }),
      })
    );

    expect(screen.getByTestId('kpi-value-total-accuracy').textContent).toBe('—');
    expect(screen.getByTestId('kpi-value-directional-accuracy').textContent).toBe('—');
    expect(screen.getByTestId('kpi-value-neutral-ratio').textContent).toBe('—');
    expect(screen.getByTestId('kpi-value-judged-count').textContent).toBe('0');
  });
});
