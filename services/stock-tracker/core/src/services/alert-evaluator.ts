/**
 * Stock Tracker Core - Alert Evaluator Service
 *
 * アラート条件を評価するビジネスロジック
 *
 * Phase 1 仕様:
 * - ConditionList[0] のみ評価（複数条件は Phase 2）
 * - operator は `gte` (>=) と `lte` (<=) のみ対応
 * - field は `price` 固定
 */

import type { Alert, AlertCondition } from '../types.js';

/**
 * エラーメッセージ定数
 */
export const ERROR_MESSAGES = {
  INVALID_OPERATOR: '無効な演算子です。Phase 1 では "gte" または "lte" のみサポートされています',
  INVALID_FIELD: '無効なフィールドです。Phase 1 では "price" のみサポートされています',
  EMPTY_CONDITION_LIST: 'ConditionList が空です',
  INVALID_PRICE: '無効な価格です。価格は数値である必要があります',
  INVALID_LOGICAL_OPERATOR: '無効な LogicalOperator です',
} as const;

/**
 * 単一条件の評価
 *
 * @param condition - 評価するアラート条件
 * @param currentPrice - 現在の株価
 * @returns 条件を満たす場合は true、満たさない場合は false
 * @throws Error - 無効な演算子またはフィールドの場合
 *
 * @example
 * // 買いアラート: 現在価格が目標価格以下の場合
 * evaluateCondition({ field: 'price', operator: 'lte', value: 150.00 }, 145.00) // => true
 * evaluateCondition({ field: 'price', operator: 'lte', value: 150.00 }, 155.00) // => false
 *
 * // 売りアラート: 現在価格が目標価格以上の場合
 * evaluateCondition({ field: 'price', operator: 'gte', value: 200.00 }, 205.00) // => true
 * evaluateCondition({ field: 'price', operator: 'gte', value: 200.00 }, 195.00) // => false
 */
export function evaluateCondition(condition: AlertCondition, currentPrice: number): boolean {
  // 価格の妥当性チェック
  if (typeof currentPrice !== 'number' || isNaN(currentPrice)) {
    throw new Error(ERROR_MESSAGES.INVALID_PRICE);
  }

  // フィールドのチェック（Phase 1 は price 固定）
  if (condition.field !== 'price') {
    throw new Error(ERROR_MESSAGES.INVALID_FIELD);
  }

  // 演算子による条件評価
  switch (condition.operator) {
    case 'gte':
      // >= (以上): 現在価格が目標価格以上の場合
      return currentPrice >= condition.value;

    case 'lte':
      // <= (以下): 現在価格が目標価格以下の場合
      return currentPrice <= condition.value;

    default:
      throw new Error(ERROR_MESSAGES.INVALID_OPERATOR);
  }
}

/**
 * アラート全体の評価
 *
 * 単一条件または複数条件（AND/OR）を評価します。
 *
 * @param alert - 評価するアラート設定
 * @param currentPrice - 現在の株価
 * @returns 条件を満たす場合は true、満たさない場合は false
 * @throws Error - ConditionList が空の場合
 *
 * @example
 * // 単一条件
 * const alert: Alert = {
 *   AlertID: 'alert-1',
 *   UserID: 'user-123',
 *   TickerID: 'NSDQ:AAPL',
 *   ExchangeID: 'NASDAQ',
 *   Mode: 'Sell',
 *   Frequency: 'MINUTE_LEVEL',
 *   Enabled: true,
 *   ConditionList: [{ field: 'price', operator: 'gte', value: 200.00 }],
 *   SubscriptionEndpoint: 'https://example.com/push',
 *   SubscriptionKeysP256dh: 'key',
 *   SubscriptionKeysAuth: 'auth',
 *   CreatedAt: Date.now(),
 *   UpdatedAt: Date.now(),
 * };
 *
 * evaluateAlert(alert, 205.00) // => true
 * evaluateAlert(alert, 195.00) // => false
 *
 * @example
 * // 複数条件（AND - 範囲内）
 * const alertAnd: Alert = {
 *   ...alert,
 *   ConditionList: [
 *     { field: 'price', operator: 'gte', value: 100.00 },
 *     { field: 'price', operator: 'lte', value: 200.00 }
 *   ],
 *   LogicalOperator: 'AND',
 * };
 *
 * evaluateAlert(alertAnd, 150.00) // => true (100 <= 150 <= 200)
 * evaluateAlert(alertAnd, 250.00) // => false (250 > 200)
 *
 * @example
 * // 複数条件（OR - 範囲外）
 * const alertOr: Alert = {
 *   ...alert,
 *   ConditionList: [
 *     { field: 'price', operator: 'lte', value: 90.00 },
 *     { field: 'price', operator: 'gte', value: 120.00 }
 *   ],
 *   LogicalOperator: 'OR',
 * };
 *
 * evaluateAlert(alertOr, 85.00) // => true (85 <= 90)
 * evaluateAlert(alertOr, 125.00) // => true (125 >= 120)
 * evaluateAlert(alertOr, 100.00) // => false (90 < 100 < 120)
 */
export function evaluateAlert(alert: Alert, currentPrice: number): boolean {
  // ConditionList の存在チェック
  if (!alert.ConditionList || alert.ConditionList.length === 0) {
    throw new Error(ERROR_MESSAGES.EMPTY_CONDITION_LIST);
  }

  // 単一条件の場合
  if (alert.ConditionList.length === 1) {
    return evaluateCondition(alert.ConditionList[0], currentPrice);
  }

  // 複数条件の場合
  const logicalOp = alert.LogicalOperator || 'AND';

  if (logicalOp === 'AND') {
    // 範囲内: すべての条件を満たす必要がある
    return alert.ConditionList.every((condition) => evaluateCondition(condition, currentPrice));
  } else if (logicalOp === 'OR') {
    // 範囲外: いずれかの条件を満たせば発火
    return alert.ConditionList.some((condition) => evaluateCondition(condition, currentPrice));
  } else {
    throw new Error(ERROR_MESSAGES.INVALID_LOGICAL_OPERATOR);
  }
}
