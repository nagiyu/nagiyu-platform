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

/** プランの画面が表示のために読み込むデータ */
export type PlansPageData =
  { billingEnabled: false } | { billingEnabled: true; cards: PlanCard[]; hasCustomer: boolean };

export type PlansDependencies = {
  stripe: BillingOperationsStripe;
  userRepository: UserRepository;
  now?: () => number;
};

/** 同期の結果。画面の表示に使う */
export type PlansSyncResult = {
  /** 同期後のユーザー。いなければ null */
  user: User | null;
  /** 同期が Stripe から読んだ契約。同期しなかった・失敗したときは null */
  subscriptions: EntitledSubscription[] | null;
};

/**
 * ログイン中のユーザーを Stripe の状態に同期する。
 *
 * 失敗しても画面を壊さない。同期は通知の取りこぼしの保険であり、表示は DB の状態で続けられるため。
 * 同期が読んだ契約は、表示が Stripe に同じ問い合わせをやり直さずに済むよう一緒に返す。
 */
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

/**
 * プランの画面のデータを組み立てる。
 *
 * 価格と契約の状態は開くたびに Stripe から読む (契約は同期の読み取りを使い回す)。読めなかった部分は画面を壊さず、
 * 価格は出さず、契約の状態は DB の権利から決める。
 *
 * @param userId - ログイン中のユーザー ID。未ログインなら null
 */
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
  // 同期が読んだ結果があれば使い回す。同期が読めなかったときだけ、表示のために読み直す
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
