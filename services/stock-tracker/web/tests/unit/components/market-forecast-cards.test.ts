/** @jest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import MarketForecastCards from '../../../components/MarketForecastCards';
import type { MarketForecastResponse } from '../../../types/forecast';

const forecast = (baseline: number, lowSample: boolean) => ({
  probability: 0.3,
  baseline,
  lean: 'NEUTRAL' as const,
  lowSample,
});

const renderCards = (items: MarketForecastResponse[]) =>
  render(React.createElement(MarketForecastCards, { marketForecasts: items }));

describe('MarketForecastCards', () => {
  it('ふだんの割合が市場で違うときは各行に出し、共通行を出さない', () => {
    renderCards([
      { market: 'JP', date: '2025-09-29', forecast: forecast(0.36, false) },
      { market: 'US', date: '2025-09-29', forecast: forecast(0.4, false) },
    ]);

    expect(screen.getByTestId('market-forecast-probability-JP').textContent).toBe(
      '荒れる確率 30% (ふだん 36%)'
    );
    expect(screen.getByTestId('market-forecast-probability-US').textContent).toBe(
      '荒れる確率 30% (ふだん 40%)'
    );
    expect(screen.queryByTestId('market-forecast-usual')).toBeNull();
  });

  it('参考値が片方だけなら該当する行に付け、共通の注記は出さない', () => {
    renderCards([
      { market: 'JP', date: '2025-09-29', forecast: forecast(0.36, true) },
      { market: 'US', date: '2025-09-29', forecast: forecast(0.36, false) },
    ]);

    expect(screen.getByTestId('market-forecast-probability-JP').textContent).toBe(
      '荒れる確率 30% (参考値)'
    );
    expect(screen.getByTestId('market-forecast-probability-US').textContent).toBe('荒れる確率 30%');
    expect(screen.queryByTestId('market-forecast-low-sample')).toBeNull();
    expect(screen.getByTestId('market-forecast-usual').textContent).toBe('ふだんの荒れる割合 36%');
  });

  it('確度がどちらの市場にもなければ「—」だけを出す', () => {
    renderCards([]);

    expect(screen.getByTestId('market-forecast-label-JP').textContent).toBe('—');
    expect(screen.getByTestId('market-forecast-label-US').textContent).toBe('—');
    expect(screen.queryByTestId('market-forecast-usual')).toBeNull();
  });
});
