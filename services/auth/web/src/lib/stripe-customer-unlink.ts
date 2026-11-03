import type { RoleGrant, User } from '@nagiyu/common';
import { isRoleGrantActive } from '@nagiyu/common';

export const STRIPE_UNLINK_ERROR_MESSAGES = {
  NOT_LINKED: 'このユーザーは Stripe の顧客と対応していません',
} as const;

export class StripeCustomerNotLinkedError extends Error {
  constructor() {
    super(STRIPE_UNLINK_ERROR_MESSAGES.NOT_LINKED);
    this.name = 'StripeCustomerNotLinkedError';
  }
}

export type AppliedStripeUnlink = {
  stripeCustomerId: null;
  roleGrants: RoleGrant[];
};

/**
 * 対応を外し、Stripe 由来の有効な権利を取り消す内容を作る。
 *
 * 対応が外れると以降の通知で権利を書き換えられなくなり、残した権利は期限まで有料ロールを与え続けるため、
 * 同じ書き込みで取り消す。リポジトリがやり直すたびに呼ばれるため、引数以外に依存しない。
 *
 * @throws StripeCustomerNotLinkedError 対応が無いとき
 */
export function buildStripeUnlink(user: User, now: number): AppliedStripeUnlink {
  if (!user.stripeCustomerId) {
    throw new StripeCustomerNotLinkedError();
  }
  const roleGrants = (user.roleGrants ?? []).map((grant) =>
    grant.source === 'stripe' && isRoleGrantActive(grant, now)
      ? { ...grant, revokedAt: now, updatedAt: now }
      : grant
  );
  return { stripeCustomerId: null, roleGrants };
}
