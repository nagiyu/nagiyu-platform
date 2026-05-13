/**
 * Stock Tracker Core - Validation Helpers
 *
 * Stock Tracker 固有のバリデーション用ヘルパー関数。
 * 値域は presets.ts に切り出し、汎用 `isValidNumber` に委譲する。
 */

import { isValidNumber } from '@nagiyu/common';
import { PRICE_RANGE, QUANTITY_RANGE } from './presets.js';

/**
 * 価格が有効な範囲内かチェック
 * @param price - 価格
 * @returns 有効な場合は true
 */
export function isValidPrice(price: number): boolean {
  return isValidNumber(price, PRICE_RANGE.min, PRICE_RANGE.max);
}

/**
 * 数量が有効な範囲内かチェック
 * @param quantity - 数量
 * @returns 有効な場合は true
 */
export function isValidQuantity(quantity: number): boolean {
  return isValidNumber(quantity, QUANTITY_RANGE.min, QUANTITY_RANGE.max);
}
