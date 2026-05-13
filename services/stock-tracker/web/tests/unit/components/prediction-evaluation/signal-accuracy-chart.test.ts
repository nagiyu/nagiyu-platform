/** @jest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import SignalAccuracyChart, {
  buildSignalChartOption,
} from '../../../../components/prediction-evaluation/SignalAccuracyChart';
import type { SignalAccuracyEntry } from '../../../../lib/prediction-evaluation/types';

jest.mock('echarts-for-react', () => ({
  __esModule: true,
  default: () => React.createElement('div', { 'data-testid': 'mock-echarts' }),
}));

const ENTRIES: SignalAccuracyEntry[] = [
  { signal: 'BULLISH', accuracy: 70, count: 20 },
  { signal: 'NEUTRAL', accuracy: null, count: 0 },
  { signal: 'BEARISH', accuracy: 55, count: 18 },
];

describe('buildSignalChartOption', () => {
  it('x 軸にシグナルのラベルを並べる', () => {
    const option = buildSignalChartOption(ENTRIES) as Record<string, unknown>;
    expect(option.xAxis).toMatchObject({
      data: ['強気（BULLISH）', '中立（NEUTRAL）', '弱気（BEARISH）'],
    });
  });

  it('null accuracy は値 0 として series に渡す', () => {
    const option = buildSignalChartOption(ENTRIES) as {
      series: Array<{ data: Array<{ value: number }> }>;
    };
    const values = option.series[0].data.map((d) => d.value);
    expect(values).toEqual([70, 0, 55]);
  });

  it('ラベルフォーマッタは精度ありを %、null を「—」、範囲外を空文字に整形する', () => {
    const option = buildSignalChartOption(ENTRIES) as {
      series: Array<{ label: { formatter: (params: { dataIndex: number }) => string } }>;
    };
    const formatter = option.series[0].label.formatter;
    expect(formatter({ dataIndex: 0 })).toBe('70.0%');
    expect(formatter({ dataIndex: 1 })).toBe('—');
    expect(formatter({ dataIndex: 999 })).toBe('');
  });
});

describe('SignalAccuracyChart rendering', () => {
  it('データありの場合はチャートとテーブルを表示する', () => {
    render(React.createElement(SignalAccuracyChart, { data: ENTRIES }));
    expect(screen.getByText('シグナル別の精度')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'シグナル別精度のグラフ' })).toBeTruthy();
    expect(screen.getByText('70.0%')).toBeTruthy();
    expect(screen.getByText('55.0%')).toBeTruthy();
  });

  it('全件 count=0 のときは空状態を表示する', () => {
    const emptyEntries: SignalAccuracyEntry[] = [
      { signal: 'BULLISH', accuracy: null, count: 0 },
      { signal: 'NEUTRAL', accuracy: null, count: 0 },
      { signal: 'BEARISH', accuracy: null, count: 0 },
    ];
    render(React.createElement(SignalAccuracyChart, { data: emptyEntries }));
    expect(screen.getByText('表示できるデータがありません')).toBeTruthy();
  });
});
