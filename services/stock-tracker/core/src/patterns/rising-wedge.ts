import type { ChartDataPoint, PatternDefinition, PatternStatus } from '../types.js';
import { CandlestickPattern } from './candlestick-pattern.js';

export class RisingWedge extends CandlestickPattern {
  private static readonly MIN_CANDLES = 6;

  public readonly definition: PatternDefinition = {
    patternId: 'rising-wedge',
    name: '上昇ウェッジ',
    description:
      '売りシグナル。高値・安値が切り上がりながら値幅が収束し、サポートラインを下抜けるパターン。',
    signalType: 'SELL',
  };

  public analyze(candles: ChartDataPoint[]): PatternStatus {
    if (candles.length < RisingWedge.MIN_CANDLES) {
      return 'INSUFFICIENT_DATA';
    }

    const recent = [...candles.slice(0, RisingWedge.MIN_CANDLES)].reverse();
    const isRisingHighs = recent[0].high < recent[2].high && recent[2].high < recent[4].high;
    const isRisingLows = recent[0].low < recent[2].low && recent[2].low < recent[4].low;
    const firstSpread = recent[0].high - recent[0].low;
    const lastSpread = recent[4].high - recent[4].low;
    const isConverging = firstSpread > lastSpread;
    const isBreakdown = recent[5].close < recent[4].low;

    return isRisingHighs && isRisingLows && isConverging && isBreakdown ? 'MATCHED' : 'NOT_MATCHED';
  }
}
