/**
 * @nagiyu/common - Validation Helpers Tests
 *
 * 汎用バリデーションヘルパー関数のテスト
 */

import {
  isNonEmptyString,
  isValidNumber,
  isValidTimestamp,
} from '../../../src/validation/helpers.js';

describe('Validation Helpers', () => {
  describe('isNonEmptyString', () => {
    describe('正常系', () => {
      it('有効な文字列を受理する', () => {
        expect(isNonEmptyString('test')).toBe(true);
        expect(isNonEmptyString('a')).toBe(true);
        expect(isNonEmptyString('Hello World')).toBe(true);
        expect(isNonEmptyString('123')).toBe(true);
      });

      it('前後に空白がある文字列を受理する（trimされる）', () => {
        expect(isNonEmptyString('  test  ')).toBe(true);
        expect(isNonEmptyString('\ttest\t')).toBe(true);
        expect(isNonEmptyString('\ntest\n')).toBe(true);
      });
    });

    describe('異常系', () => {
      it('空文字列を拒否する', () => {
        expect(isNonEmptyString('')).toBe(false);
      });

      it('空白のみの文字列を拒否する', () => {
        expect(isNonEmptyString('   ')).toBe(false);
        expect(isNonEmptyString('\t')).toBe(false);
        expect(isNonEmptyString('\n')).toBe(false);
        expect(isNonEmptyString('\r\n')).toBe(false);
        expect(isNonEmptyString('  \t\n  ')).toBe(false);
      });
    });
  });

  describe('isValidNumber', () => {
    describe('正常系', () => {
      it('範囲内の値を受理する', () => {
        expect(isValidNumber(50, 0, 100)).toBe(true);
        expect(isValidNumber(1, 1, 10)).toBe(true);
        expect(isValidNumber(5.5, 0, 10)).toBe(true);
        expect(isValidNumber(0.01, 0.01, 1_000_000)).toBe(true);
      });

      it('境界値を受理する', () => {
        // 最小値
        expect(isValidNumber(0, 0, 100)).toBe(true);
        expect(isValidNumber(0.01, 0.01, 1_000_000)).toBe(true);

        // 最大値
        expect(isValidNumber(100, 0, 100)).toBe(true);
        expect(isValidNumber(1_000_000, 0.01, 1_000_000)).toBe(true);
      });

      it('負の値の範囲もチェックできる', () => {
        expect(isValidNumber(-5, -10, 0)).toBe(true);
        expect(isValidNumber(-10, -10, 0)).toBe(true);
        expect(isValidNumber(0, -10, 0)).toBe(true);
      });
    });

    describe('異常系', () => {
      it('最小値未満を拒否する', () => {
        expect(isValidNumber(-1, 0, 100)).toBe(false);
        expect(isValidNumber(0, 0.01, 1_000_000)).toBe(false);
        expect(isValidNumber(0.009, 0.01, 1_000_000)).toBe(false);
      });

      it('最大値超過を拒否する', () => {
        expect(isValidNumber(101, 0, 100)).toBe(false);
        expect(isValidNumber(1_000_001, 0.01, 1_000_000)).toBe(false);
        expect(isValidNumber(1_000_000.01, 0.01, 1_000_000)).toBe(false);
      });

      it('NaNを拒否する', () => {
        expect(isValidNumber(NaN, 0, 100)).toBe(false);
        expect(isValidNumber(NaN, -Infinity, Infinity)).toBe(false);
      });

      it('Infinityを拒否する', () => {
        expect(isValidNumber(Infinity, 0, 100)).toBe(false);
        expect(isValidNumber(-Infinity, 0, 100)).toBe(false);
        expect(isValidNumber(Infinity, -Infinity, Infinity)).toBe(false);
      });
    });

    describe('エッジケース', () => {
      it('非常に小さい数値を正しく処理する', () => {
        expect(isValidNumber(0.0001, 0.0001, 1_000_000_000)).toBe(true);
        expect(isValidNumber(0.00009, 0.0001, 1_000_000_000)).toBe(false);
      });

      it('非常に大きい数値を正しく処理する', () => {
        expect(isValidNumber(1_000_000_000, 0.0001, 1_000_000_000)).toBe(true);
        expect(isValidNumber(1_000_000_001, 0.0001, 1_000_000_000)).toBe(false);
      });
    });
  });

  describe('isValidTimestamp', () => {
    describe('正常系', () => {
      it('現在時刻のタイムスタンプを受理する', () => {
        const now = Date.now();
        expect(isValidTimestamp(now)).toBe(true);
      });

      it('過去のタイムスタンプを受理する', () => {
        const pastTimestamp = Date.now() - 86400000; // 1日前
        expect(isValidTimestamp(pastTimestamp)).toBe(true);
      });

      it('未来のタイムスタンプを受理する（1日以内）', () => {
        const futureTimestamp = Date.now() + 43200000; // 12時間後
        expect(isValidTimestamp(futureTimestamp)).toBe(true);
      });

      it('現在時刻 + 1日（ちょうど）を受理する', () => {
        const maxTimestamp = Date.now() + 86400000;
        expect(isValidTimestamp(maxTimestamp)).toBe(true);
      });
    });

    describe('異常系', () => {
      it('0を拒否する', () => {
        expect(isValidTimestamp(0)).toBe(false);
      });

      it('負の値を拒否する', () => {
        expect(isValidTimestamp(-1)).toBe(false);
        expect(isValidTimestamp(-100)).toBe(false);
        expect(isValidTimestamp(-86400000)).toBe(false);
      });

      it('現在時刻 + 1日以降を拒否する', () => {
        const tooFutureTimestamp = Date.now() + 86400001; // 1日 + 1ミリ秒後
        expect(isValidTimestamp(tooFutureTimestamp)).toBe(false);
      });

      it('遠い未来のタイムスタンプを拒否する', () => {
        const farFuture = Date.now() + 86400000 * 365; // 1年後
        expect(isValidTimestamp(farFuture)).toBe(false);
      });
    });

    describe('エッジケース', () => {
      it('1ミリ秒のタイムスタンプを受理する', () => {
        expect(isValidTimestamp(1)).toBe(true);
      });

      it('非常に古いタイムスタンプを受理する（正の値であれば）', () => {
        const veryOld = 1000000000; // 1970-01-12 14:46:40
        expect(isValidTimestamp(veryOld)).toBe(true);
      });
    });
  });
});
