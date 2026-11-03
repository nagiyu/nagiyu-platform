import type { RoleGrant, User } from '@nagiyu/common';
import { isRoleGrantActive } from '@nagiyu/common';

export const STRIPE_UNLINK_ERROR_MESSAGES = {
  NOT_LINKED: 'このユーザーは Stripe の顧客と対応していません',
} as const;

/**
 * 対応を外す対象が、対応していないユーザーだったときのエラー。
 *
 * 呼び出し側が 404 に変換できるよう、ほかの例外と区別する。
 */
export class StripeCustomerNotLinkedError extends Error {
  constructor() {
    super(STRIPE_UNLINK_ERROR_MESSAGES.NOT_LINKED);
    this.name = 'StripeCustomerNotLinkedError';
  }
}

/** リポジトリの書き換え内容 */
export type AppliedStripeUnlink = {
  stripeCustomerId: null;
  roleGrants: RoleGrant[];
};

/**
 * Stripe の顧客との対応を外し、Stripe 由来の有効な権利を取り消す内容を作る。
 *
 * 対応が外れると以降の通知で権利を書き換えられなくなる。取り消さずに残すと、解約済みでも期限まで
 * 有料ロールが残り続けるため、同じ書き込みで取り消す。手動の権利には触れない。
 * リポジトリがやり直すたびに呼ばれるため、引数以外に依存しない。
 *
 * @param user - 読んだ時点のユーザー
 * @param now - 現在時刻 (Unix ミリ秒)
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
