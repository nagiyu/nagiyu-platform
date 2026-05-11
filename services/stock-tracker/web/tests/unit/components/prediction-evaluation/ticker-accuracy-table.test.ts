/** @jest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import TickerAccuracyTable, {
  formatHitRatio,
} from '../../../../components/prediction-evaluation/TickerAccuracyTable';
import type { TickerAccuracyEntry } from '../../../../lib/prediction-evaluation/types';

const ENTRIES: TickerAccuracyEntry[] = [
  {
    tickerId: 'NASDAQ:NVDA',
    tickerName: 'NVIDIA',
    exchangeId: 'NASDAQ',
    accuracy: 80,
    count: 10,
    bullishHit: 4,
    bullishTotal: 5,
    bearishHit: 4,
    bearishTotal: 5,
  },
  {
    tickerId: 'TSE:7203',
    tickerName: 'トヨタ自動車',
    exchangeId: 'TSE',
    accuracy: 60,
    count: 8,
    bullishHit: 3,
    bullishTotal: 5,
    bearishHit: 2,
    bearishTotal: 3,
  },
];

describe('formatHitRatio', () => {
  it('total=0 のとき — を返す', () => {
    expect(formatHitRatio(0, 0)).toBe('—');
  });

  it('割合と件数を併記する', () => {
    expect(formatHitRatio(3, 5)).toBe('60.0% (3/5)');
  });
});

describe('TickerAccuracyTable', () => {
  it('行を精度の降順で表示する', () => {
    render(React.createElement(TickerAccuracyTable, { data: ENTRIES, minCount: 5 }));
    const rows = screen.getAllByRole('row');
    // ヘッダ + 2 データ行
    expect(rows.length).toBe(3);
    // 1 番目のデータ行が最も精度が高い
    expect(rows[1].textContent).toContain('NASDAQ:NVDA');
  });

  it('minCount をヘッダに表示する', () => {
    render(React.createElement(TickerAccuracyTable, { data: ENTRIES, minCount: 5 }));
    expect(screen.getByText(/判定件数 ≥ 5 の銘柄のみ/)).toBeTruthy();
  });

  it('空配列の場合は空状態テキストを表示する', () => {
    render(React.createElement(TickerAccuracyTable, { data: [], minCount: 5 }));
    expect(screen.getByText('表示できるデータがありません')).toBeTruthy();
  });
});
