import type { ChartDataPoint, PatternDefinition, PatternStatus } from '../types.js';
import { CandlestickPattern } from './candlestick-pattern.js';

export class RedThreeSoldiersHesitation extends CandlestickPattern {
  private static readonly LARGE_BODY_THRESHOLD = 0.3;
  private static readonly SMALL_BODY_THRESHOLD = 0.1;

  public readonly definition: PatternDefinition = {
    patternId: 'red-three-soldiers-hesitation',
    name: '赤三兵思案星',
    description:
      '売りシグナル。3本の陽線が続いた後、小さな実体の星が現れ上昇の勢いが衰えたことを示す。',
    signalType: 'SELL',
  };

  public analyze(candles: ChartDataPoint[]): PatternStatus {
    if (candles.length < 3) {
      return 'INSUFFICIENT_DATA';
    }

    const c0 = candles[0];
    const c1 = candles[1];
    const c2 = candles[2];

    const c2Body = Math.abs(c2.close - c2.open);
    const c2Range = Math.abs(c2.high - c2.low);
    const condition1 =
      c2.close > c2.open && c2Body > c2Range * RedThreeSoldiersHesitation.LARGE_BODY_THRESHOLD;

    const c1Body = Math.abs(c1.close - c1.open);
    const c1Range = Math.abs(c1.high - c1.low);
    const condition2 =
      c1.close > c1.open &&
      c1Body > c1Range * RedThreeSoldiersHesitation.LARGE_BODY_THRESHOLD &&
      c1.open <= c2.close &&
      c1.close > c2.close;

    const c0Body = Math.abs(c0.close - c0.open);
    const c0Range = Math.abs(c0.high - c0.low);
    const condition3 =
      c0Body <= c0Range * RedThreeSoldiersHesitation.SMALL_BODY_THRESHOLD &&
      c0.open > c1.open &&
      c0.open <= c1.close;

    return condition1 && condition2 && condition3 ? 'MATCHED' : 'NOT_MATCHED';
  }
}
