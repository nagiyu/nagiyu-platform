/**
 * AI 解析フォーマッタ Unit Tests
 *
 * formatPredictedReturn / formatConfidence の動作を検証。
 */

import { formatPredictedReturn, formatConfidence } from '../../../lib/ai-analysis-format';

describe('formatPredictedReturn', () => {
  describe('正常系: 正の値', () => {
    it('+1.23% を "+1.23%" にフォーマットする', () => {
      expect(formatPredictedReturn(1.23)).toBe('+1.23%');
    });

    it('+0.50% を "+0.50%" にフォーマットする', () => {
      expect(formatPredictedReturn(0.5)).toBe('+0.50%');
    });

    it('+0.00% を "+0.00%" にフォーマットする', () => {
      expect(formatPredictedReturn(0)).toBe('+0.00%');
    });

    it('大きな正の値 +100.00% を正しくフォーマットする', () => {
      expect(formatPredictedReturn(100)).toBe('+100.00%');
    });
  });

  describe('正常系: 負の値', () => {
    it('-0.40% を "-0.40%" にフォーマットする', () => {
      expect(formatPredictedReturn(-0.4)).toBe('-0.40%');
    });

    it('-1.00% を "-1.00%" にフォーマットする', () => {
      expect(formatPredictedReturn(-1.0)).toBe('-1.00%');
    });

    it('大きな負の値 -50.00% を正しくフォーマットする', () => {
      expect(formatPredictedReturn(-50)).toBe('-50.00%');
    });
  });

  describe('正常系: 小数の丸め', () => {
    it('小数点2桁以降を四捨五入する', () => {
      // 1.234567 → "+1.23%"（toFixed(2) の挙動）
      expect(formatPredictedReturn(1.234567)).toBe('+1.23%');
    });

    it('0に非常に近い正の値は "+0.00%" になる', () => {
      expect(formatPredictedReturn(0.001)).toBe('+0.00%');
    });
  });
});

describe('formatConfidence', () => {
  describe('正常系: [0,1] 範囲内', () => {
    it('0.72 → "72%"', () => {
      expect(formatConfidence(0.72)).toBe('72%');
    });

    it('0 → "0%"', () => {
      expect(formatConfidence(0)).toBe('0%');
    });

    it('1 → "100%"', () => {
      expect(formatConfidence(1)).toBe('100%');
    });

    it('0.5 → "50%"', () => {
      expect(formatConfidence(0.5)).toBe('50%');
    });

    it('0.999 → "100%"（Math.round）', () => {
      expect(formatConfidence(0.999)).toBe('100%');
    });

    it('0.001 → "0%"（Math.round）', () => {
      expect(formatConfidence(0.001)).toBe('0%');
    });
  });

  describe('正常系: [0,1] 外の値でも破綻しない', () => {
    it('1.5 → "150%"（範囲外でも計算結果を返す）', () => {
      expect(formatConfidence(1.5)).toBe('150%');
    });

    it('-0.1 → "-10%"（範囲外でも計算結果を返す）', () => {
      expect(formatConfidence(-0.1)).toBe('-10%');
    });
  });
});
