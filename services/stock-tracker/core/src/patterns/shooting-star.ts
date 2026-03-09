import type { ChartDataPoint, PatternDefinition, PatternStatus } from '../types.js';
import { CandlestickPattern } from './candlestick-pattern.js';

export class ShootingStar extends CandlestickPattern {
  private static readonly SMALL_BODY_THRESHOLD = 0.3;

  public readonly definition: PatternDefinition = {
    patternId: 'shooting-star',
    name: '流れ星',
    description:
      '売りシグナル。上影線が長く実体が下部にある足で、上昇局面での反転リスクを示す。仕掛け花火を統合。',
    signalType: 'SELL',
  };

  public analyze(candles: ChartDataPoint[]): PatternStatus {
    if (candles.length < 1) {
      return 'INSUFFICIENT_DATA';
    }

    const c0 = candles[0];
    const body = Math.abs(c0.close - c0.open);
    const range = Math.abs(c0.high - c0.low);
    const upperShadow = c0.high - Math.max(c0.open, c0.close);
    const lowerShadow = Math.min(c0.open, c0.close) - c0.low;

    const condition1 = body > 0 && body <= range * ShootingStar.SMALL_BODY_THRESHOLD;
    const condition2 = upperShadow >= body * 2;
    const condition3 = lowerShadow <= body * 0.1;

    return condition1 && condition2 && condition3 ? 'MATCHED' : 'NOT_MATCHED';
  }
}
