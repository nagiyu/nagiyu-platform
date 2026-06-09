/** @jest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import SignalAccuracyChart, {
  buildSignalChartOption,
  formatEdge,
} from '../../../../components/prediction-evaluation/SignalAccuracyChart';
import type { SignalAccuracyEntry } from '../../../../lib/prediction-evaluation/types';

jest.mock('echarts-for-react', () => ({
  __esModule: true,
  default: () => React.createElement('div', { 'data-testid': 'mock-echarts' }),
}));

const ENTRIES: SignalAccuracyEntry[] = [
  { signal: 'BULLISH', accuracy: 70, count: 20, baseline: 38.1, edge: 31.9 },
  { signal: 'NEUTRAL', accuracy: null, count: 0, baseline: null, edge: null },
  { signal: 'BEARISH', accuracy: 55, count: 18, baseline: 42.6, edge: 12.4 },
];

describe('formatEdge', () => {
  it('正のエッジは + 符号付きで表示する', () => {
    expect(formatEdge(7.1)).toBe('+7.1pt');
  });

  it('負のエッジは − 符号付きで表示する', () => {
    expect(formatEdge(-0.4)).toBe('-0.4pt');
  });

  it('0 のエッジは +0.0pt で表示する', () => {
    expect(formatEdge(0)).toBe('+0.0pt');
  });

  it('null は "—" を返す', () => {
    expect(formatEdge(null)).toBe('—');
  });
});

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

  it('ベースライン系列が 2 番目の series として含まれる', () => {
    const option = buildSignalChartOption(ENTRIES) as {
      series: Array<{ name: string; data: Array<{ value: number }> }>;
    };
    expect(option.series).toHaveLength(2);
    expect(option.series[1].name).toBe('ベースライン (%)');
    expect(option.series[1].data[0].value).toBe(38.1);
    expect(option.series[1].data[1].value).toBe(0); // null → 0
    expect(option.series[1].data[2].value).toBe(42.6);
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
      { signal: 'BULLISH', accuracy: null, count: 0, baseline: null, edge: null },
      { signal: 'NEUTRAL', accuracy: null, count: 0, baseline: null, edge: null },
      { signal: 'BEARISH', accuracy: null, count: 0, baseline: null, edge: null },
    ];
    render(React.createElement(SignalAccuracyChart, { data: emptyEntries }));
    expect(screen.getByText('表示できるデータがありません')).toBeTruthy();
  });

  it('テーブルにベースライン列が表示される', () => {
    render(React.createElement(SignalAccuracyChart, { data: ENTRIES }));
    expect(screen.getByText('ベースライン')).toBeTruthy();
    expect(screen.getByText('38.1%')).toBeTruthy();
    expect(screen.getByText('42.6%')).toBeTruthy();
  });

  it('テーブルにエッジ列が表示される', () => {
    render(React.createElement(SignalAccuracyChart, { data: ENTRIES }));
    expect(screen.getByText('エッジ')).toBeTruthy();
    expect(screen.getByText('+31.9pt')).toBeTruthy();
    expect(screen.getByText('+12.4pt')).toBeTruthy();
  });

  it('baseline と edge が null のエントリは "—" を表示する', () => {
    render(React.createElement(SignalAccuracyChart, { data: ENTRIES }));
    // NEUTRAL の baseline と edge が null → "—" が表示される
    // "—" は複数あるので getAllByText を使う
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('負のエッジが符号付きで表示される', () => {
    const negativeEdgeEntries: SignalAccuracyEntry[] = [
      { signal: 'BULLISH', accuracy: 40, count: 10, baseline: 45.0, edge: -5.0 },
      { signal: 'NEUTRAL', accuracy: null, count: 0, baseline: null, edge: null },
      { signal: 'BEARISH', accuracy: 55, count: 18, baseline: 42.6, edge: 12.4 },
    ];
    render(React.createElement(SignalAccuracyChart, { data: negativeEdgeEntries }));
    expect(screen.getByText('-5.0pt')).toBeTruthy();
  });
});
