/**
 * Stock Tracker Core - Alert Evaluator Service Unit Tests
 *
 * アラート条件評価ロジックのユニットテスト
 */

import {
  evaluateCondition,
  evaluateAlert,
  ERROR_MESSAGES,
} from '../../../src/services/alert-evaluator.js';
import type { Alert, AlertCondition } from '../../../src/types.js';

describe('Alert Evaluator Service', () => {
  describe('evaluateCondition', () => {
    describe('gte (>=) 演算子', () => {
      const condition: AlertCondition = {
        field: 'price',
        operator: 'gte',
        value: 200.0,
      };

      it('現在価格が目標価格より高い場合、true を返す', () => {
        expect(evaluateCondition(condition, 250.0)).toBe(true);
      });

      it('現在価格が目標価格と等しい場合、true を返す（境界値テスト）', () => {
        expect(evaluateCondition(condition, 200.0)).toBe(true);
      });

      it('現在価格が目標価格より低い場合、false を返す', () => {
        expect(evaluateCondition(condition, 150.0)).toBe(false);
      });

      it('境界値のすぐ上（200.01）の場合、true を返す', () => {
        expect(evaluateCondition(condition, 200.01)).toBe(true);
      });

      it('境界値のすぐ下（199.99）の場合、false を返す', () => {
        expect(evaluateCondition(condition, 199.99)).toBe(false);
      });
    });

    describe('lte (<=) 演算子', () => {
      const condition: AlertCondition = {
        field: 'price',
        operator: 'lte',
        value: 150.0,
      };

      it('現在価格が目標価格より低い場合、true を返す', () => {
        expect(evaluateCondition(condition, 100.0)).toBe(true);
      });

      it('現在価格が目標価格と等しい場合、true を返す（境界値テスト）', () => {
        expect(evaluateCondition(condition, 150.0)).toBe(true);
      });

      it('現在価格が目標価格より高い場合、false を返す', () => {
        expect(evaluateCondition(condition, 200.0)).toBe(false);
      });

      it('境界値のすぐ下（149.99）の場合、true を返す', () => {
        expect(evaluateCondition(condition, 149.99)).toBe(true);
      });

      it('境界値のすぐ上（150.01）の場合、false を返す', () => {
        expect(evaluateCondition(condition, 150.01)).toBe(false);
      });
    });

    describe('エッジケース', () => {
      it('価格が 0 の場合、正しく評価される (gte)', () => {
        const condition: AlertCondition = {
          field: 'price',
          operator: 'gte',
          value: 0,
        };
        expect(evaluateCondition(condition, 0)).toBe(true);
        expect(evaluateCondition(condition, -1)).toBe(false);
        expect(evaluateCondition(condition, 1)).toBe(true);
      });

      it('価格が 0 の場合、正しく評価される (lte)', () => {
        const condition: AlertCondition = {
          field: 'price',
          operator: 'lte',
          value: 0,
        };
        expect(evaluateCondition(condition, 0)).toBe(true);
        expect(evaluateCondition(condition, -1)).toBe(true);
        expect(evaluateCondition(condition, 1)).toBe(false);
      });

      it('負の値の場合、正しく評価される (gte)', () => {
        const condition: AlertCondition = {
          field: 'price',
          operator: 'gte',
          value: -10.0,
        };
        expect(evaluateCondition(condition, -5.0)).toBe(true);
        expect(evaluateCondition(condition, -10.0)).toBe(true);
        expect(evaluateCondition(condition, -15.0)).toBe(false);
      });

      it('負の値の場合、正しく評価される (lte)', () => {
        const condition: AlertCondition = {
          field: 'price',
          operator: 'lte',
          value: -10.0,
        };
        expect(evaluateCondition(condition, -15.0)).toBe(true);
        expect(evaluateCondition(condition, -10.0)).toBe(true);
        expect(evaluateCondition(condition, -5.0)).toBe(false);
      });

      it('極端に大きい値の場合、正しく評価される (gte)', () => {
        const condition: AlertCondition = {
          field: 'price',
          operator: 'gte',
          value: 1000000,
        };
        expect(evaluateCondition(condition, 1000000)).toBe(true);
        expect(evaluateCondition(condition, 1000001)).toBe(true);
        expect(evaluateCondition(condition, 999999)).toBe(false);
      });

      it('極端に大きい値の場合、正しく評価される (lte)', () => {
        const condition: AlertCondition = {
          field: 'price',
          operator: 'lte',
          value: 1000000,
        };
        expect(evaluateCondition(condition, 999999)).toBe(true);
        expect(evaluateCondition(condition, 1000000)).toBe(true);
        expect(evaluateCondition(condition, 1000001)).toBe(false);
      });

      it('小数点以下の精度が正しく扱われる', () => {
        const condition: AlertCondition = {
          field: 'price',
          operator: 'gte',
          value: 100.12345,
        };
        expect(evaluateCondition(condition, 100.12344)).toBe(false);
        expect(evaluateCondition(condition, 100.12345)).toBe(true);
        expect(evaluateCondition(condition, 100.12346)).toBe(true);
      });
    });

    describe('エラーハンドリング', () => {
      it('無効なフィールドの場合、エラーをスローする', () => {
        const condition = {
          field: 'volume',
          operator: 'gte',
          value: 100,
        } as unknown as AlertCondition;

        expect(() => evaluateCondition(condition, 150.0)).toThrow(ERROR_MESSAGES.INVALID_FIELD);
      });

      it('無効な演算子の場合、エラーをスローする', () => {
        const condition = {
          field: 'price',
          operator: 'eq',
          value: 100,
        } as unknown as AlertCondition;

        expect(() => evaluateCondition(condition, 150.0)).toThrow(ERROR_MESSAGES.INVALID_OPERATOR);
      });

      it('現在価格が NaN の場合、エラーをスローする', () => {
        const condition: AlertCondition = {
          field: 'price',
          operator: 'gte',
          value: 100,
        };

        expect(() => evaluateCondition(condition, NaN)).toThrow(ERROR_MESSAGES.INVALID_PRICE);
      });

      it('現在価格が数値でない場合、エラーをスローする', () => {
        const condition: AlertCondition = {
          field: 'price',
          operator: 'gte',
          value: 100,
        };

        expect(() => evaluateCondition(condition, '150' as unknown as number)).toThrow(
          ERROR_MESSAGES.INVALID_PRICE
        );
      });
    });
  });

  describe('evaluateAlert', () => {
    const createMockAlert = (operator: 'gte' | 'lte', value: number): Alert => ({
      AlertID: 'test-alert-id',
      UserID: 'user-123',
      TickerID: 'NSDQ:AAPL',
      ExchangeID: 'NASDAQ',
      // Mode と operator の対応: gte (>=) は売りアラート、lte (<=) は買いアラート
      Mode: operator === 'gte' ? 'Sell' : 'Buy',
      Frequency: 'MINUTE_LEVEL',
      Enabled: true,
      ConditionList: [
        {
          field: 'price',
          operator: operator,
          value: value,
        },
      ],
      SubscriptionEndpoint: 'https://example.com/push',
      SubscriptionKeysP256dh: 'test-p256dh-key',
      SubscriptionKeysAuth: 'test-auth-key',
      CreatedAt: Date.now(),
      UpdatedAt: Date.now(),
    });

    it('売りアラート (gte): 条件を満たす場合、true を返す', () => {
      const alert = createMockAlert('gte', 200.0);
      expect(evaluateAlert(alert, 205.0)).toBe(true);
    });

    it('売りアラート (gte): 条件を満たさない場合、false を返す', () => {
      const alert = createMockAlert('gte', 200.0);
      expect(evaluateAlert(alert, 195.0)).toBe(false);
    });

    it('買いアラート (lte): 条件を満たす場合、true を返す', () => {
      const alert = createMockAlert('lte', 150.0);
      expect(evaluateAlert(alert, 145.0)).toBe(true);
    });

    it('買いアラート (lte): 条件を満たさない場合、false を返す', () => {
      const alert = createMockAlert('lte', 150.0);
      expect(evaluateAlert(alert, 155.0)).toBe(false);
    });

    it('境界値: 売りアラート (gte) で価格が等しい場合、true を返す', () => {
      const alert = createMockAlert('gte', 200.0);
      expect(evaluateAlert(alert, 200.0)).toBe(true);
    });

    it('境界値: 買いアラート (lte) で価格が等しい場合、true を返す', () => {
      const alert = createMockAlert('lte', 150.0);
      expect(evaluateAlert(alert, 150.0)).toBe(true);
    });

    describe('複数条件 AND 評価（範囲内）', () => {
      const createAndAlert = (minValue: number, maxValue: number): Alert => ({
        AlertID: 'test-alert-and',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [
          {
            field: 'price',
            operator: 'gte',
            value: minValue,
          },
          {
            field: 'price',
            operator: 'lte',
            value: maxValue,
          },
        ],
        LogicalOperator: 'AND',
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'test-p256dh-key',
        SubscriptionKeysAuth: 'test-auth-key',
        CreatedAt: Date.now(),
        UpdatedAt: Date.now(),
      });

      it('範囲内の価格の場合、true を返す', () => {
        const alert = createAndAlert(100.0, 200.0);
        expect(evaluateAlert(alert, 150.0)).toBe(true);
      });

      it('範囲外（下限未満）の価格の場合、false を返す', () => {
        const alert = createAndAlert(100.0, 200.0);
        expect(evaluateAlert(alert, 95.0)).toBe(false);
      });

      it('範囲外（上限超過）の価格の場合、false を返す', () => {
        const alert = createAndAlert(100.0, 200.0);
        expect(evaluateAlert(alert, 205.0)).toBe(false);
      });

      it('境界値: 下限ちょうどの場合、true を返す', () => {
        const alert = createAndAlert(100.0, 200.0);
        expect(evaluateAlert(alert, 100.0)).toBe(true);
      });

      it('境界値: 上限ちょうどの場合、true を返す', () => {
        const alert = createAndAlert(100.0, 200.0);
        expect(evaluateAlert(alert, 200.0)).toBe(true);
      });

      it('境界値: 下限のすぐ下（99.99）の場合、false を返す', () => {
        const alert = createAndAlert(100.0, 200.0);
        expect(evaluateAlert(alert, 99.99)).toBe(false);
      });

      it('境界値: 上限のすぐ上（200.01）の場合、false を返す', () => {
        const alert = createAndAlert(100.0, 200.0);
        expect(evaluateAlert(alert, 200.01)).toBe(false);
      });
    });

    describe('複数条件 OR 評価（範囲外）', () => {
      const createOrAlert = (lowerBound: number, upperBound: number): Alert => ({
        AlertID: 'test-alert-or',
        UserID: 'user-123',
        TickerID: 'NSDQ:AAPL',
        ExchangeID: 'NASDAQ',
        Mode: 'Sell',
        Frequency: 'MINUTE_LEVEL',
        Enabled: true,
        ConditionList: [
          {
            field: 'price',
            operator: 'lte',
            value: lowerBound,
          },
          {
            field: 'price',
            operator: 'gte',
            value: upperBound,
          },
        ],
        LogicalOperator: 'OR',
        SubscriptionEndpoint: 'https://example.com/push',
        SubscriptionKeysP256dh: 'test-p256dh-key',
        SubscriptionKeysAuth: 'test-auth-key',
        CreatedAt: Date.now(),
        UpdatedAt: Date.now(),
      });

      it('下限以下の価格の場合、true を返す', () => {
        const alert = createOrAlert(90.0, 120.0);
        expect(evaluateAlert(alert, 85.0)).toBe(true);
      });

      it('上限以上の価格の場合、true を返す', () => {
        const alert = createOrAlert(90.0, 120.0);
        expect(evaluateAlert(alert, 125.0)).toBe(true);
      });

      it('範囲内の価格の場合、false を返す', () => {
        const alert = createOrAlert(90.0, 120.0);
        expect(evaluateAlert(alert, 100.0)).toBe(false);
      });

      it('境界値: 下限ちょうどの場合、true を返す', () => {
        const alert = createOrAlert(90.0, 120.0);
        expect(evaluateAlert(alert, 90.0)).toBe(true);
      });

      it('境界値: 上限ちょうどの場合、true を返す', () => {
        const alert = createOrAlert(90.0, 120.0);
        expect(evaluateAlert(alert, 120.0)).toBe(true);
      });

      it('境界値: 下限のすぐ上（90.01）の場合、false を返す', () => {
        const alert = createOrAlert(90.0, 120.0);
        expect(evaluateAlert(alert, 90.01)).toBe(false);
      });

      it('境界値: 上限のすぐ下（119.99）の場合、false を返す', () => {
        const alert = createOrAlert(90.0, 120.0);
        expect(evaluateAlert(alert, 119.99)).toBe(false);
      });
    });

    describe('後方互換性', () => {
      it('単一条件（gte）の場合、従来通り動作する', () => {
        const alert = createMockAlert('gte', 200.0);
        expect(evaluateAlert(alert, 205.0)).toBe(true);
        expect(evaluateAlert(alert, 195.0)).toBe(false);
      });

      it('単一条件（lte）の場合、従来通り動作する', () => {
        const alert = createMockAlert('lte', 150.0);
        expect(evaluateAlert(alert, 145.0)).toBe(true);
        expect(evaluateAlert(alert, 155.0)).toBe(false);
      });

      it('複数条件があるが LogicalOperator が未指定の場合、AND として評価される', () => {
        const alert: Alert = {
          ...createMockAlert('gte', 100.0),
          ConditionList: [
            {
              field: 'price',
              operator: 'gte',
              value: 100.0,
            },
            {
              field: 'price',
              operator: 'lte',
              value: 200.0,
            },
          ],
          // LogicalOperator は未指定（デフォルトは AND）
        };

        expect(evaluateAlert(alert, 150.0)).toBe(true); // 範囲内
        expect(evaluateAlert(alert, 95.0)).toBe(false); // 範囲外（下限未満）
        expect(evaluateAlert(alert, 205.0)).toBe(false); // 範囲外（上限超過）
      });
    });

    describe('エラーハンドリング', () => {
      it('ConditionList が空の場合、エラーをスローする', () => {
        const alert: Alert = {
          ...createMockAlert('gte', 200.0),
          ConditionList: [],
        };

        expect(() => evaluateAlert(alert, 205.0)).toThrow(ERROR_MESSAGES.EMPTY_CONDITION_LIST);
      });

      it('ConditionList が undefined の場合、エラーをスローする', () => {
        const alert = {
          ...createMockAlert('gte', 200.0),
          ConditionList: undefined,
        } as unknown as Alert;

        expect(() => evaluateAlert(alert, 205.0)).toThrow(ERROR_MESSAGES.EMPTY_CONDITION_LIST);
      });

      it('無効な条件が含まれる場合、evaluateCondition のエラーが伝播する', () => {
        const alert: Alert = {
          ...createMockAlert('gte', 200.0),
          ConditionList: [
            {
              field: 'volume',
              operator: 'gte',
              value: 100,
            } as unknown as AlertCondition,
          ],
        };

        expect(() => evaluateAlert(alert, 205.0)).toThrow(ERROR_MESSAGES.INVALID_FIELD);
      });

      it('無効な LogicalOperator の場合、エラーをスローする', () => {
        const alert: Alert = {
          ...createMockAlert('gte', 200.0),
          ConditionList: [
            {
              field: 'price',
              operator: 'gte',
              value: 100.0,
            },
            {
              field: 'price',
              operator: 'lte',
              value: 200.0,
            },
          ],
          LogicalOperator: 'INVALID' as 'AND' | 'OR',
        };

        expect(() => evaluateAlert(alert, 150.0)).toThrow(ERROR_MESSAGES.INVALID_LOGICAL_OPERATOR);
      });
    });
  });
});
