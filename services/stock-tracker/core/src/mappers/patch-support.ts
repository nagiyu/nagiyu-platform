/**
 * Stock Tracker Core - Mapper の update 変換の共通処理
 *
 * `EntityPatch` の値の意味 (undefined は変更なし、null は属性削除) を、
 * 必須項目と任意項目で一箇所に揃える。
 */

import { InvalidEntityDataError, REMOVE_ATTRIBUTE } from '@nagiyu/aws';

const ERROR_MESSAGES = {
  REQUIRED_ATTRIBUTE_REMOVED: '必須項目は削除できません',
} as const;

/**
 * 必須項目の patch 値を保存用の値にする。
 *
 * 必須項目の属性を消すと読み出し時に壊れたデータになるため、null は受け付けない。
 *
 * @param value - patch の値
 * @param attributeName - 保存用の属性名 (エラーメッセージ用)
 * @returns 変更しないなら undefined、変更するなら新しい値
 * @throws InvalidEntityDataError value が null のとき
 */
export function requiredPatchValue<T>(
  value: T | null | undefined,
  attributeName: string
): T | undefined {
  if (value === null) {
    throw new InvalidEntityDataError(
      `${ERROR_MESSAGES.REQUIRED_ATTRIBUTE_REMOVED}: ${attributeName}`
    );
  }
  return value;
}

/**
 * 任意項目の patch 値を保存用の値にする。
 *
 * @param value - patch の値
 * @returns 変更しないなら undefined、削除するなら REMOVE_ATTRIBUTE、それ以外は新しい値
 */
export function optionalPatchValue<T>(
  value: T | null | undefined
): T | typeof REMOVE_ATTRIBUTE | undefined {
  return value === null ? REMOVE_ATTRIBUTE : value;
}
