/**
 * zod スキーマバリデーションの単体テスト
 */

import { JobConfigSchema } from '../../src/lib/types.js';

describe('JobConfigSchema バリデーション', () => {
  describe('有効な入力', () => {
    it('mirror 戦略（最小構成）を受け付ける', () => {
      const input = {
        sourceTable: 'nagiyu-test-prod',
        destTable: 'nagiyu-test-dev',
        strategy: 'mirror',
        delete: 'on',
      };

      const result = JobConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('mirror 戦略（scope 付き）を受け付ける', () => {
      const input = {
        sourceTable: 'nagiyu-test-prod',
        destTable: 'nagiyu-test-dev',
        strategy: 'mirror',
        scope: { pkPrefix: 'USER#' },
        delete: 'on',
      };

      const result = JobConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('mirror 戦略（scope + skPrefix）を受け付ける', () => {
      const input = {
        sourceTable: 'nagiyu-test-prod',
        destTable: 'nagiyu-test-dev',
        strategy: 'mirror',
        scope: { pkPrefix: 'USER#', skPrefix: 'PROFILE#' },
        delete: 'off',
      };

      const result = JobConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('gsiWindow 戦略（gsi 付き）を受け付ける', () => {
      const input = {
        sourceTable: 'nagiyu-test-prod',
        destTable: 'nagiyu-test-dev',
        strategy: 'gsiWindow',
        delete: 'off',
        gsi: {
          indexName: 'GSI1',
          pkAttributeName: 'GSI1PK',
          pkValue: 'ALERT',
          skAttributeName: 'GSI1SK',
          windowDays: 7,
        },
      };

      const result = JobConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe('無効な入力', () => {
    it('sourceTable が空文字列の場合はエラー', () => {
      const input = {
        sourceTable: '',
        destTable: 'nagiyu-test-dev',
        strategy: 'mirror',
        delete: 'on',
      };

      const result = JobConfigSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('destTable が空文字列の場合はエラー', () => {
      const input = {
        sourceTable: 'nagiyu-test-prod',
        destTable: '',
        strategy: 'mirror',
        delete: 'on',
      };

      const result = JobConfigSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('strategy が不正な値の場合はエラー', () => {
      const input = {
        sourceTable: 'nagiyu-test-prod',
        destTable: 'nagiyu-test-dev',
        strategy: 'invalid-strategy',
        delete: 'on',
      };

      const result = JobConfigSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('delete が不正な値の場合はエラー', () => {
      const input = {
        sourceTable: 'nagiyu-test-prod',
        destTable: 'nagiyu-test-dev',
        strategy: 'mirror',
        delete: 'yes', // on/off 以外
      };

      const result = JobConfigSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('必須フィールドが欠けている場合はエラー', () => {
      const input = {
        sourceTable: 'nagiyu-test-prod',
        // destTable が無い
        strategy: 'mirror',
        delete: 'on',
      };

      const result = JobConfigSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('gsi.windowDays が 0 以下の場合はエラー', () => {
      const input = {
        sourceTable: 'nagiyu-test-prod',
        destTable: 'nagiyu-test-dev',
        strategy: 'gsiWindow',
        delete: 'off',
        gsi: {
          indexName: 'GSI1',
          pkAttributeName: 'GSI1PK',
          pkValue: 'ALERT',
          skAttributeName: 'GSI1SK',
          windowDays: 0, // 正の整数のみ許可
        },
      };

      const result = JobConfigSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('gsi.indexName が空文字列の場合はエラー', () => {
      const input = {
        sourceTable: 'nagiyu-test-prod',
        destTable: 'nagiyu-test-dev',
        strategy: 'gsiWindow',
        delete: 'off',
        gsi: {
          indexName: '',
          pkAttributeName: 'GSI1PK',
          pkValue: 'ALERT',
          skAttributeName: 'GSI1SK',
          windowDays: 7,
        },
      };

      const result = JobConfigSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('完全に null の場合はエラー', () => {
      const result = JobConfigSchema.safeParse(null);
      expect(result.success).toBe(false);
    });

    it('undefined の場合はエラー', () => {
      const result = JobConfigSchema.safeParse(undefined);
      expect(result.success).toBe(false);
    });
  });
});
