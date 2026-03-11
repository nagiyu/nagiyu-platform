import type { ChartDataPoint, PatternDefinition, PatternStatus } from '../types.js';
import { CandlestickPattern } from './candlestick-pattern.js';

export class InverseHeadAndShoulders extends CandlestickPattern {
  private static readonly MIN_CANDLES = 7;
  private static readonly SHOULDER_TOLERANCE = 0.05;

  public readonly definition: PatternDefinition = {
    patternId: 'inverse-head-and-shoulders',
    name: '逆三尊',
    description:
      '買いシグナル。3つの安値（中央が最安値）を形成し、ネックラインを上抜ける反転パターン。',
    signalType: 'BUY',
  };

  public analyze(candles: ChartDataPoint[]): PatternStatus {
    if (candles.length < InverseHeadAndShoulders.MIN_CANDLES) {
      return 'INSUFFICIENT_DATA';
    }

    const recent = [...candles.slice(0, InverseHeadAndShoulders.MIN_CANDLES)].reverse();
    const leftShoulder = recent[1].low;
    const head = recent[3].low;
    const rightShoulder = recent[5].low;
    const hasHeadShape = head < leftShoulder && head < rightShoulder;
    const shouldersAreSymmetric =
      Math.abs(leftShoulder - rightShoulder) / Math.max(Math.max(leftShoulder, rightShoulder), 1) <=
      InverseHeadAndShoulders.SHOULDER_TOLERANCE;
    const neckline = Math.max(recent[2].high, recent[4].high);
    const isBreakout = recent[6].close > neckline;

    return hasHeadShape && shouldersAreSymmetric && isBreakout ? 'MATCHED' : 'NOT_MATCHED';
  }
}
