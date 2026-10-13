/**
 * `EntityPatch` の値を保存用の属性値に変換する補助関数。
 *
 * patch の値の意味 (`undefined` は変更なし、`null` は削除) を mapper ごとに
 * 書き写すと実装がずれるため、`toUpdateAttributes` ではここを通す。
 */

import { InvalidEntityDataError } from '../errors.js';
import { REMOVE_ATTRIBUTE } from '../helpers.js';

export const PATCH_VALUE_ERROR_MESSAGES = {
  REQUIRED_ATTRIBUTE_REMOVE: '必須項目は削除できません',
  IMMUTABLE_ATTRIBUTE_UPDATE: '作成後に変更できない項目です',
} as const;

/**
 * 必須項目の patch 値を返す。
 *
 * 必須項目を消すと `toEntity` で読めない Item が残るため、`null` は拒否する。
 * `undefined` (変更なし) は呼び出し側が属性を含めない扱いにできるよう、そのまま返す。
 *
 * @param attributeName - エラーメッセージに出す項目名
 * @throws InvalidEntityDataError `value` が `null` のとき
 */
export function requiredPatchValue<T>(
  value: T | null | undefined,
  attributeName: string
): T | undefined {
  if (value === null) {
    throw new InvalidEntityDataError(
      `${PATCH_VALUE_ERROR_MESSAGES.REQUIRED_ATTRIBUTE_REMOVE}: ${attributeName}`
    );
  }
  return value;
}

/**
 * 任意項目の patch 値を返す。`null` は属性の削除を表す `REMOVE_ATTRIBUTE` にする。
 */
export function optionalPatchValue<T>(
  value: T | null | undefined
): T | typeof REMOVE_ATTRIBUTE | undefined {
  return value === null ? REMOVE_ATTRIBUTE : value;
}

/**
 * 作成後に変更できない項目の patch 値を検査する。
 *
 * キーの値を写した属性や作成日時を後から変えると、キーと食い違う Item ができる。
 * 指定された時点で拒否するため、戻り値は常に `undefined` で、変換結果には含めない。
 *
 * @param attributeName - エラーメッセージに出す項目名
 * @throws InvalidEntityDataError `value` が `undefined` 以外のとき (`null` を含む)
 */
export function immutablePatchValue(value: unknown, attributeName: string): undefined {
  if (value !== undefined) {
    throw new InvalidEntityDataError(
      `${PATCH_VALUE_ERROR_MESSAGES.IMMUTABLE_ATTRIBUTE_UPDATE}: ${attributeName}`
    );
  }
  return undefined;
}
