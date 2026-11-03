import { PAID_ROLES, logger } from '@nagiyu/common';
import type { User } from '@nagiyu/common';
import type { UserRepository } from '../repositories';
import type { BillingOperationsStripe, BillingPrice } from './stripe-client';
import { listEntitledSubscriptions } from './sync';

const CHECKOUT_ERROR_MESSAGES = {
  URL_MISSING: 'Checkout Session の URL を取得できませんでした',
} as const;

/** 申し込みの結果 */
export type CheckoutResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'invalid-role' | 'already-subscribed' | 'price-not-found' };

/** 契約の管理の結果 */
export type PortalResult = { ok: true; url: string } | { ok: false; reason: 'no-customer' };

/**
 * ユーザーの Stripe の顧客を得る。なければ作って保存する。
 *
 * 二重作成は `idempotencyKey` で避ける。保存は楽観ロックつきの書き込みに乗せ、
 * 同時に別の顧客 ID が保存されていたときは、上書きせず保存済みのものを採る。
 */
export async function ensureStripeCustomer(
  stripe: BillingOperationsStripe,
  userRepository: UserRepository,
  user: Pick<User, 'userId' | 'email' | 'name' | 'stripeCustomerId'>
): Promise<string> {
  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const created = await stripe.customers.create(
    { email: user.email, name: user.name, metadata: { userId: user.userId } },
    { idempotencyKey: `customer-${user.userId}` }
  );

  let saved = created.id;
  await userRepository.updateRolesAndGrants(user.userId, (latest) => {
    if (latest.stripeCustomerId) {
      saved = latest.stripeCustomerId;
      return {};
    }
    saved = created.id;
    return { stripeCustomerId: created.id };
  });
  if (saved !== created.id) {
    logger.warn('別の顧客 ID が保存済みのため、保存済みのものを使います', {
      userId: user.userId,
      createdCustomerId: created.id,
      savedCustomerId: saved,
    });
  }
  return saved;
}

/**
 * 有料ロールごとの現在の Price を得る。キーはロール ID (Price の lookup_key)。
 */
export async function listPlanPrices(
  stripe: BillingOperationsStripe
): Promise<Map<string, BillingPrice>> {
  const prices = await stripe.prices.list({
    lookup_keys: PAID_ROLES,
    active: true,
    limit: 100,
  });
  const byRole = new Map<string, BillingPrice>();
  for (const price of prices.data) {
    if (price.lookup_key) {
      byRole.set(price.lookup_key, price);
    }
  }
  return byRole;
}

/**
 * 申し込みの Checkout Session を作る。
 *
 * 同じロールを与える契約が既にあるかは、DB ではなく Stripe から取り直して判定する。
 * 通知の遅れで DB が古くても二重に申し込ませないため。
 *
 * @param urls - 決済後の戻り先。呼び出し側で検証済みのものを渡す
 */
export async function createCheckoutSession(
  deps: { stripe: BillingOperationsStripe; userRepository: UserRepository },
  user: Pick<User, 'userId' | 'email' | 'name' | 'stripeCustomerId'>,
  roleId: string,
  urls: { successUrl: string; cancelUrl: string }
): Promise<CheckoutResult> {
  const { stripe, userRepository } = deps;
  if (!PAID_ROLES.includes(roleId)) {
    return { ok: false, reason: 'invalid-role' };
  }

  const customerId = await ensureStripeCustomer(stripe, userRepository, user);

  const entitled = await listEntitledSubscriptions(stripe, customerId);
  if (entitled.some((entry) => entry.roleId === roleId)) {
    return { ok: false, reason: 'already-subscribed' };
  }

  const price = (await listPlanPrices(stripe)).get(roleId);
  if (!price) {
    return { ok: false, reason: 'price-not-found' };
  }

  const metadata = { userId: user.userId, roleId };
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: user.userId,
    line_items: [{ price: price.id, quantity: 1 }],
    metadata,
    subscription_data: { metadata },
    locale: 'ja',
    success_url: urls.successUrl,
    cancel_url: urls.cancelUrl,
  });
  if (!session.url) {
    throw new Error(CHECKOUT_ERROR_MESSAGES.URL_MISSING);
  }
  return { ok: true, url: session.url };
}

/**
 * Customer Portal のセッションを作る。顧客を持たないユーザーには作らない。
 */
export async function createPortalSession(
  stripe: BillingOperationsStripe,
  user: Pick<User, 'stripeCustomerId'>,
  returnUrl: string
): Promise<PortalResult> {
  if (!user.stripeCustomerId) {
    return { ok: false, reason: 'no-customer' };
  }
  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: returnUrl,
  });
  return { ok: true, url: session.url };
}
