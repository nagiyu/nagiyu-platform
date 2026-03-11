import type { ChartDataPoint, PatternDefinition, PatternStatus } from '../types.js';
import { CandlestickPattern } from './candlestick-pattern.js';

export class RisingDoubleBottom extends CandlestickPattern {
  private static readonly MIN_CANDLES = 6;

  public readonly definition: PatternDefinition = {
    patternId: 'rising-double-bottom',
    name: '切り上げダブルボトム',
    description:
      '買いシグナル。2つ目の安値が1つ目より高い切り上げ型のダブルボトムを形成し、上抜けるパターン。',
    signalType: 'BUY',
  };

  public analyze(candles: ChartDataPoint[]): PatternStatus {
    if (candles.length < RisingDoubleBottom.MIN_CANDLES) {
      return 'INSUFFICIENT_DATA';
    }

    const recent = [...candles.slice(0, RisingDoubleBottom.MIN_CANDLES)].reverse();
    const firstBottom = recent[1].low;
    const secondBottom = recent[3].low;
    const hasRisingBottoms = firstBottom < secondBottom;
    const hasBottomShape = firstBottom < recent[0].low && secondBottom < recent[2].low;
    const breakoutLevel = Math.max(recent[2].high, recent[4].high);
    const isBreakout = recent[5].close > breakoutLevel;

    return hasRisingBottoms && hasBottomShape && isBreakout ? 'MATCHED' : 'NOT_MATCHED';
  }
}
