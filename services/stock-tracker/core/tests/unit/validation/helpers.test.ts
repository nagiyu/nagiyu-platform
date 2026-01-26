/**
 * Validation Helpers Test
 *
 * バリデーション関数のユニットテスト
 */

import {
  isValidPrice,
  isValidQuantity,
} from '../../../src/validation/helpers.js';
import { isNonEmptyString, isValidTimestamp } from '@nagiyu/common';

describe('Validation Helpers', () => {
  describe('isValidPrice', () => {
    it('should accept valid prices', () => {
      expect(isValidPrice(0.01)).toBe(true);
      expect(isValidPrice(1)).toBe(true);
      expect(isValidPrice(100)).toBe(true);
      expect(isValidPrice(1000)).toBe(true);
      expect(isValidPrice(1_000_000)).toBe(true);
    });

    it('should reject prices below minimum', () => {
      expect(isValidPrice(0)).toBe(false);
      expect(isValidPrice(0.009)).toBe(false);
      expect(isValidPrice(-1)).toBe(false);
      expect(isValidPrice(-100)).toBe(false);
    });

    it('should reject prices above maximum', () => {
      expect(isValidPrice(1_000_001)).toBe(false);
      expect(isValidPrice(10_000_000)).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(isValidPrice(0.01)).toBe(true); // minimum
      expect(isValidPrice(1_000_000)).toBe(true); // maximum
    });
  });

  describe('isValidQuantity', () => {
    it('should accept valid quantities', () => {
      expect(isValidQuantity(0.0001)).toBe(true);
      expect(isValidQuantity(1)).toBe(true);
      expect(isValidQuantity(100)).toBe(true);
      expect(isValidQuantity(1000)).toBe(true);
      expect(isValidQuantity(1_000_000_000)).toBe(true);
    });

    it('should reject quantities below minimum', () => {
      expect(isValidQuantity(0)).toBe(false);
      expect(isValidQuantity(0.00009)).toBe(false);
      expect(isValidQuantity(-1)).toBe(false);
    });

    it('should reject quantities above maximum', () => {
      expect(isValidQuantity(1_000_000_001)).toBe(false);
      expect(isValidQuantity(10_000_000_000)).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(isValidQuantity(0.0001)).toBe(true); // minimum
      expect(isValidQuantity(1_000_000_000)).toBe(true); // maximum
    });
  });

  describe('isNonEmptyString', () => {
    it('should accept non-empty strings', () => {
      expect(isNonEmptyString('test')).toBe(true);
      expect(isNonEmptyString('a')).toBe(true);
      expect(isNonEmptyString('  test  ')).toBe(true);
    });

    it('should reject empty strings', () => {
      expect(isNonEmptyString('')).toBe(false);
      expect(isNonEmptyString('   ')).toBe(false);
      expect(isNonEmptyString('\t')).toBe(false);
      expect(isNonEmptyString('\n')).toBe(false);
    });

    it('should handle special characters', () => {
      expect(isNonEmptyString('!@#$%')).toBe(true);
      expect(isNonEmptyString('日本語')).toBe(true);
      expect(isNonEmptyString('123')).toBe(true);
    });
  });

  describe('isValidTimestamp', () => {
    it('should accept valid timestamps', () => {
      const now = Date.now();
      expect(isValidTimestamp(now)).toBe(true);
      expect(isValidTimestamp(now - 86400000)).toBe(true); // 1日前
      expect(isValidTimestamp(now - 86400000 * 7)).toBe(true); // 1週間前
      expect(isValidTimestamp(1)).toBe(true); // 最小値
    });

    it('should reject invalid timestamps', () => {
      expect(isValidTimestamp(0)).toBe(false);
      expect(isValidTimestamp(-1)).toBe(false);
      expect(isValidTimestamp(-100)).toBe(false);
    });

    it('should reject future timestamps (more than 1 day ahead)', () => {
      const future = Date.now() + 86400000 * 2; // 2日後
      expect(isValidTimestamp(future)).toBe(false);
    });

    it('should accept near-future timestamps (within 1 day)', () => {
      const nearFuture = Date.now() + 3600000; // 1時間後
      expect(isValidTimestamp(nearFuture)).toBe(true);
    });

    it('should handle edge cases', () => {
      const now = Date.now();
      const oneDayLater = now + 86400000;
      expect(isValidTimestamp(oneDayLater)).toBe(true); // ちょうど1日後
    });
  });
});
