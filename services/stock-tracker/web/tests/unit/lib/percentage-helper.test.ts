/**
 * Percentage Helper Unit Tests
 *
 * パーセンテージ計算ヘルパー関数の動作を検証
 */

import {
  calculateTargetPriceFromPercentage,
  formatPrice,
  PERCENTAGE_ERROR_MESSAGES,
} from '../../../lib/percentage-helper';

describe('Percentage Helper', () => {
  describe('calculateTargetPriceFromPercentage', () => {
    describe('正常系: 全9パーセンテージでの計算', () => {
      it('基準価格100円、+20%の場合、120.00円を返す', () => {
        expect(calculateTargetPriceFromPercentage(100, 20)).toBe(120.0);
      });

      it('基準価格100円、+15%の場合、115.00円を返す', () => {
        expect(calculateTargetPriceFromPercentage(100, 15)).toBe(115.0);
      });

      it('基準価格100円、+10%の場合、110.00円を返す', () => {
        expect(calculateTargetPriceFromPercentage(100, 10)).toBe(110.0);
      });

      it('基準価格100円、+5%の場合、105.00円を返す', () => {
        expect(calculateTargetPriceFromPercentage(100, 5)).toBe(105.0);
      });

      it('基準価格100円、0%の場合、100.00円を返す', () => {
        expect(calculateTargetPriceFromPercentage(100, 0)).toBe(100.0);
      });

      it('基準価格100円、-5%の場合、95.00円を返す', () => {
        expect(calculateTargetPriceFromPercentage(100, -5)).toBe(95.0);
      });

      it('基準価格100円、-10%の場合、90.00円を返す', () => {
        expect(calculateTargetPriceFromPercentage(100, -10)).toBe(90.0);
      });

      it('基準価格100円、-15%の場合、85.00円を返す', () => {
        expect(calculateTargetPriceFromPercentage(100, -15)).toBe(85.0);
      });

      it('基準価格100円、-20%の場合、80.00円を返す', () => {
        expect(calculateTargetPriceFromPercentage(100, -20)).toBe(80.0);
      });
    });

    describe('正常系: 小数点を含む基準価格での計算', () => {
      it('基準価格123.45円、+20%の場合、148.14円を返す', () => {
        expect(calculateTargetPriceFromPercentage(123.45, 20)).toBe(148.14);
      });

      it('基準価格99.99円、-10%の場合、89.99円を返す', () => {
        expect(calculateTargetPriceFromPercentage(99.99, -10)).toBe(89.99);
      });

      it('基準価格0.01円（最小値）、+20%の場合、0.01円を返す', () => {
        expect(calculateTargetPriceFromPercentage(0.01, 20)).toBe(0.01);
      });
    });

    describe('正常系: 大きな基準価格での計算', () => {
      it('基準価格10000円、+20%の場合、12000.00円を返す', () => {
        expect(calculateTargetPriceFromPercentage(10000, 20)).toBe(12000.0);
      });

      it('基準価格999999円、+20%の場合、1199998.80円を返す', () => {
        expect(calculateTargetPriceFromPercentage(999999, 20)).toBe(1199998.8);
      });
    });

    describe('正常系: 四捨五入の検証', () => {
      it('基準価格100.01円、+20%の場合、四捨五入されて120.01円を返す', () => {
        // 100.01 * 1.2 = 120.012 → 120.01
        expect(calculateTargetPriceFromPercentage(100.01, 20)).toBe(120.01);
      });

      it('基準価格100.09円、+20%の場合、四捨五入されて120.11円を返す', () => {
        // 100.09 * 1.2 = 120.108 → 120.11
        expect(calculateTargetPriceFromPercentage(100.09, 20)).toBe(120.11);
      });

      it('基準価格33.33円、+10%の場合、四捨五入されて36.66円を返す', () => {
        // 33.33 * 1.1 = 36.663 → 36.66
        expect(calculateTargetPriceFromPercentage(33.33, 10)).toBe(36.66);
      });
    });

    describe('異常系: 不正な基準価格', () => {
      it('基準価格が0の場合、エラーをスローする', () => {
        expect(() => calculateTargetPriceFromPercentage(0, 20)).toThrow(
          PERCENTAGE_ERROR_MESSAGES.INVALID_BASE_PRICE
        );
      });

      it('基準価格が負の値の場合、エラーをスローする', () => {
        expect(() => calculateTargetPriceFromPercentage(-100, 20)).toThrow(
          PERCENTAGE_ERROR_MESSAGES.INVALID_BASE_PRICE
        );
      });

      it('基準価格がNaNの場合、エラーをスローする', () => {
        expect(() => calculateTargetPriceFromPercentage(NaN, 20)).toThrow(
          PERCENTAGE_ERROR_MESSAGES.INVALID_BASE_PRICE
        );
      });

      it('基準価格がInfinityの場合、エラーをスローする', () => {
        expect(() => calculateTargetPriceFromPercentage(Infinity, 20)).toThrow(
          PERCENTAGE_ERROR_MESSAGES.INVALID_BASE_PRICE
        );
      });
    });

    describe('異常系: 不正なパーセンテージ', () => {
      it('パーセンテージが-100未満の場合、エラーをスローする', () => {
        expect(() => calculateTargetPriceFromPercentage(100, -101)).toThrow(
          PERCENTAGE_ERROR_MESSAGES.INVALID_PERCENTAGE
        );
      });

      it('パーセンテージがNaNの場合、エラーをスローする', () => {
        expect(() => calculateTargetPriceFromPercentage(100, NaN)).toThrow(
          PERCENTAGE_ERROR_MESSAGES.INVALID_PERCENTAGE
        );
      });

      it('パーセンテージがInfinityの場合、エラーをスローする', () => {
        expect(() => calculateTargetPriceFromPercentage(100, Infinity)).toThrow(
          PERCENTAGE_ERROR_MESSAGES.INVALID_PERCENTAGE
        );
      });
    });

    describe('エッジケース: 境界値でのテスト', () => {
      it('パーセンテージが-100%の場合、0.00円を返す', () => {
        expect(calculateTargetPriceFromPercentage(100, -100)).toBe(0.0);
      });

      it('パーセンテージが+100%の場合、200.00円を返す', () => {
        expect(calculateTargetPriceFromPercentage(100, 100)).toBe(200.0);
      });

      it('パーセンテージが+1000%の場合、1100.00円を返す', () => {
        expect(calculateTargetPriceFromPercentage(100, 1000)).toBe(1100.0);
      });

      it('基準価格が非常に小さい値（0.01円）の場合でも計算できる', () => {
        expect(calculateTargetPriceFromPercentage(0.01, 0)).toBe(0.01);
        expect(calculateTargetPriceFromPercentage(0.01, 100)).toBe(0.02);
      });
    });
  });

  describe('formatPrice', () => {
    it('整数値を小数点第2位までフォーマットする', () => {
      expect(formatPrice(100)).toBe('100.00');
    });

    it('小数点第1位までの値を第2位までフォーマットする', () => {
      expect(formatPrice(120.5)).toBe('120.50');
    });

    it('小数点第2位までの値をそのままフォーマットする', () => {
      expect(formatPrice(120.99)).toBe('120.99');
    });

    it('小数点第3位以降は四捨五入される', () => {
      expect(formatPrice(120.555)).toBe('120.56');
      expect(formatPrice(120.554)).toBe('120.55');
    });

    it('0をフォーマットする', () => {
      expect(formatPrice(0)).toBe('0.00');
    });

    it('非常に大きな値をフォーマットする', () => {
      expect(formatPrice(1000000)).toBe('1000000.00');
    });

    it('非常に小さな値をフォーマットする', () => {
      expect(formatPrice(0.01)).toBe('0.01');
    });
  });
});
