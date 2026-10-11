/**
 * アラート条件のリクエストボディからの取り出し
 */

import type { AlertCondition } from '@nagiyu/stock-tracker-core';

/**
 * 値が未指定か null かを判定する
 *
 * UI はパーセンテージの入力が数値にならないとき null を送るため、未指定と同じ扱いにする。
 */
function isAbsent(value: unknown): value is undefined | null {
  return value === undefined || value === null;
}

/**
 * リクエストボディのアラート条件 1 件を、型の保証された AlertCondition に取り出す
 *
 * 想定外の項目は取り込まない。型が不正な場合は null を返す。
 *
 * @param raw - リクエストボディの条件
 * @returns 取り出した条件、不正なら null
 */
export function parseAlertCondition(raw: Record<string, unknown>): AlertCondition | null {
  const { field, operator, value, isPercentage, percentageValue, basePrice } = raw;

  if (field !== 'price') {
    return null;
  }
  if (operator !== 'gte' && operator !== 'lte') {
    return null;
  }
  if (typeof value !== 'number') {
    return null;
  }
  if (!isAbsent(isPercentage) && typeof isPercentage !== 'boolean') {
    return null;
  }
  if (!isAbsent(percentageValue) && typeof percentageValue !== 'number') {
    return null;
  }
  if (!isAbsent(basePrice) && typeof basePrice !== 'number') {
    return null;
  }

  return {
    field,
    operator,
    value,
    ...(isAbsent(isPercentage) ? {} : { isPercentage }),
    ...(isAbsent(percentageValue) ? {} : { percentageValue }),
    ...(isAbsent(basePrice) ? {} : { basePrice }),
  };
}

/**
 * リクエストボディのアラート条件の一覧を AlertCondition の配列に取り出す
 *
 * @param rawList - リクエストボディの条件の一覧
 * @returns 取り出した条件の一覧、1 件でも不正なら null
 */
export function parseAlertConditionList(
  rawList: ReadonlyArray<Record<string, unknown>>
): AlertCondition[] | null {
  const conditions: AlertCondition[] = [];
  for (const raw of rawList) {
    const condition = parseAlertCondition(raw);
    if (condition === null) {
      return null;
    }
    conditions.push(condition);
  }
  return conditions;
}
