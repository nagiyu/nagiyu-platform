import { randomUUID } from 'node:crypto';
import { OptimisticLockError } from '@nagiyu/aws';
import { PAID_ROLES, logger } from '@nagiyu/common';
import type { UserRepository } from '../repositories';
import { ROLES_AND_GRANTS_MAX_ATTEMPTS } from '../repositories/user-repository';
import { computeStripeGrants, isGrantsUnchanged, type DesiredStripeRole } from './grant-diff';
import type { BillingStripe } from './stripe-client';

/** 有料ロールを与える契約の状態 */
const ENTITLING_STATUSES: ReadonlySet<string> = new Set(['active', 'trialing', 'past_due']);

/**
 * 請求期間の終わりから権利の期限までの猶予 (ミリ秒)。
 *
 * 更新の通知を取りこぼしても、Stripe の再送期間 (最大 3 日) の間は権利が切れないようにする。
 */
export const GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1000;

/** 同期の結果 */
export type SyncResult =
  | { synced: true; changed: boolean; subscriptions: EntitledSubscription[] }
  | { synced: false; reason: 'customer-deleted' | 'user-not-found' | 'customer-mismatch' };

/** 同期が使うもの。テストで差し替えられるよう外から受け取る */
export type SyncDependencies = {
  stripe: BillingStripe;
  userRepository: UserRepository;
  now?: () => number;
  generateId?: () => string;
};

/** 有料ロールを与える契約の品目 1 件分 */
export type EntitledSubscription = {
  roleId: string;
  subscriptionId: string;
  /** 請求期間の終わり (Unix ミリ秒) */
  currentPeriodEnd: number;
  /** 解約の予約による終了日 (Unix ミリ秒)。予約がなければ null */
  endsAt: number | null;
};

/**
 * 顧客の契約のうち、有料ロールを与えているものを Stripe から得る。
 *
 * 同期と、申し込み・画面の状態の判定が同じ読み方を共有する。
 * 有料ロールでない `lookup_key` は無視する。商品ごとの機能の取得は 1 回に抑える。
 */
export async function listEntitledSubscriptions(
  stripe: BillingStripe,
  customerId: string
): Promise<EntitledSubscription[]> {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 100,
  });

  const lookupKeysByProduct = new Map<string, string[]>();
  const entitled: EntitledSubscription[] = [];

  for (const subscription of subscriptions.data) {
    if (!ENTITLING_STATUSES.has(subscription.status)) {
      continue;
    }
    for (const item of subscription.items.data) {
      const product = item.price.product;
      const productId = typeof product === 'string' ? product : product.id;

      let lookupKeys = lookupKeysByProduct.get(productId);
      if (lookupKeys === undefined) {
        const features = await stripe.products.listFeatures(productId, { limit: 100 });
        lookupKeys = features.data.map((feature) => feature.entitlement_feature.lookup_key);
        lookupKeysByProduct.set(productId, lookupKeys);
      }

      const periodEnd = item.current_period_end * 1000;
      const cancelAt = subscription.cancel_at ? subscription.cancel_at * 1000 : null;
      const endsAt = subscription.cancel_at_period_end ? periodEnd : cancelAt;

      for (const lookupKey of lookupKeys) {
        if (!PAID_ROLES.includes(lookupKey)) {
          logger.warn('有料ロールでない機能の lookup_key を無視しました', {
            lookupKey,
            subscriptionId: subscription.id,
          });
          continue;
        }
        entitled.push({
          roleId: lookupKey,
          subscriptionId: subscription.id,
          currentPeriodEnd: periodEnd,
          endsAt,
        });
      }
    }
  }

  return entitled;
}

function toDesiredRoles(entitled: EntitledSubscription[]): DesiredStripeRole[] {
  return entitled.map((entry) => ({
    roleId: entry.roleId,
    expiresAt: entry.currentPeriodEnd + GRACE_PERIOD_MS,
    subscriptionId: entry.subscriptionId,
  }));
}

