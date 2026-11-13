import { PAID_ROLES, compareBillingTier, getBillingServiceId, logger } from '@nagiyu/common';
import type { User } from '@nagiyu/common';
import type { UserRepository } from '../repositories';
import type { BillingOperationsStripe, BillingPrice } from './stripe-client';
import { listEntitledSubscriptions, type EntitledSubscription } from './sync';

const CHECKOUT_ERROR_MESSAGES = {
  URL_MISSING: 'Checkout Session の URL を取得できませんでした',
  SCHEDULE_PHASE_MISSING: '作成した予約の現在の期間を取得できませんでした',
} as const;

export type CheckoutResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'invalid-role' | 'already-subscribed-in-service' | 'price-not-found' };

export type PortalResult = { ok: true; url: string } | { ok: false; reason: 'no-customer' };

/** 同時に別の顧客 ID が保存されていたときは、上書きせず保存済みのものを採る */
export async function ensureStripeCustomer(
  stripe: BillingOperationsStripe,
  userRepository: UserRepository,
  user: Pick<User, 'userId' | 'email' | 'name' | 'stripeCustomerId' | 'updatedAt'>
): Promise<string> {
  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const created = await stripe.customers.create(
    { email: user.email, name: user.name, metadata: { userId: user.userId } },
    // 同時の申し込みは同じ鍵にして二重作成を防ぐ。対応を外した後は更新時刻が変わるので、前の顧客が返らない
    { idempotencyKey: `customer-${user.userId}-${user.updatedAt}` }
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

/** キーはロール ID (Price の lookup_key) */
export async function listPlanPrices(
  stripe: BillingOperationsStripe
): Promise<Map<string, BillingPrice>> {
  const prices = await stripe.prices.list({
    lookup_keys: PAID_ROLES,
    active: true,
    limit: 100,
    expand: ['data.product'],
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
 * 既存の契約は、通知の遅れで DB が古くても二重に申し込ませないよう、Stripe から取り直して判定する。
 *
 * @param urls - 呼び出し側で検証済みのものを渡す
 */
export async function createCheckoutSession(
  deps: { stripe: BillingOperationsStripe; userRepository: UserRepository },
  user: Pick<User, 'userId' | 'email' | 'name' | 'stripeCustomerId' | 'updatedAt'>,
  roleId: string,
  urls: { successUrl: string; cancelUrl: string }
): Promise<CheckoutResult> {
  const { stripe, userRepository } = deps;
  if (!PAID_ROLES.includes(roleId)) {
    return { ok: false, reason: 'invalid-role' };
  }

  const customerId = await ensureStripeCustomer(stripe, userRepository, user);

  const entitled = await listEntitledSubscriptions(stripe, customerId);
  // 段の変更は申し込みではなくプランの画面での切り替えで行うため、同じサービスの契約は段を問わず断る
  const serviceId = getBillingServiceId(roleId);
  if (entitled.some((entry) => getBillingServiceId(entry.roleId) === serviceId)) {
    return { ok: false, reason: 'already-subscribed-in-service' };
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

/** Auth が作った予約の印。取り消しや後始末で、Auth 以外が作った予約と見分けるのに使う */
export const AUTH_SCHEDULE_METADATA = { createdBy: 'nagiyu-auth' } as const;

export type PlanChangeResult =
  /** 上げ: Customer Portal の確認画面へ送る */
  | { ok: true; kind: 'portal'; url: string }
  /** 下げ: 請求期間の終わりに切り替わる予約を作った。`startsAt` は Unix ミリ秒 */
  | { ok: true; kind: 'scheduled'; startsAt: number }
  | {
      ok: false;
      reason:
        | 'invalid-role'
        | 'not-subscribed'
        | 'same-plan'
        | 'canceling'
        | 'payment-past-due'
        | 'change-scheduled'
        | 'price-not-found';
    };

export type CancelScheduledChangeResult =
  { ok: true } | { ok: false; reason: 'no-scheduled-change' };

/**
 * 今の請求期間の終わりに下の段の価格へ切り替わる予約を作る。
 *
 * 予約の作成直後の phase は今の段のまま 1 つだけなので、それを期末までに縮めて下の段の phase を足す。
 * 更新に失敗した予約は、契約に付いたまま残ると以後の変更を断るため release して元に戻す。
 */
async function scheduleDowngrade(
  stripe: BillingOperationsStripe,
  current: EntitledSubscription,
  price: BillingPrice
): Promise<PlanChangeResult> {
  if (!price.recurring) {
    return { ok: false, reason: 'price-not-found' };
  }

  const schedule = await stripe.subscriptionSchedules.create({
    from_subscription: current.subscriptionId,
  });
  const periodEnd = current.currentPeriodEnd / 1000;
  const currentPhase = schedule.phases[0];

  try {
    if (!currentPhase) {
      throw new Error(CHECKOUT_ERROR_MESSAGES.SCHEDULE_PHASE_MISSING);
    }
    await stripe.subscriptionSchedules.update(schedule.id, {
      phases: [
        {
          start_date: currentPhase.start_date,
          end_date: periodEnd,
          items: currentPhase.items.map((item) => ({
            price: typeof item.price === 'string' ? item.price : item.price.id,
            quantity: item.quantity ?? 1,
          })),
          proration_behavior: 'none',
        },
        {
          // Customer Portal が下げで作る予約と同じ形にそろえるため、終わりは指定しない。
          // 指定しなくても Stripe が 1 請求期間の終わりを入れ、切り替わった後もその間は予約が残る
          items: [{ price: price.id, quantity: 1 }],
          proration_behavior: 'none',
        },
      ],
      end_behavior: 'release',
      proration_behavior: 'none',
      metadata: AUTH_SCHEDULE_METADATA,
    });
  } catch (error) {
    await stripe.subscriptionSchedules.release(schedule.id).catch((releaseError: unknown) => {
      logger.error('下げの予約の巻き戻しに失敗しました', {
        scheduleId: schedule.id,
        error: releaseError instanceof Error ? releaseError.message : String(releaseError),
      });
    });
    throw error;
  }
  return { ok: true, kind: 'scheduled', startsAt: current.currentPeriodEnd };
}

/**
 * 同じサービスの中で段を切り替える。
 *
 * 上げは Customer Portal の確認画面の URL を返す。日割りと支払いの扱いは Portal の設定で決まるため、ここでは指定しない。
 * 下げは Portal では期末に予約できないため、Subscription Schedule を作って請求期間の終わりに切り替える。返金や日割りのクレジットは出さない。
 * 契約は通知の遅れで DB が古くても誤判定しないよう、Stripe から取り直して判定する。
 *
 * @param urls - 呼び出し側で検証済みのものを渡す。`completionUrl` は確認を終えた後の戻り先
 */
export async function createPlanChangeSession(
  stripe: BillingOperationsStripe,
  user: Pick<User, 'stripeCustomerId'>,
  roleId: string,
  urls: { returnUrl: string; completionUrl: string }
): Promise<PlanChangeResult> {
  const serviceId = getBillingServiceId(roleId);
  if (serviceId === undefined) {
    return { ok: false, reason: 'invalid-role' };
  }
  if (!user.stripeCustomerId) {
    return { ok: false, reason: 'not-subscribed' };
  }

  const entitled = await listEntitledSubscriptions(stripe, user.stripeCustomerId);
  const current = entitled.find((entry) => getBillingServiceId(entry.roleId) === serviceId);
  if (!current) {
    return { ok: false, reason: 'not-subscribed' };
  }
  if (current.roleId === roleId) {
    return { ok: false, reason: 'same-plan' };
  }
  // 支払いを確認できていない契約の段を変えると、日割りの請求が失敗したまま段だけ変わりうる
  if (current.status === 'past_due') {
    return { ok: false, reason: 'payment-past-due' };
  }
  // 解約の取り消しは Portal の確認画面では扱えないため、呼び出し側が「契約を管理」へ案内する
  if (current.endsAt !== null) {
    return { ok: false, reason: 'canceling' };
  }
  // 予約が付いている間は Portal で変更も解約もできないため、先に予約を取り消してもらう
  if (current.scheduledChange !== null) {
    return { ok: false, reason: 'change-scheduled' };
  }

  const price = (await listPlanPrices(stripe)).get(roleId);
  if (!price) {
    return { ok: false, reason: 'price-not-found' };
  }

  if (compareBillingTier(roleId, current.roleId) < 0) {
    return scheduleDowngrade(stripe, current, price);
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: urls.returnUrl,
    flow_data: {
      type: 'subscription_update_confirm',
      subscription_update_confirm: {
        subscription: current.subscriptionId,
        items: [{ id: current.subscriptionItemId, price: price.id, quantity: 1 }],
      },
      after_completion: { type: 'redirect', redirect: { return_url: urls.completionUrl } },
    },
  });
  return { ok: true, kind: 'portal', url: session.url };
}

/**
 * そのユーザーの、指定サービスの契約に付いた下げの予約を取り消す。
 *
 * 契約は今の段のまま残る。他人の予約を指定できないよう、予約の ID は受け取らず Stripe から引く。
 */
export async function cancelScheduledChange(
  stripe: BillingOperationsStripe,
  user: Pick<User, 'stripeCustomerId'>,
  serviceId: string
): Promise<CancelScheduledChangeResult> {
  if (!user.stripeCustomerId) {
    return { ok: false, reason: 'no-scheduled-change' };
  }

  const entitled = await listEntitledSubscriptions(stripe, user.stripeCustomerId);
  const scheduled = entitled.find(
    (entry) => getBillingServiceId(entry.roleId) === serviceId && entry.scheduledChange !== null
  )?.scheduledChange;
  if (!scheduled) {
    return { ok: false, reason: 'no-scheduled-change' };
  }

  // release で変わるのは予約だけで、権利の計算に使う値は変わらないため同期しない
  await stripe.subscriptionSchedules.release(scheduled.scheduleId);
  return { ok: true };
}
