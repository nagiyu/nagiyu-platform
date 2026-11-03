import type { RoleGrant } from '@nagiyu/common';

/** Stripe の契約から得た、付けるべきロールと期限 */
export type DesiredStripeRole = {
  roleId: string;
  /** 期限 (Unix ミリ秒) */
  expiresAt: number;
  /** 契約 ID。権利の `sourceRef` に入れる */
  subscriptionId: string;
};

/**
 * Stripe 由来の権利を、望ましいロールの一覧に合わせた新しい権利の一覧にする。
 *
 * 副作用を持たず、同じ入力には同じ結果を返す。通知が重複しても順序が入れ替わっても、
 * Stripe から取り直した状態が同じなら権利の一覧も同じになる。
 *
 * - 手動の権利には触れない。同じロールに手動と Stripe の権利が並んでもよい
 * - 同じロールを複数の契約が与えるときは、期限が最も遅いものを採る
 * - 有効な Stripe 由来の権利は、期限か参照が違うときだけ更新し、変わらなければ `updatedAt` も変えない
 * - 望ましいロールにない有効な Stripe 由来の権利は取り消す。期限切れのものは何もしない
 * - 同じロールに有効な Stripe 由来の権利が複数あれば、先頭だけ残して余りを取り消す
 *
 * @param grants - 現在の権利 (無効なものを含む)
 * @param desired - Stripe から得た望ましいロールと期限
 * @param now - 判定時刻 (Unix ミリ秒)
 * @param generateId - 新しい権利の ID の生成。純粋さを保つため呼び出し側から受け取る
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
    const isActiveStripe =
      grant.source === 'stripe' &&
      grant.revokedAt === undefined &&
      (grant.expiresAt === undefined || grant.expiresAt > now);
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
    .map((entry): RoleGrant => ({
      grantId: generateId(),
      roleId: entry.roleId,
      source: 'stripe',
      sourceRef: entry.subscriptionId,
      expiresAt: entry.expiresAt,
      createdAt: now,
      updatedAt: now,
    }));

  return [...next, ...created];
}

/**
 * 権利の一覧に変更がないかを判定する。変わらなければ書き込みを省くために使う。
 *
 * {@link computeStripeGrants} は変更のない権利を同じオブジェクトのまま返すので、参照で比べる。
 */
export function isGrantsUnchanged(
  before: readonly RoleGrant[],
  after: readonly RoleGrant[]
): boolean {
  return before.length === after.length && before.every((grant, i) => grant === after[i]);
}
