import type { User } from '@nagiyu/common';

export function omitStripeCustomerId(user: User): User {
  if (user.stripeCustomerId === undefined) {
    return user;
  }
  const view = { ...user };
  delete view.stripeCustomerId;
  return view;
}

/** 権利のメモ (`sourceRef`) は運営者が内部向けに書くことがあるため、本人には返さない */
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
