import { logger } from '@nagiyu/common';
import type { User } from '@nagiyu/common';
import {
  listEntitledSubscriptions,
  listPlanPrices,
  syncStripeCustomer,
  type BillingOperationsStripe,
  type EntitledSubscription,
  type UserRepository,
} from '@nagiyu/auth-core';
import { buildPlanCards, type PlanCard, type PlanPrice } from './plans';

export type PlansPageData =
  { billingEnabled: false } | { billingEnabled: true; cards: PlanCard[]; hasCustomer: boolean };

export type PlansDependencies = {
  stripe: BillingOperationsStripe;
  userRepository: UserRepository;
  now?: () => number;
};

export type PlansSyncResult = {
  user: User | null;
  /** 同期が読んだ契約。同期しなかった・失敗したときは null */
  subscriptions: EntitledSubscription[] | null;
};

/** 失敗しても画面を壊さない (同期は通知の取りこぼしの保険) */
export async function syncUserForPlans(
  deps: PlansDependencies,
  userId: string
): Promise<PlansSyncResult> {
  const user = await deps.userRepository.getUserById(userId);
  if (!user?.stripeCustomerId) {
    return { user, subscriptions: null };
  }
  try {
    const result = await syncStripeCustomer(deps, user.stripeCustomerId);
    if (!result.synced) {
      return { user, subscriptions: null };
    }
    return {
      user: result.changed ? await deps.userRepository.getUserById(userId) : user,
      subscriptions: result.subscriptions,
    };
  } catch (error) {
    logger.error('プランの画面での同期に失敗しました', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { user, subscriptions: null };
  }
}

async function loadSafely<T>(label: string, task: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await task();
  } catch (error) {
    logger.error(label, { error: error instanceof Error ? error.message : String(error) });
    return fallback;
  }
}

/** Stripe から読めなかった価格は出さず、契約の状態は DB の権利から決める */
export async function loadPlansPageData(
  deps: PlansDependencies,
  userId: string | null
): Promise<PlansPageData> {
  const now = (deps.now ?? Date.now)();
  const synced = userId ? await syncUserForPlans(deps, userId) : null;
  const user = synced?.user ?? null;

  const prices = await loadSafely(
    'プランの価格の取得に失敗しました',
    () => listPlanPrices(deps.stripe),
    new Map<string, PlanPrice>()
  );

  const customerId = user?.stripeCustomerId;
  const subscriptions =
    user && customerId
      ? (synced?.subscriptions ??
        (await loadSafely(
          'プランの画面での契約の取得に失敗しました',
          () => listEntitledSubscriptions(deps.stripe, customerId),
          null
        )))
      : user
        ? []
        : null;

  return {
    billingEnabled: true,
    hasCustomer: Boolean(customerId),
    cards: buildPlanCards({
      loggedIn: user !== null,
      prices,
      subscriptions,
      grants: user?.roleGrants ?? [],
      now,
    }),
  };
}
