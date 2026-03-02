import type { ChartDataPoint, PatternDefinition, PatternStatus } from '../types.js';

/**
 * キャンドルスティックパターン 抽象基底クラス
 */
export abstract class CandlestickPattern {
  public abstract readonly definition: PatternDefinition;

  public abstract analyze(candles: ChartDataPoint[]): PatternStatus;
}
