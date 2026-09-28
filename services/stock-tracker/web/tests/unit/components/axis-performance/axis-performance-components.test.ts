/** @jest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AxisTable from '../../../../components/axis-performance/AxisTable';
import CalibrationSection, {
  buildCalibrationOption,
} from '../../../../components/axis-performance/CalibrationSection';
import type { AxisPerformanceAxis, CalibrationBand } from '../../../../types/forecast';

jest.mock('echarts-for-react', () => ({
  __esModule: true,
  default: () => React.createElement('div', { 'data-testid': 'mock-echarts' }),
}));

const BANDS: CalibrationBand[] = [
  { lower: 0.45, upper: 0.5, count: 100, meanProbability: 0.47, hitRate: 0.48 },
  { lower: 0.5, upper: 0.55, count: 10, meanProbability: 0.52, hitRate: 0.7 },
];

const AXES: AxisPerformanceAxis[] = [
  {
    axisId: 'a',
    name: '軸A',
    kind: 'FLAG',
    count: 1200,
    hitRate: 0.55,
    diffFromBaseline: 0.05,
    meanExcessReturn: 0.003,
    currentWeight: 0.5,
    lowSample: false,
  },
  {
    axisId: 'b',
    name: '軸B',
    kind: 'NUMERIC',
    count: 20,
    hitRate: 0.45,
    diffFromBaseline: -0.05,
    meanExcessReturn: -0.001,
    currentWeight: -0.25,
    lowSample: true,
  },
];

describe('CalibrationSection', () => {
  it('中立帯の文言、確率帯の表、信頼度図を出し、件数が少ない行を薄くする', async () => {
    render(
      React.createElement(CalibrationSection, {
        calibration: BANDS,
        neutralBand: { lower: 0, upper: 0.05 },
      })
    );
    expect(screen.getByTestId('neutral-band-text').textContent).toBe('基準値 +0〜+5pt は中立');
    const rows = screen.getAllByTestId('calibration-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute('data-low-sample')).toBe('false');
    expect(rows[1].getAttribute('data-low-sample')).toBe('true');
    expect(within(rows[0]).getByText('45〜50%')).toBeTruthy();
    expect(within(rows[0]).getByText('48.0%')).toBeTruthy();
    expect(await screen.findByTestId('mock-echarts')).toBeTruthy();
  });

  it('中立帯が null なら文言を出さず、確率帯が無ければその旨を出す', () => {
    render(React.createElement(CalibrationSection, { calibration: [], neutralBand: null }));
    expect(screen.queryByTestId('neutral-band-text')).toBeNull();
    expect(screen.getByText('確率帯ごとの実績はありません')).toBeTruthy();
  });

  it('信頼度図は対角線と確率帯の点を持ち、少ない帯を薄くする', () => {
    const option = buildCalibrationOption(BANDS) as unknown as {
      series: Array<{
        name: string;
        data: Array<{ value: number[]; itemStyle: { opacity: number } }>;
      }>;
      tooltip: { formatter: (p: unknown) => string };
    };
    expect(option.series[0].data).toEqual([
      [0, 0],
      [100, 100],
    ]);
    const points = option.series[1].data;
    expect(points[0].value).toEqual([47, 48]);
    expect(points[0].itemStyle.opacity).toBe(1);
    expect(points[1].itemStyle.opacity).toBe(0.3);
    expect(option.tooltip.formatter({ data: points[0] })).toContain('100 件');
    expect(option.tooltip.formatter({})).toBe('');
  });
});

describe('AxisTable', () => {
  const names = () =>
    screen
      .getAllByTestId('axis-row')
      .map((row) => within(row).getAllByRole('button')[0].textContent);

  it('方向タブでは平均超過リターンを出し、件数不足の目印と重みの符号を出す', () => {
    render(React.createElement(AxisTable, { question: 'DIR', axes: AXES }));
    expect(screen.getByText('平均超過リターン')).toBeTruthy();
    expect(screen.getByText('+0.30%')).toBeTruthy();
    expect(screen.getAllByText('件数不足')).toHaveLength(1);
    const bars = screen.getAllByTestId('weight-bar');
    expect(bars[0].getAttribute('data-sign')).toBe('plus');
    expect(bars[1].getAttribute('data-sign')).toBe('minus');
    expect(screen.getByText('+0.50')).toBeTruthy();
    expect(screen.getByText('−0.25')).toBeTruthy();
    expect(screen.getByText('1,200')).toBeTruthy();
  });

  it('方向以外のタブでは平均超過リターンの列を出さない', () => {
    render(React.createElement(AxisTable, { question: 'VOL', axes: AXES }));
    expect(screen.queryByText('平均超過リターン')).toBeNull();
  });

  it('列見出しのクリックで並べ替える', () => {
    render(React.createElement(AxisTable, { question: 'DIR', axes: AXES }));
    expect(names()).toEqual(['軸A', '軸B']);
    fireEvent.click(screen.getByText('件数'));
    expect(names()).toEqual(['軸A', '軸B']);
    fireEvent.click(screen.getByText('件数'));
    expect(names()).toEqual(['軸B', '軸A']);
    fireEvent.click(screen.getByText('基準差'));
    expect(names()).toEqual(['軸A', '軸B']);
  });

  it('軸名のクリックで説明を出し、もう一度クリックすると閉じる', async () => {
    render(React.createElement(AxisTable, { question: 'DIR', axes: AXES }));
    fireEvent.click(screen.getByText('軸A'));
    expect(screen.getByRole('tooltip').textContent).toContain('「軸A」が点灯した予測の的中率');
    fireEvent.click(screen.getByText('軸B'));
    expect(await screen.findByText(/「軸B」が平常より高かった/)).toBeTruthy();
    fireEvent.click(screen.getByText('軸B'));
    await waitFor(() => expect(screen.queryByText(/「軸B」が平常より高かった/)).toBeNull());
    fireEvent.click(screen.getByText('軸A'));
    fireEvent.click(document.body);
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
  });

  it('重みがすべて 0 でも表示できる', () => {
    render(
      React.createElement(AxisTable, {
        question: 'VOL',
        axes: [{ ...AXES[0], currentWeight: 0 }],
      })
    );
    expect(screen.getByText('+0.00')).toBeTruthy();
  });
});
