import type { ChartDataPoint, PatternDefinition, PatternStatus } from '../types.js';
import { CandlestickPattern } from './candlestick-pattern.js';

export class DoubleTop extends CandlestickPattern {
  private static readonly MIN_CANDLES = 7;
  private static readonly PEAK_TOLERANCE = 0.03;

  public readonly definition: PatternDefinition = {
    patternId: 'double-top',
    name: 'ダブルトップ',
    description:
      '売りシグナル。近い水準の2つの高値ピークを形成した後、ネックラインを下抜ける反転パターン。',
    signalType: 'SELL',
  };

  public analyze(candles: ChartDataPoint[]): PatternStatus {
    if (candles.length < DoubleTop.MIN_CANDLES) {
      return 'INSUFFICIENT_DATA';
    }

    const recent = [...candles.slice(0, DoubleTop.MIN_CANDLES)].reverse();
    const peak1 = recent[1].high;
    const peak2 = recent[4].high;
    const peaksAreClose =
      Math.abs(peak1 - peak2) / Math.max(Math.max(peak1, peak2), 1) <= DoubleTop.PEAK_TOLERANCE;
    const hasTopShape =
      peak1 > recent[0].high &&
      peak1 > recent[2].high &&
      peak2 > recent[3].high &&
      peak2 > recent[5].high;
    const neckline = Math.min(recent[2].low, recent[3].low);
    const isBreakdown = recent[6].close < neckline;

    return peaksAreClose && hasTopShape && isBreakdown ? 'MATCHED' : 'NOT_MATCHED';
  }
}
