/**
 * 課金の権利 (RoleGrant) の型と、有効なロールの算出
 *
 * 手動で付けたロールとは別に、出どころと有効期限を持つ権利としてロールを持つ。
 * 期限の判定は呼び出し側が渡す `now` だけに依存させ、ライブラリ内で現在時刻を読まない。
 */

/**
 * 権利の出どころ。
 *
 * 出どころを増やすときはここに足す。型はこの配列から導く。
 */
export const ROLE_GRANT_SOURCES = ['manual', 'stripe'] as const;

/** 権利の出どころ */
export type RoleGrantSource = (typeof ROLE_GRANT_SOURCES)[number];

/**
 * 課金の権利
 *
 * 持ち主のユーザーは、権利を保持する User の項目で決まるため、権利自体には持たせない。
 */
export interface RoleGrant {
  /** 権利の ID (UUID v4) */
  grantId: string;
  /** 付与するロールの ID (ROLES のキー) */
  roleId: string;
  /** 出どころ */
  source: RoleGrantSource;
  /** 出どころ側の参照 (手動ならメモ、Stripe なら顧客 ID など) */
  sourceRef?: string;
  /** 有効期限 (Unix ミリ秒)。この時刻を過ぎると無効。手動では必須 */
  expiresAt?: number;
  /** 取り消した時刻 (Unix ミリ秒)。取り消した権利も経緯のために残す */
  revokedAt?: number;
  /** 手動で付けた運営者のユーザー ID */
  grantedBy?: string;
  /** 作成時刻 (Unix ミリ秒) */
  createdAt: number;
  /** 更新時刻 (Unix ミリ秒) */
  updatedAt: number;
}

/** 権利の状態 */
export type RoleGrantStatus = 'active' | 'expired' | 'revoked';

/**
 * 権利の状態を判定する。
 *
 * 取り消しは期限より優先する。取り消し済みで期限も過ぎた権利は「取り消し」と表示したい。
 */
export function getRoleGrantStatus(grant: RoleGrant, now: number): RoleGrantStatus {
  if (grant.revokedAt !== undefined) {
    return 'revoked';
  }
  if (grant.expiresAt !== undefined && grant.expiresAt <= now) {
    return 'expired';
  }
  return 'active';
}

/**
 * 権利が有効かを判定する。
 *
 * 有効 = 取り消されておらず、期限がないか `now` より後。期限ちょうどの時刻は無効とする。
 */
export function isRoleGrantActive(grant: RoleGrant, now: number): boolean {
  return getRoleGrantStatus(grant, now) === 'active';
}

/**
 * 有効なロールを算出する。
 *
 * 手動ロールと有効な権利のロールを合わせ、重複を除く。順序は手動ロール、権利の順。
 *
 * @param roles - 手動で付けたロール
 * @param grants - 課金の権利 (無効なものを含んでよい)
 * @param now - 判定時刻 (Unix ミリ秒)
 */
export function getEffectiveRoles(
  roles: readonly string[],
  grants: readonly RoleGrant[],
  now: number
): string[] {
  const effective = new Set<string>(roles);
  for (const grant of grants) {
    if (isRoleGrantActive(grant, now)) {
      effective.add(grant.roleId);
    }
  }
  return [...effective];
}
