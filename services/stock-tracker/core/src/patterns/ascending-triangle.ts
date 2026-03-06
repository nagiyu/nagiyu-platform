import type { ChartDataPoint, PatternDefinition, PatternStatus } from '../types.js';
import { CandlestickPattern } from './candlestick-pattern.js';

export class AscendingTriangle extends CandlestickPattern {
  private static readonly MIN_CANDLES = 6;
  private static readonly RESISTANCE_TOLERANCE = 0.03;

  public readonly definition: PatternDefinition = {
    patternId: 'ascending-triangle',
    name: 'アセンディング・トライアングル',
    description:
      '買いシグナル。高値抵抗線がほぼ水平で、安値が切り上がる三角保ち合いの上放れを示す。',
    signalType: 'BUY',
  };

  public analyze(candles: ChartDataPoint[]): PatternStatus {
    if (candles.length < AscendingTriangle.MIN_CANDLES) {
      return 'INSUFFICIENT_DATA';
    }

    const recent = [...candles.slice(0, AscendingTriangle.MIN_CANDLES)].reverse();
    const resistanceHighs = [recent[1].high, recent[3].high, recent[5].high];
    const resistance = Math.max(...resistanceHighs);
    const minResistance = Math.min(...resistanceHighs);
    const isHorizontalResistance =
      (resistance - minResistance) / Math.max(resistance, 1) <=
      AscendingTriangle.RESISTANCE_TOLERANCE;

    const lows = [recent[0].low, recent[2].low, recent[4].low];
    const isRisingLows = lows[0] < lows[1] && lows[1] < lows[2];
    const isBreakout = recent[5].close > resistance;

    return isHorizontalResistance && isRisingLows && isBreakout ? 'MATCHED' : 'NOT_MATCHED';
  }
}
