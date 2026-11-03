import { logger } from '@nagiyu/common';
import type { User } from '@nagiyu/common';
import {
  listEntitledSubscriptions,
  listPlanPrices,
  syncStripeCustomer,
  type BillingOperationsStripe,
  type UserRepository,
} from '@nagiyu/auth-core';
import { buildPlanCards, type PlanCard, type PlanPrice } from './plans';

/** プランの画面が表示のために読み込むデータ */
export type PlansPageData =
  { billingEnabled: false } | { billingEnabled: true; cards: PlanCard[]; hasCustomer: boolean };

export type PlansDependencies = {
  stripe: BillingOperationsStripe;
  userRepository: UserRepository;
  now?: () => number;
};

/**
 * ログイン中のユーザーを Stripe の状態に同期する。
 *
 * 失敗しても画面を壊さない。同期は通知の取りこぼしの保険であり、表示は DB の状態で続けられるため。
 *
 * @returns 同期後のユーザー。いなければ null
 */
export async function syncUserForPlans(
  deps: PlansDependencies,
  userId: string
): Promise<User | null> {
  const user = await deps.userRepository.getUserById(userId);
  if (!user?.stripeCustomerId) {
    return user;
  }
  try {
    const result = await syncStripeCustomer(deps, user.stripeCustomerId);
    return result.synced && result.changed ? await deps.userRepository.getUserById(userId) : user;
  } catch (error) {
    logger.error('プランの画面での同期に失敗しました', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return user;
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

/**
 * プランの画面のデータを組み立てる。
 *
 * 価格と契約の状態は開くたびに Stripe から読む。読めなかった部分は画面を壊さず、
 * 価格は出さず、契約の状態は DB の権利から決める。
 *
 * @param userId - ログイン中のユーザー ID。未ログインなら null
 */
export async function loadPlansPageData(
  deps: PlansDependencies,
  userId: string | null
): Promise<PlansPageData> {
  const now = (deps.now ?? Date.now)();
  const user = userId ? await syncUserForPlans(deps, userId) : null;

  const prices = await loadSafely(
    'プランの価格の取得に失敗しました',
    () => listPlanPrices(deps.stripe),
    new Map<string, PlanPrice>()
  );

  const customerId = user?.stripeCustomerId;
  const subscriptions =
    user && customerId
      ? await loadSafely(
          'プランの画面での契約の取得に失敗しました',
          () => listEntitledSubscriptions(deps.stripe, customerId),
          null
        )
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
