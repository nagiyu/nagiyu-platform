/**
 * Stock Tracker Core - Price Calculator Service Unit Tests
 *
 * 目標価格算出ロジックのユニットテスト
 */

import { calculateTargetPrice, ERROR_MESSAGES } from '../../../src/services/price-calculator.js';

describe('Price Calculator Service', () => {
  describe('calculateTargetPrice', () => {
    describe('正常系: 複数の価格でのテスト', () => {
      it('100 の場合、120 を返す', () => {
        expect(calculateTargetPrice(100)).toBe(120);
      });

      it('250.50 の場合、300.60 を返す', () => {
        const result = calculateTargetPrice(250.5);
        expect(result).toBeCloseTo(300.6, 10);
      });

      it('1000 の場合、1200 を返す', () => {
        expect(calculateTargetPrice(1000)).toBe(1200);
      });

      it('50.25 の場合、60.30 を返す', () => {
        expect(calculateTargetPrice(50.25)).toBe(60.3);
      });

      it('999.99 の場合、1199.988 を返す', () => {
        expect(calculateTargetPrice(999.99)).toBe(1199.988);
      });
    });

    describe('境界値テスト', () => {
      it('0.01 の場合、0.012 を返す', () => {
        expect(calculateTargetPrice(0.01)).toBe(0.012);
      });

      it('0 の場合、0 を返す', () => {
        expect(calculateTargetPrice(0)).toBe(0);
      });

      it('1,000,000 の場合、1,200,000 を返す', () => {
        expect(calculateTargetPrice(1000000)).toBe(1200000);
      });
    });

    describe('小数点処理の確認', () => {
      it('100.12345 の場合、小数点以下が正確に処理される', () => {
        const result = calculateTargetPrice(100.12345);
        expect(result).toBeCloseTo(120.14814, 5);
      });

      it('0.333333 の場合、小数点以下が正確に処理される', () => {
        const result = calculateTargetPrice(0.333333);
        expect(result).toBeCloseTo(0.3999996, 7);
      });

      it('1.111111 の場合、小数点以下が正確に処理される', () => {
        const result = calculateTargetPrice(1.111111);
        expect(result).toBeCloseTo(1.3333332, 7);
      });

      it('小数点以下の桁数が多い場合でも正確に計算される', () => {
        const result = calculateTargetPrice(123.456789);
        expect(result).toBeCloseTo(148.1481468, 7);
      });
    });

    describe('エッジケース', () => {
      it('非常に小さい値（0.0001）の場合、正しく計算される', () => {
        expect(calculateTargetPrice(0.0001)).toBe(0.00012);
      });

      it('非常に大きい値（10,000,000）の場合、正しく計算される', () => {
        expect(calculateTargetPrice(10000000)).toBe(12000000);
      });

      it('1 の場合、1.2 を返す', () => {
        expect(calculateTargetPrice(1)).toBe(1.2);
      });

      it('10 の場合、12 を返す', () => {
        expect(calculateTargetPrice(10)).toBe(12);
      });
    });

    describe('エラーハンドリング', () => {
      it('NaN の場合、エラーをスローする', () => {
        expect(() => calculateTargetPrice(NaN)).toThrow(ERROR_MESSAGES.INVALID_PRICE);
      });

      it('負の値の場合、エラーをスローする', () => {
        expect(() => calculateTargetPrice(-100)).toThrow(ERROR_MESSAGES.INVALID_PRICE);
      });

      it('負の小数の場合、エラーをスローする', () => {
        expect(() => calculateTargetPrice(-0.01)).toThrow(ERROR_MESSAGES.INVALID_PRICE);
      });

      it('数値でない場合、エラーをスローする', () => {
        expect(() => calculateTargetPrice('100' as unknown as number)).toThrow(
          ERROR_MESSAGES.INVALID_PRICE
        );
      });

      it('undefined の場合、エラーをスローする', () => {
        expect(() => calculateTargetPrice(undefined as unknown as number)).toThrow(
          ERROR_MESSAGES.INVALID_PRICE
        );
      });

      it('null の場合、エラーをスローする', () => {
        expect(() => calculateTargetPrice(null as unknown as number)).toThrow(
          ERROR_MESSAGES.INVALID_PRICE
        );
      });

      it('Infinity の場合、エラーをスローする', () => {
        expect(() => calculateTargetPrice(Infinity)).toThrow(ERROR_MESSAGES.INVALID_PRICE);
      });

      it('-Infinity の場合、エラーをスローする', () => {
        expect(() => calculateTargetPrice(-Infinity)).toThrow(ERROR_MESSAGES.INVALID_PRICE);
      });
    });

    describe('実用的なシナリオ', () => {
      it('Apple株（AAPL）想定価格 $150.00 の場合、目標価格 $180.00 を返す', () => {
        expect(calculateTargetPrice(150.0)).toBe(180.0);
      });

      it('NVIDIA株（NVDA）想定価格 $500.00 の場合、目標価格 $600.00 を返す', () => {
        expect(calculateTargetPrice(500.0)).toBe(600.0);
      });

      it('Tesla株（TSLA）想定価格 $250.75 の場合、目標価格 $300.90 を返す', () => {
        expect(calculateTargetPrice(250.75)).toBe(300.9);
      });

      it('低価格株 $5.50 の場合、目標価格 $6.60 を返す', () => {
        expect(calculateTargetPrice(5.5)).toBe(6.6);
      });

      it('高価格株 $10,000 の場合、目標価格 $12,000 を返す', () => {
        expect(calculateTargetPrice(10000)).toBe(12000);
      });
    });
  });
});
