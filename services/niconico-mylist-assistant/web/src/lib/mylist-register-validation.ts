import { ERROR_MESSAGES } from './constants/errors';

/** 最大動画数の下限 */
export const MAX_COUNT_MIN = 1;
/** 最大動画数の上限 */
export const MAX_COUNT_MAX = 100;

export type MaxCountValidationResult =
  | { valid: true; value: number }
  | { valid: false; message: string };

/**
 * フォームの最大動画数入力（文字列）を検証する。
 *
 * 入力中は文字列のまま保持し、送信時にだけ確定させるために使う。
 * 文言はサーバー側の検証と揃え、同じ入力が画面とサーバーで同じ理由で拒否されるようにする。
 *
 * @param input 入力欄の文字列
 */
export function validateMaxCountInput(input: string): MaxCountValidationResult {
  const trimmed = input.trim();
  // Number('') は 0 になり範囲外扱いになってしまうため、空欄は整数でないものとして先に弾く
  const value = trimmed === '' ? NaN : Number(trimmed);

  if (!Number.isInteger(value)) {
    return { valid: false, message: ERROR_MESSAGES.MYLIST_REGISTER_MAX_COUNT_MUST_BE_INTEGER };
  }
  if (value < MAX_COUNT_MIN || value > MAX_COUNT_MAX) {
    return { valid: false, message: ERROR_MESSAGES.MYLIST_REGISTER_MAX_COUNT_INVALID_RANGE };
  }
  return { valid: true, value };
}
