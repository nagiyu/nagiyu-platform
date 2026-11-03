import { randomUUID } from 'node:crypto';
import { PAID_ROLES, type RoleGrant, type User } from '@nagiyu/common';

/**
 * 課金の権利の変更依頼
 *
 * 画面の「保存」1 回で、追加・期限延長・取り消しをまとめて送る。
 */
export type GrantChanges = {
  add?: { roleId: string; expiresAt: number; sourceRef?: string }[];
  extend?: { grantId: string; expiresAt: number }[];
  revoke?: string[];
};

/** 権利の変更を適用した結果 (リポジトリの書き換え内容) */
export type AppliedGrantChanges = {
  roles: string[];
  roleGrants: RoleGrant[];
};

export const GRANT_CHANGE_ERROR_MESSAGES = {
  INVALID_GRANT_ROLE: '権利として付けられるのは有料ロールだけです',
  EXPIRES_AT_NOT_FUTURE: '有効期限は現在より後の日時を指定してください',
  GRANT_NOT_FOUND: '対象の権利が見つかりません',
  GRANT_NOT_MANUAL: '手動で付けた権利以外は変更できません',
  GRANT_ALREADY_REVOKED: '取り消し済みの権利は変更できません',
  GRANT_DUPLICATED: '同じ権利に対する変更が重複しています',
} as const;

/**
 * 権利の変更依頼が現在の状態に対して不正なときのエラー。
 *
 * 呼び出し側が 400 に変換できるよう、ほかの例外と区別する。
 */
export class GrantChangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GrantChangeError';
  }
}

/**
 * 手動ロールと権利の変更を、読んだ時点のユーザーに適用する。
 *
 * リポジトリがやり直すたびに呼ばれるため、現在時刻と入力以外に依存しない。
 * 変更の対象は手動で付けた権利に限り、外部サービス由来の権利は同期側だけが書き換える。
 *
 * @param user - 読んだ時点のユーザー
 * @param roles - 新しい手動ロール
 * @param changes - 権利の変更依頼
 * @param grantedBy - 操作した運営者のユーザー ID
 * @param now - 現在時刻 (Unix ミリ秒)
 * @throws GrantChangeError 変更依頼が不正なとき
 */
export function applyGrantChanges(
  user: User,
  roles: string[],
  changes: GrantChanges | undefined,
  grantedBy: string,
  now: number
): AppliedGrantChanges {
  const grants = (user.roleGrants ?? []).map((grant) => ({ ...grant }));
  const touched = new Set<string>();

  const findManualGrant = (grantId: string): RoleGrant => {
    if (touched.has(grantId)) {
      throw new GrantChangeError(GRANT_CHANGE_ERROR_MESSAGES.GRANT_DUPLICATED);
    }
    touched.add(grantId);
    const grant = grants.find((g) => g.grantId === grantId);
    if (!grant) {
      throw new GrantChangeError(GRANT_CHANGE_ERROR_MESSAGES.GRANT_NOT_FOUND);
    }
    if (grant.source !== 'manual') {
      throw new GrantChangeError(GRANT_CHANGE_ERROR_MESSAGES.GRANT_NOT_MANUAL);
    }
    if (grant.revokedAt !== undefined) {
      throw new GrantChangeError(GRANT_CHANGE_ERROR_MESSAGES.GRANT_ALREADY_REVOKED);
    }
    return grant;
  };

  for (const { grantId, expiresAt } of changes?.extend ?? []) {
    const grant = findManualGrant(grantId);
    if (expiresAt <= now) {
      throw new GrantChangeError(GRANT_CHANGE_ERROR_MESSAGES.EXPIRES_AT_NOT_FUTURE);
    }
    grant.expiresAt = expiresAt;
    grant.updatedAt = now;
  }

  for (const grantId of changes?.revoke ?? []) {
    const grant = findManualGrant(grantId);
    grant.revokedAt = now;
    grant.updatedAt = now;
  }

  for (const { roleId, expiresAt, sourceRef } of changes?.add ?? []) {
    if (!PAID_ROLES.includes(roleId)) {
      throw new GrantChangeError(`${GRANT_CHANGE_ERROR_MESSAGES.INVALID_GRANT_ROLE}: ${roleId}`);
    }
    if (expiresAt <= now) {
      throw new GrantChangeError(GRANT_CHANGE_ERROR_MESSAGES.EXPIRES_AT_NOT_FUTURE);
    }
    grants.push({
      grantId: randomUUID(),
      roleId,
      source: 'manual',
      ...(sourceRef !== undefined ? { sourceRef } : {}),
      expiresAt,
      grantedBy,
      createdAt: now,
      updatedAt: now,
    });
  }

  return { roles, roleGrants: grants };
}
