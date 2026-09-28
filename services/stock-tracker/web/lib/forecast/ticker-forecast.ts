/**
 * Forecast アイテムから、一覧・詳細に載せる銘柄の確度の要約を作る（サーバー側専用）
 *
 * core の実行時の値（パターン定義）を使うため、client component からは import しない。
 */
import { PATTERN_REGISTRY, PATTERN_AXIS_IDS } from '@nagiyu/stock-tracker-core';
import type { ForecastEntity, ProbabilityRecord } from '@nagiyu/stock-tracker-core';
import type { ProbabilityView, TickerForecastSummary } from '../../types/forecast';

/** 単一パターン軸の ID → 売買区分 */
const PATTERN_SIGNAL_TYPES = new Map(
  PATTERN_REGISTRY.map((pattern) => [pattern.definition.patternId, pattern.definition.signalType])
);

/** 保存済みの確度を一覧用の要約にする */
export function toProbabilityView(record: ProbabilityRecord | undefined): ProbabilityView | null {
  if (!record) {
    return null;
  }
  return { probability: record.probability, baseline: record.baseline, lean: record.lean };
}

/**
 * 点灯した単一パターンの数を買い・売りに分けて数える。
 * 複合軸（合致数2以上）は単一パターンの重複になるため数えない。
 */
export function countLitPatterns(axisValues: ForecastEntity['AxisValues']): {
  total: number;
  buy: number;
  sell: number;
} {
  let buy = 0;
  let sell = 0;
  for (const axisId of PATTERN_AXIS_IDS) {
    const value = axisValues[axisId];
    if (value !== true && value !== 1) {
      continue;
    }
    if (PATTERN_SIGNAL_TYPES.get(axisId) === 'BUY') {
      buy += 1;
    } else {
      sell += 1;
    }
  }
  return { total: buy + sell, buy, sell };
}

/** Forecast アイテムを銘柄の確度の要約にする。アイテムが無ければ null */
export function toTickerForecastSummary(
  forecast: ForecastEntity | null | undefined
): TickerForecastSummary | null {
  if (!forecast) {
    return null;
  }
  return {
    dir: toProbabilityView(forecast.Probabilities.DIR),
    vol: toProbabilityView(forecast.Probabilities.VOL),
    lit: countLitPatterns(forecast.AxisValues),
  };
}

/** Forecast 一覧を銘柄ID で引けるマップにする */
export function indexForecastsByTicker(
  forecasts: readonly ForecastEntity[]
): Map<string, ForecastEntity> {
  return new Map(forecasts.map((forecast) => [forecast.TickerID, forecast]));
}
