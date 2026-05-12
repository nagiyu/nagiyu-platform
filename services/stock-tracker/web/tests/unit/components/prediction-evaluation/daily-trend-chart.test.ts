/** @jest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import DailyTrendChart, {
  buildDailyTrendOption,
} from '../../../../components/prediction-evaluation/DailyTrendChart';
import type { DailyTrendPoint } from '../../../../lib/prediction-evaluation/types';

jest.mock('echarts-for-react', () => ({
  __esModule: true,
  default: () => React.createElement('div', { 'data-testid': 'mock-echarts' }),
}));

const POINTS: DailyTrendPoint[] = [
  { date: '2026-05-01', directionalAccuracy: 70, judgedCount: 10 },
  { date: '2026-05-02', directionalAccuracy: null, judgedCount: 0 },
  { date: '2026-05-03', directionalAccuracy: 55.5, judgedCount: 9 },
];

describe('buildDailyTrendOption', () => {
  it('x 軸に日付、series に方向精度と件数を含む', () => {
    const option = buildDailyTrendOption(POINTS) as Record<string, unknown>;
    expect(option.xAxis).toMatchObject({ data: ['2026-05-01', '2026-05-02', '2026-05-03'] });

    const series = option.series as Array<{ name: string; data: unknown[] }>;
    expect(series).toHaveLength(2);
    expect(series[0].name).toBe('方向精度 (%)');
    expect(series[0].data).toEqual([70, '-', 55.5]);
    expect(series[1].name).toBe('判定済み件数');
    expect(series[1].data).toEqual([10, 0, 9]);
  });
});

describe('DailyTrendChart rendering', () => {
  it('データありの場合はチャートとテーブルを表示する', () => {
    render(React.createElement(DailyTrendChart, { data: POINTS }));

    expect(screen.getByText('日次の方向精度推移')).toBeTruthy();
    expect(screen.getByRole('img', { name: '日次方向精度推移チャート' })).toBeTruthy();

    // テーブル行（ヘッダ + 3 データ行）
    expect(screen.getByText('2026-05-01')).toBeTruthy();
    expect(screen.getByText('70.0%')).toBeTruthy();
    expect(screen.getByText('55.5%')).toBeTruthy();
    // 部分欠損は — として表示
    const naCells = screen.getAllByText('—');
    expect(naCells.length).toBeGreaterThanOrEqual(1);
  });

  it('データ 0 件の場合は空状態テキストを表示する', () => {
    render(React.createElement(DailyTrendChart, { data: [] }));
    expect(screen.getByText('表示できるデータがありません')).toBeTruthy();
  });
});
