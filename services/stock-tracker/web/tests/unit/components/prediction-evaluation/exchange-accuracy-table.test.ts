/** @jest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import ExchangeAccuracyTable from '../../../../components/prediction-evaluation/ExchangeAccuracyTable';
import type { ExchangeAccuracyEntry } from '../../../../lib/prediction-evaluation/types';

const ENTRIES: ExchangeAccuracyEntry[] = [
  { exchangeId: 'NASDAQ', exchangeName: 'NASDAQ', accuracy: 70, count: 21 },
  { exchangeId: 'NYSE', exchangeName: 'NYSE', accuracy: null, count: 9 },
];

describe('ExchangeAccuracyTable', () => {
  it('各取引所の精度と件数を表示する', () => {
    render(React.createElement(ExchangeAccuracyTable, { data: ENTRIES }));
    expect(screen.getByTestId('exchange-row-NASDAQ').textContent).toContain('70.0%');
    expect(screen.getByTestId('exchange-row-NYSE').textContent).toContain('—');
  });

  it('空配列の場合は空状態テキストを表示する', () => {
    render(React.createElement(ExchangeAccuracyTable, { data: [] }));
    expect(screen.getByText('表示できるデータがありません')).toBeTruthy();
  });
});
