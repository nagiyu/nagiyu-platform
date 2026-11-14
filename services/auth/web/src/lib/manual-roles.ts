/**
 * 手動ロールの検証。
 *
 * 有料の段のロールは期限つきの「課金の権利」として付けるもので、手動ロールとは分けて持つ。
 * 手動ロールに入れると期限なしで有効になり、課金の権利の期限管理をすり抜けるため、手動ロールでは付けさせない。
 */

import { PAID_ROLES, VALID_ROLES } from '@nagiyu/common';

/** 手動ロールの検証エラーメッセージ。ロール ID を後ろに付けて問題のロールを示す */
export const MANUAL_ROLE_ERROR_MESSAGES = {
  DUPLICATE_ROLES: 'ロールが重複しています',
  PAID_ROLES_NOT_ALLOWED: '有料ロールは手動ロールでは付けられません。課金の権利から付けてください',
} as const;

/** 手動ロールとして付けられるロール ID (有料の段を除く) */
export const MANUAL_ROLES: string[] = VALID_ROLES.filter((role) => !PAID_ROLES.includes(role));

/** 手動ロールの検証結果 */
export interface ManualRolesValidation {
  /** 2 回以上指定されたロール ID (重複ごとに 1 回だけ) */
  duplicates: string[];
  /** 手動ロールでは付けられない有料のロール ID */
  paidRoles: string[];
}

/**
 * 手動ロールの重複と有料の段のロールを調べる。未知のロールは対象外 (別の検証で断る)。
 *
 * @param roles - 手動ロール ID の配列
 */
export function validateManualRoles(roles: readonly string[]): ManualRolesValidation {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const role of roles) {
    if (seen.has(role)) {
      duplicates.add(role);
    }
    seen.add(role);
  }
  return {
    duplicates: [...duplicates],
    paidRoles: [...seen].filter((role) => PAID_ROLES.includes(role)),
  };
}

/**
 * 検証結果から利用者向けのエラーメッセージを組み立てる。問題がなければ null。
 *
 * @param result - validateManualRoles の結果
 */
export function getManualRolesErrorMessage(result: ManualRolesValidation): string | null {
  if (result.duplicates.length > 0) {
    return `${MANUAL_ROLE_ERROR_MESSAGES.DUPLICATE_ROLES}: ${result.duplicates.join(', ')}`;
  }
  if (result.paidRoles.length > 0) {
    return `${MANUAL_ROLE_ERROR_MESSAGES.PAID_ROLES_NOT_ALLOWED}: ${result.paidRoles.join(', ')}`;
  }
  return null;
}
