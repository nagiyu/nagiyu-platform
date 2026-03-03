import type { ChartDataPoint, PatternResults } from '../types.js';
import { PATTERN_REGISTRY } from './pattern-registry.js';

export class PatternAnalyzer {
  public analyze(candles: ChartDataPoint[]): {
    patternResults: PatternResults;
    buyPatternCount: number;
    sellPatternCount: number;
  } {
    const patternResults: PatternResults = {};
    let buyPatternCount = 0;
    let sellPatternCount = 0;

    for (const pattern of PATTERN_REGISTRY) {
      const status = pattern.analyze(candles);
      patternResults[pattern.definition.patternId] = status;

      if (status === 'MATCHED') {
        if (pattern.definition.signalType === 'BUY') {
          buyPatternCount += 1;
        } else if (pattern.definition.signalType === 'SELL') {
          sellPatternCount += 1;
        }
      }
    }

    return {
      patternResults,
      buyPatternCount,
      sellPatternCount,
    };
  }
}
