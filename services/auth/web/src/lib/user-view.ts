import type { User } from '@nagiyu/common';

/**
 * API の応答から Stripe の顧客 ID を外す。
 *
 * 顧客 ID を使うのはサーバー内の同期だけで、画面にも運営者にも使い道がないため出さない。
 */
export function omitStripeCustomerId(user: User): User {
  if (user.stripeCustomerId === undefined) {
    return user;
  }
  const view = { ...user };
  delete view.stripeCustomerId;
  return view;
}

/**
 * 本人に返すユーザー情報から、運営者向けの項目を外す。
 *
 * 権利のメモ (`sourceRef`) は運営者が内部向けに書くことがあり、付けた運営者 (`grantedBy`) も本人には要らない。
 * ロール・出どころ・期限・状態は本人にも見せる。
 */
export function toSelfUserView(user: User): User {
  const base = omitStripeCustomerId(user);
  if (base.roleGrants === undefined) {
    return base;
  }
  return {
    ...base,
    roleGrants: base.roleGrants.map((grant) => {
      const view = { ...grant };
      delete view.sourceRef;
      delete view.grantedBy;
      return view;
    }),
  };
}
