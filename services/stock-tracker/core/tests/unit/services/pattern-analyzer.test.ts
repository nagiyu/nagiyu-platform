/**
 * Stock Tracker Core - Pattern Analyzer Unit Tests
 *
 * ローソク足パターン分析ロジックのユニットテスト
 */

import {
  analyzePatterns,
  detectEveningStar,
  detectMorningStar,
  PATTERN_DEFINITIONS,
} from '../../../src/services/pattern-analyzer.js';
import type { ChartDataPoint } from '../../../src/types.js';

/** 最新順（data[0] = 最新）のテストデータを生成するヘルパー */
function makeCandle(open: number, close: number, highOffset = 5, lowOffset = 5): ChartDataPoint {
  return {
    time: Date.now(),
    open,
    high: Math.max(open, close) + highOffset,
    low: Math.min(open, close) - lowOffset,
    close,
    volume: 1000,
  };
}

/** 大陰線（大きなボディ、下降） */
const largeBearish = makeCandle(100, 98.5); // 1.5% 下落
/** 大陽線（大きなボディ、上昇） */
const largeBullish = makeCandle(98, 100.0); // 2% 上昇
/** 小ボディ（星） */
const smallBody = makeCandle(99, 99.1); // 0.1% 変動

describe('Pattern Analyzer', () => {
  describe('PATTERN_DEFINITIONS', () => {
    it('2つのパターンが定義されている', () => {
      expect(PATTERN_DEFINITIONS).toHaveLength(2);
    });

    it('三川明けの明星は Buy タイプ', () => {
      const morningStar = PATTERN_DEFINITIONS.find((p) => p.id === 'morning-star');
      expect(morningStar).toBeDefined();
      expect(morningStar?.type).toBe('Buy');
    });

    it('三川宵の明星は Sell タイプ', () => {
      const eveningStar = PATTERN_DEFINITIONS.find((p) => p.id === 'evening-star');
      expect(eveningStar).toBeDefined();
      expect(eveningStar?.type).toBe('Sell');
    });
  });

  describe('detectMorningStar', () => {
    it('正しいパターン（大陰線・星・大陽線＋中央以上）で true を返す', () => {
      // data[0]=最新, data[1]=中間, data[2]=最古
      const data: ChartDataPoint[] = [largeBullish, smallBody, largeBearish];
      expect(detectMorningStar(data)).toBe(true);
    });

    it('データが3本未満の場合 false を返す', () => {
      expect(detectMorningStar([])).toBe(false);
      expect(detectMorningStar([largeBullish])).toBe(false);
      expect(detectMorningStar([largeBullish, smallBody])).toBe(false);
    });

    it('第1本目が大陰線でない場合 false を返す', () => {
      const data: ChartDataPoint[] = [largeBullish, smallBody, largeBullish];
      expect(detectMorningStar(data)).toBe(false);
    });

    it('第2本目が小ボディでない場合 false を返す', () => {
      const data: ChartDataPoint[] = [largeBullish, largeBearish, largeBearish];
      expect(detectMorningStar(data)).toBe(false);
    });

    it('第3本目が大陽線でない場合 false を返す', () => {
      const data: ChartDataPoint[] = [largeBearish, smallBody, largeBearish];
      expect(detectMorningStar(data)).toBe(false);
    });

    it('第3本目の終値が第1本目の中央に達しない場合 false を返す', () => {
      // largeBearish: open=100, close=98.5 → midpoint=99.25
      // 終値が 99.25 未満の大陽線を作成
      const weakBullish = makeCandle(98, 99.0); // 1% 上昇だが中央未満
      const data: ChartDataPoint[] = [weakBullish, smallBody, largeBearish];
      expect(detectMorningStar(data)).toBe(false);
    });

    it('50本のデータがあっても最新3本のみを使用する', () => {
      const extraCandles: ChartDataPoint[] = Array.from({ length: 47 }, () => makeCandle(90, 91));
      const data: ChartDataPoint[] = [largeBullish, smallBody, largeBearish, ...extraCandles];
      expect(detectMorningStar(data)).toBe(true);
    });
  });

  describe('detectEveningStar', () => {
    it('正しいパターン（大陽線・星・大陰線＋中央以下）で true を返す', () => {
      // largeBullish: open=98, close=100
      // midpoint = 99
      // largeBearish: open=100, close=98.5 → 98.5 <= 99 ✓
      const data: ChartDataPoint[] = [largeBearish, smallBody, largeBullish];
      expect(detectEveningStar(data)).toBe(true);
    });

    it('データが3本未満の場合 false を返す', () => {
      expect(detectEveningStar([])).toBe(false);
      expect(detectEveningStar([largeBearish])).toBe(false);
      expect(detectEveningStar([largeBearish, smallBody])).toBe(false);
    });

    it('第1本目が大陽線でない場合 false を返す', () => {
      const data: ChartDataPoint[] = [largeBearish, smallBody, largeBearish];
      expect(detectEveningStar(data)).toBe(false);
    });

    it('第2本目が小ボディでない場合 false を返す', () => {
      const data: ChartDataPoint[] = [largeBearish, largeBullish, largeBullish];
      expect(detectEveningStar(data)).toBe(false);
    });

    it('第3本目が大陰線でない場合 false を返す', () => {
      const data: ChartDataPoint[] = [largeBullish, smallBody, largeBullish];
      expect(detectEveningStar(data)).toBe(false);
    });

    it('第3本目の終値が第1本目の中央より上の場合 false を返す', () => {
      // largeBullish: open=98, close=100 → midpoint=99
      // 終値が 99 より大きい大陰線を作成
      const weakBearish = makeCandle(100, 99.5); // 0.5% 下落（閾値未満）
      const notSoBearish = makeCandle(102, 99.5); // 中央より上（99.5 > 99）だが大陰線
      const data: ChartDataPoint[] = [notSoBearish, smallBody, largeBullish];
      expect(detectEveningStar(data)).toBe(false);
    });
  });

  describe('analyzePatterns', () => {
    it('すべてのパターン定義の結果を返す', () => {
      const data: ChartDataPoint[] = [largeBullish, smallBody, largeBearish];
      const results = analyzePatterns(data);
      expect(results).toHaveLength(PATTERN_DEFINITIONS.length);
    });

    it('各結果に id, name, description, type, detected フィールドが含まれる', () => {
      const data: ChartDataPoint[] = [largeBullish, smallBody, largeBearish];
      const results = analyzePatterns(data);
      for (const result of results) {
        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('name');
        expect(result).toHaveProperty('description');
        expect(result).toHaveProperty('type');
        expect(result).toHaveProperty('detected');
      }
    });

    it('三川明けの明星パターンが検出された場合、detected=true を返す', () => {
      // morning star: data[0]=最新(大陽線), data[1]=星, data[2]=最古(大陰線)
      const data: ChartDataPoint[] = [largeBullish, smallBody, largeBearish];
      const results = analyzePatterns(data);
      const morningStar = results.find((r) => r.id === 'morning-star');
      expect(morningStar?.detected).toBe(true);
      const eveningStar = results.find((r) => r.id === 'evening-star');
      expect(eveningStar?.detected).toBe(false);
    });

    it('三川宵の明星パターンが検出された場合、detected=true を返す', () => {
      // evening star: data[0]=最新(大陰線), data[1]=星, data[2]=最古(大陽線)
      const data: ChartDataPoint[] = [largeBearish, smallBody, largeBullish];
      const results = analyzePatterns(data);
      const eveningStar = results.find((r) => r.id === 'evening-star');
      expect(eveningStar?.detected).toBe(true);
      const morningStar = results.find((r) => r.id === 'morning-star');
      expect(morningStar?.detected).toBe(false);
    });

    it('データが空の場合すべて detected=false を返す', () => {
      const results = analyzePatterns([]);
      for (const result of results) {
        expect(result.detected).toBe(false);
      }
    });

    it('ゼロ価格のローソク足を含む場合 false を返す（ゼロ除算ガード）', () => {
      const zeroCandle: ChartDataPoint = { time: 0, open: 0, high: 0, low: 0, close: 0, volume: 0 };
      const data: ChartDataPoint[] = [zeroCandle, zeroCandle, zeroCandle];
      const results = analyzePatterns(data);
      for (const result of results) {
        expect(result.detected).toBe(false);
      }
    });
  });
});
