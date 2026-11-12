import { isRoleGrantActive, type RoleGrant } from '@nagiyu/common';

export type DesiredStripeRole = {
  roleId: string;
  expiresAt: number;
  subscriptionId: string;
};

/**
 * Stripe 由来の権利を、望ましいロールの一覧に合わせた新しい権利の一覧にする。
 *
 * 結果は入力だけで決まる。手動の権利には触れない。変更のない権利は同じオブジェクトのまま返す。
 */
export function computeStripeGrants(
  grants: readonly RoleGrant[],
  desired: readonly DesiredStripeRole[],
  now: number,
  generateId: () => string
): RoleGrant[] {
  const wanted = new Map<string, DesiredStripeRole>();
  for (const entry of desired) {
    if (entry.expiresAt <= now) {
      continue;
    }
    const current = wanted.get(entry.roleId);
    // 期限が同じなら契約 ID の小さい方を採り、入力の順序に結果が左右されないようにする
    if (
      current === undefined ||
      entry.expiresAt > current.expiresAt ||
      (entry.expiresAt === current.expiresAt && entry.subscriptionId < current.subscriptionId)
    ) {
      wanted.set(entry.roleId, entry);
    }
  }

  const handled = new Set<string>();
  const next = grants.map((grant): RoleGrant => {
    const isActiveStripe = grant.source === 'stripe' && isRoleGrantActive(grant, now);
    if (!isActiveStripe) {
      return grant;
    }

    const target = wanted.get(grant.roleId);
    if (target === undefined || handled.has(grant.roleId)) {
      return { ...grant, revokedAt: now, updatedAt: now };
    }
    handled.add(grant.roleId);

    if (grant.expiresAt === target.expiresAt && grant.sourceRef === target.subscriptionId) {
      return grant;
    }
    return {
      ...grant,
      expiresAt: target.expiresAt,
      sourceRef: target.subscriptionId,
      updatedAt: now,
    };
  });

  const created = [...wanted.values()]
    .filter((entry) => !handled.has(entry.roleId))
    .sort((a, b) => (a.roleId < b.roleId ? -1 : 1))
    .map(
      (entry): RoleGrant => ({
        grantId: generateId(),
        roleId: entry.roleId,
        source: 'stripe',
        sourceRef: entry.subscriptionId,
        expiresAt: entry.expiresAt,
        createdAt: now,
        updatedAt: now,
      })
    );

  return [...next, ...created];
}

/** 参照で比べる。{@link computeStripeGrants} は変更のない権利を同じオブジェクトのまま返す */
export function isGrantsUnchanged(
  before: readonly RoleGrant[],
  after: readonly RoleGrant[]
): boolean {
  return before.length === after.length && before.every((grant, i) => grant === after[i]);
}
