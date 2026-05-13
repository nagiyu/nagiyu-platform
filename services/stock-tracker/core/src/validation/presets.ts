/**
 * Stock Tracker Core - Validation Presets
 *
 * Stock Tracker 固有のバリデーション値域定義。
 * `isValidNumber(value, min, max)` と組み合わせて利用する。
 */

export const PRICE_RANGE = {
  min: 0.01,
  max: 1_000_000,
} as const;

export const QUANTITY_RANGE = {
  min: 0.0001,
  max: 1_000_000_000,
} as const;
