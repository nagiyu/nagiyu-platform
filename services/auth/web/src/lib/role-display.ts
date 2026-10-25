/**
 * ロールの表示用情報の引き当て。
 *
 * 保存データと API はロール ID のまま扱い、画面に出すときだけ名前と説明に変換する。
 * ROLES に無い ID でも表示が消えないよう、ID をそのまま名前として返す。
 * ID は外部由来の文字列なので、`constructor` のようにプロトタイプが持つ
 * プロパティを拾わないよう自前のキーだけを対象にする。
 */

import { ROLES } from '@nagiyu/common';

/**
 * ロール ID から表示名を返す。
 *
 * @param roleId - ロール ID
 * @returns ROLES に定義された名前。未定義の ID はその ID 自身
 */
export function getRoleName(roleId: string): string {
  if (Object.hasOwn(ROLES, roleId)) {
    return ROLES[roleId as keyof typeof ROLES].name;
  }
  return roleId;
}

/**
 * ロール ID から説明を返す。
 *
 * @param roleId - ロール ID
 * @returns ROLES に定義された説明。未定義の ID は undefined
 */
export function getRoleDescription(roleId: string): string | undefined {
  if (Object.hasOwn(ROLES, roleId)) {
    return ROLES[roleId as keyof typeof ROLES].description;
  }
  return undefined;
}
