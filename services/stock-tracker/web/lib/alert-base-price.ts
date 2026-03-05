import type { AlertResponse } from '../types/alert';

interface SummariesResponse {
  exchanges?: Array<{
    summaries?: Array<{
      tickerId?: string;
      close?: number;
    }>;
  }>;
}

/**
 * 条件配列の先頭から順に評価し、逆算可能な最初のパーセンテージ条件を基準価格として返す
 */
export function calculateBasePriceFromConditions(
  conditions: AlertResponse['conditions']
): number | undefined {
  for (const condition of conditions) {
    if (condition.isPercentage === true && typeof condition.percentageValue === 'number') {
      const divisor = 1 + condition.percentageValue / 100;
      // -100% は 0 除算となり逆算できないためスキップする
      if (divisor === 0) {
        continue;
      }

      const basePrice = condition.value / divisor;
      if (Number.isFinite(basePrice) && basePrice > 0) {
        return basePrice;
      }
    }
  }

  return undefined;
}

/**
 * サマリー一覧から指定ティッカーの close を検索して返す
 */
export function findTickerCloseFromSummaries(
  summariesResponse: SummariesResponse,
  tickerId: string
): number | undefined {
  for (const exchange of summariesResponse.exchanges ?? []) {
    for (const summary of exchange.summaries ?? []) {
      if (summary.tickerId === tickerId && typeof summary.close === 'number' && summary.close > 0) {
        return summary.close;
      }
    }
  }

  return undefined;
}
