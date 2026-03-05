import type { ChartDataPoint, PatternDefinition, PatternStatus } from '../types.js';
import { CandlestickPattern } from './candlestick-pattern.js';

export class BearFlag extends CandlestickPattern {
  private static readonly MIN_CANDLES = 6;

  public readonly definition: PatternDefinition = {
    patternId: 'bear-flag',
    name: 'ベアフラッグ',
    description: '売りシグナル。下落後の短期的な戻り（フラッグ）から下抜ける継続パターン。',
    signalType: 'SELL',
  };

  public analyze(candles: ChartDataPoint[]): PatternStatus {
    if (candles.length < BearFlag.MIN_CANDLES) {
      return 'INSUFFICIENT_DATA';
    }

    const recent = [...candles.slice(0, BearFlag.MIN_CANDLES)].reverse();
    const hasBearPole =
      recent[0].close > recent[1].close &&
      recent[1].close > recent[2].close &&
      recent[2].close < recent[0].close * 0.97;

    const flagHigh = Math.max(recent[3].high, recent[4].high);
    const flagLow = Math.min(recent[3].low, recent[4].low);
    const isFlagRangeNarrow = (flagHigh - flagLow) / Math.max(recent[0].close, 1) <= 0.05;
    const isFlagRebound = recent[3].close >= recent[2].close && recent[4].close >= recent[3].close;
    const isBreakdown = recent[5].close < flagLow;

    return hasBearPole && isFlagRangeNarrow && isFlagRebound && isBreakdown
      ? 'MATCHED'
      : 'NOT_MATCHED';
  }
}
