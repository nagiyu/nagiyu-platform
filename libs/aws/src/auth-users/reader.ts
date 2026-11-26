/**
 * auth ユーザーのロールの出どころを読むための interface
 */

import type { RoleGrant } from '@nagiyu/common';

/** ユーザーの手動ロールと課金などの権利。個人情報は含まない */
export type AuthUserRoleSources = {
  /** 手動で付けたロール */
  roles: string[];
  /** 課金などで付いた権利。属性がなければ空配列 */
  roleGrants: RoleGrant[];
};

/**
 * auth のユーザーテーブルから、ロールの元になる値だけを読む reader。
 *
 * 読み取り専用で、メールや名前などの個人情報は読まない。
 */
export interface AuthUserRoleSourceReader {
  /**
   * ユーザーのロールの出どころを取得する。
   *
   * @param userId - auth のユーザー ID
   * @returns ロールの出どころ。ユーザーがいなければ null
   */
  getRoleSources(userId: string): Promise<AuthUserRoleSources | null>;
}
