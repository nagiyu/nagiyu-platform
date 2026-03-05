import type { ChartDataPoint } from '../../../src/types.js';
import { PatternAnalyzer } from '../../../src/patterns/pattern-analyzer.js';
import { PATTERN_REGISTRY } from '../../../src/patterns/pattern-registry.js';

const createCandle = (open: number, high: number, low: number, close: number): ChartDataPoint => ({
  time: Date.now(),
  open,
  high,
  low,
  close,
  volume: 1000,
});

describe('パターン分析', () => {
  describe('PatternAnalyzer', () => {
    const analyzer = new PatternAnalyzer();

    it('正常系: MorningStar が MATCHED の場合 buyPatternCount が 1 で sellPatternCount が 0 になる', () => {
      const candles = [
        createCandle(70, 100, 65, 95),
        createCandle(55, 60, 50, 54),
        createCandle(100, 110, 50, 60),
      ];

      const result = analyzer.analyze(candles);

      expect(result.patternResults['morning-star']).toBe('MATCHED');
      expect(result.patternResults['evening-star']).toBe('NOT_MATCHED');
      expect(result.patternResults['red-three-soldiers-hesitation']).toBe('NOT_MATCHED');
      expect(result.buyPatternCount).toBe(1);
      expect(result.sellPatternCount).toBe(0);
    });

    it('正常系: EveningStar が MATCHED の場合 buyPatternCount が 0 で sellPatternCount が 1 になる', () => {
      const candles = [
        createCandle(120, 125, 80, 85),
        createCandle(126, 130, 120, 125),
        createCandle(80, 130, 70, 120),
      ];

      const result = analyzer.analyze(candles);

      expect(result.patternResults['morning-star']).toBe('NOT_MATCHED');
      expect(result.patternResults['evening-star']).toBe('MATCHED');
      expect(result.patternResults['red-three-soldiers-hesitation']).toBe('NOT_MATCHED');
      expect(result.buyPatternCount).toBe(0);
      expect(result.sellPatternCount).toBe(1);
    });

    it('正常系: RedThreeSoldiersHesitation が MATCHED の場合 buyPatternCount が 0 で sellPatternCount が 1 になる', () => {
      const candles = [
        createCandle(140, 160, 130, 141),
        createCandle(110, 155, 105, 150),
        createCandle(80, 130, 70, 120),
      ];

      const result = analyzer.analyze(candles);

      expect(result.patternResults['morning-star']).toBe('NOT_MATCHED');
      expect(result.patternResults['evening-star']).toBe('NOT_MATCHED');
      expect(result.patternResults['red-three-soldiers-hesitation']).toBe('MATCHED');
      expect(result.buyPatternCount).toBe(0);
      expect(result.sellPatternCount).toBe(1);
    });

    it('正常系: INSUFFICIENT_DATA はカウント対象外となる', () => {
      const candles = [createCandle(100, 105, 95, 102), createCandle(102, 106, 100, 104)];

      const result = analyzer.analyze(candles);

      expect(result.patternResults['morning-star']).toBe('INSUFFICIENT_DATA');
      expect(result.patternResults['evening-star']).toBe('INSUFFICIENT_DATA');
      expect(result.patternResults['red-three-soldiers-hesitation']).toBe('INSUFFICIENT_DATA');
      expect(result.buyPatternCount).toBe(0);
      expect(result.sellPatternCount).toBe(0);
    });

    it('正常系: 全パターンが NOT_MATCHED の場合 buyPatternCount と sellPatternCount は 0 になる', () => {
      const candles = [
        createCandle(100, 110, 90, 100),
        createCandle(100, 110, 90, 100),
        createCandle(100, 110, 90, 100),
      ];

      const result = analyzer.analyze(candles);

      expect(result.patternResults['morning-star']).toBe('NOT_MATCHED');
      expect(result.patternResults['evening-star']).toBe('NOT_MATCHED');
      expect(result.patternResults['red-three-soldiers-hesitation']).toBe('NOT_MATCHED');
      expect(result.buyPatternCount).toBe(0);
      expect(result.sellPatternCount).toBe(0);
    });

    it('正常系: 追加パターンを含めた MATCHED 件数を BUY/SELL で正しく加算する', () => {
      PATTERN_REGISTRY.forEach((pattern) => {
        jest.spyOn(pattern, 'analyze').mockReturnValue('NOT_MATCHED');
      });

      const matchedBuyPattern = PATTERN_REGISTRY.find(
        (pattern) => pattern.definition.patternId === 'bull-flag'
      );
      const matchedSellPattern = PATTERN_REGISTRY.find(
        (pattern) => pattern.definition.patternId === 'head-and-shoulders'
      );
      if (!matchedBuyPattern || !matchedSellPattern) {
        throw new Error('検証対象パターンが PATTERN_REGISTRY に存在しません');
      }
      jest.spyOn(matchedBuyPattern, 'analyze').mockReturnValue('MATCHED');
      jest.spyOn(matchedSellPattern, 'analyze').mockReturnValue('MATCHED');

      const result = analyzer.analyze([createCandle(100, 110, 90, 100)]);

      expect(result.patternResults['bull-flag']).toBe('MATCHED');
      expect(result.patternResults['head-and-shoulders']).toBe('MATCHED');
      expect(result.buyPatternCount).toBe(1);
      expect(result.sellPatternCount).toBe(1);
      expect(Object.keys(result.patternResults)).toHaveLength(PATTERN_REGISTRY.length);
    });
  });
});
