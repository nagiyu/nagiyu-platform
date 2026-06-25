/**
 * zod スキーマバリデーションの単体テスト
 */

import { JobConfigSchema } from '../../src/lib/types.js';

describe('JobConfigSchema バリデーション', () => {
  describe('有効な入力', () => {
    it('mirror 戦略（scope 付き・最小構成）を受け付ける', () => {
      // mirror 戦略では scope は必須。scope なしは無効（無効入力テストで確認）。
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

    it('mirror 戦略（scope + delete=off）を受け付ける', () => {
      const input = {
        sourceTable: 'nagiyu-test-prod',
        destTable: 'nagiyu-test-dev',
        strategy: 'mirror',
        scope: { pkPrefix: '' }, // pkPrefix は空文字列も許容（全件スキャン）
        delete: 'off',
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

    it('mirror 戦略（pkPrefix 空文字列のスコープ）を受け付ける', () => {
      // pkPrefix="" は全件スキャンを意味する正当な構成
      const input = {
        sourceTable: 'nagiyu-test-prod',
        destTable: 'nagiyu-test-dev',
        strategy: 'mirror',
        scope: { pkPrefix: '' },
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

    it('gsiWindow 戦略（skPrefix + dateGranularity=date 付き）を受け付ける', () => {
      const input = {
        sourceTable: 'nagiyu-test-prod',
        destTable: 'nagiyu-test-dev',
        strategy: 'gsiWindow',
        delete: 'off',
        gsi: {
          indexName: 'GSI4',
          pkAttributeName: 'GSI4PK',
          pkValue: 'DAILY_SUMMARY',
          skAttributeName: 'GSI4SK',
          windowDays: 14,
          skPrefix: 'DATE#',
          dateGranularity: 'date',
        },
      };

      const result = JobConfigSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('gsiWindow 戦略（dateGranularity=datetime を明示指定）を受け付ける', () => {
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
          dateGranularity: 'datetime',
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

    it('gsi.dateGranularity が不正な値の場合はエラー', () => {
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
          dateGranularity: 'monthly', // date / datetime 以外
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

    describe('strategy × delete × gsi/scope 相互検証', () => {
      it('mirror 戦略で scope が未指定の場合はエラー（MIRROR_SCOPE_REQUIRED）', () => {
        const input = {
          sourceTable: 'nagiyu-test-prod',
          destTable: 'nagiyu-test-dev',
          strategy: 'mirror',
          delete: 'on',
          // scope: なし → エラーになるべき
        };

        const result = JobConfigSchema.safeParse(input);
        expect(result.success).toBe(false);
        if (!result.success) {
          const messages = result.error.issues.map((i) => i.message);
          expect(messages.some((m) => m.includes('scope'))).toBe(true);
        }
      });

      it('mirror 戦略で gsi を指定した場合はエラー（MIRROR_GSI_NOT_ALLOWED）', () => {
        const input = {
          sourceTable: 'nagiyu-test-prod',
          destTable: 'nagiyu-test-dev',
          strategy: 'mirror',
          scope: { pkPrefix: 'USER#' },
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
        expect(result.success).toBe(false);
        if (!result.success) {
          const messages = result.error.issues.map((i) => i.message);
          expect(messages.some((m) => m.includes('gsi'))).toBe(true);
        }
      });

      it('gsiWindow 戦略で gsi が未指定の場合はエラー（GSI_CONFIG_REQUIRED）', () => {
        const input = {
          sourceTable: 'nagiyu-test-prod',
          destTable: 'nagiyu-test-dev',
          strategy: 'gsiWindow',
          delete: 'off',
          // gsi: なし → エラーになるべき
        };

        const result = JobConfigSchema.safeParse(input);
        expect(result.success).toBe(false);
        if (!result.success) {
          const messages = result.error.issues.map((i) => i.message);
          expect(messages.some((m) => m.includes('gsi'))).toBe(true);
        }
      });

      it('gsiWindow 戦略で delete=on を指定した場合はエラー（GSI_WINDOW_DELETE_NOT_ALLOWED）', () => {
        const input = {
          sourceTable: 'nagiyu-test-prod',
          destTable: 'nagiyu-test-dev',
          strategy: 'gsiWindow',
          delete: 'on', // gsiWindow では禁止
          gsi: {
            indexName: 'GSI1',
            pkAttributeName: 'GSI1PK',
            pkValue: 'ALERT',
            skAttributeName: 'GSI1SK',
            windowDays: 7,
          },
        };

        const result = JobConfigSchema.safeParse(input);
        expect(result.success).toBe(false);
        if (!result.success) {
          const messages = result.error.issues.map((i) => i.message);
          expect(messages.some((m) => m.includes('削除'))).toBe(true);
        }
      });
    });
  });
});
