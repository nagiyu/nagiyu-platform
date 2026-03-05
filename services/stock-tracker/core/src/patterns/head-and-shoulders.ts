import type { ChartDataPoint, PatternDefinition, PatternStatus } from '../types.js';
import { CandlestickPattern } from './candlestick-pattern.js';

export class HeadAndShoulders extends CandlestickPattern {
  private static readonly MIN_CANDLES = 7;
  private static readonly SHOULDER_TOLERANCE = 0.05;

  public readonly definition: PatternDefinition = {
    patternId: 'head-and-shoulders',
    name: '三尊',
    description:
      '売りシグナル。3つの高値（中央が最高値）を形成し、ネックラインを下抜ける反転パターン。',
    signalType: 'SELL',
  };

  public analyze(candles: ChartDataPoint[]): PatternStatus {
    if (candles.length < HeadAndShoulders.MIN_CANDLES) {
      return 'INSUFFICIENT_DATA';
    }

    const recent = [...candles.slice(0, HeadAndShoulders.MIN_CANDLES)].reverse();
    const leftShoulder = recent[1].high;
    const head = recent[3].high;
    const rightShoulder = recent[5].high;
    const hasHeadShape = head > leftShoulder && head > rightShoulder;
    const shouldersAreSymmetric =
      Math.abs(leftShoulder - rightShoulder) / Math.max(Math.max(leftShoulder, rightShoulder), 1) <=
      HeadAndShoulders.SHOULDER_TOLERANCE;
    const neckline = Math.min(recent[2].low, recent[4].low);
    const isBreakdown = recent[6].close < neckline;

    return hasHeadShape && shouldersAreSymmetric && isBreakdown ? 'MATCHED' : 'NOT_MATCHED';
  }
}
