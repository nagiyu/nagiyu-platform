import type { ChartDataPoint, PatternDefinition, PatternStatus } from '../types.js';
import { CandlestickPattern } from './candlestick-pattern.js';

export class BullFlag extends CandlestickPattern {
  private static readonly MIN_CANDLES = 6;

  public readonly definition: PatternDefinition = {
    patternId: 'bull-flag',
    name: 'ブルフラッグ',
    description: '買いシグナル。上昇後の短期的な押し（フラッグ）から上抜ける継続パターン。',
    signalType: 'BUY',
  };

  public analyze(candles: ChartDataPoint[]): PatternStatus {
    if (candles.length < BullFlag.MIN_CANDLES) {
      return 'INSUFFICIENT_DATA';
    }

    const recent = [...candles.slice(0, BullFlag.MIN_CANDLES)].reverse();
    const hasBullPole =
      recent[0].close < recent[1].close &&
      recent[1].close < recent[2].close &&
      recent[2].close > recent[0].close * 1.03;

    const flagHigh = Math.max(recent[3].high, recent[4].high);
    const flagLow = Math.min(recent[3].low, recent[4].low);
    const isFlagRangeNarrow = (flagHigh - flagLow) / Math.max(recent[0].close, 1) <= 0.06;
    const isFlagPullback = recent[3].close <= recent[2].close && recent[4].close <= recent[3].close;
    const isBreakout = recent[5].close > flagHigh;

    return hasBullPole && isFlagRangeNarrow && isFlagPullback && isBreakout
      ? 'MATCHED'
      : 'NOT_MATCHED';
  }
}