/**
 * Stripe の顧客の状態を、ユーザーの課金の権利 (`source: 'stripe'`) に反映する。
 *
 * 通知の中身は合図としてだけ使い、毎回 Stripe に最新の状態を問い合わせて上書きする。
 * そのため重複・順序の入れ替わり・再送のいずれでも、最終的に Stripe の状態と一致する。
 *
 * 顧客のメタデータの `userId` が指すユーザーが、同じ顧客 ID を保持しているときだけ反映する。
 * 一致しなければ何もしない。再送されても結果が変わらないため、呼び出し側は成功として扱ってよい。
 *
 * 結果の `subscriptions` は、反映に使った Stripe の読み取り結果。画面が同じ内容を読み直さずに済むよう返す。
 *
 * 書き込みが他の書き込みと競合したときは、ユーザーと Stripe の状態を読み直してやり直す。
 *
 * @throws Stripe や DB の一時的な失敗、および試行回数を使い切っても競合が解けなかったこと
 * (`OptimisticLockError`)。呼び出し側は再送させるために失敗として扱う
 */
export async function syncStripeCustomer(
  deps: SyncDependencies,
  customerId: string
): Promise<SyncResult> {
  const { stripe, userRepository } = deps;
  const now = deps.now ?? Date.now;
  const generateId = deps.generateId ?? randomUUID;

  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted === true) {
    logger.info('削除済みの顧客のため同期を行いません', { customerId });
    return { synced: false, reason: 'customer-deleted' };
  }

  const userId = customer.metadata?.userId;
  if (!userId) {
    logger.warn('顧客に対応するユーザーが見つからないため同期を行いません', { customerId });
    return { synced: false, reason: 'user-not-found' };
  }

  // Stripe を読んでいる間に別のハンドラーが新しい状態を書くと、古い読み取りで上書きしてしまう。
  // Stripe を読む前に読んだユーザーの世代を書き込みの条件にし、競合したら両方を読み直す
  let lastError: OptimisticLockError | undefined;
  for (let attempt = 0; attempt < ROLES_AND_GRANTS_MAX_ATTEMPTS; attempt++) {
    const user = await userRepository.getUserById(userId);
    if (!user) {
      logger.warn('顧客に対応するユーザーが見つからないため同期を行いません', { customerId });
      return { synced: false, reason: 'user-not-found' };
    }
    if (user.stripeCustomerId !== customerId) {
      logger.warn('ユーザーの顧客 ID が一致しないため同期を行いません', { customerId, userId });
      return { synced: false, reason: 'customer-mismatch' };
    }

    const subscriptions = await listEntitledSubscriptions(stripe, customerId);
    const desired = toDesiredRoles(subscriptions);

    // 変更の有無だけを見るための計算なので、権利の ID は消費しない
    const current = user.roleGrants ?? [];
    if (
      isGrantsUnchanged(
        current,
        computeStripeGrants(current, desired, now(), () => '')
      )
    ) {
      return { synced: true, changed: false, subscriptions };
    }

    try {
      await userRepository.updateRolesAndGrantsIfUnchanged(
        userId,
        { roleGrants: computeStripeGrants(current, desired, now(), generateId) },
        user.updatedAt
      );
      return { synced: true, changed: true, subscriptions };
    } catch (error) {
      if (error instanceof OptimisticLockError) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastError as OptimisticLockError;
}

/**
 * 通知のイベントから顧客 ID を取り出す。
 *
 * `customer` を文字列か、展開されたオブジェクトで持つイベントだけが対象。取り出せなければ null。
 */
export function extractCustomerId(event: { data: { object: unknown } }): string | null {
  const object = event.data.object;
  if (typeof object !== 'object' || object === null) {
    return null;
  }
  const customer = (object as { customer?: unknown }).customer;
  if (typeof customer === 'string' && customer !== '') {
    return customer;
  }
  if (typeof customer === 'object' && customer !== null) {
    const id = (customer as { id?: unknown }).id;
    return typeof id === 'string' && id !== '' ? id : null;
  }
  return null;
}
