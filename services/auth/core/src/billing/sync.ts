import { randomUUID } from 'node:crypto';
import { OptimisticLockError } from '@nagiyu/aws';
import { PAID_ROLES, logger } from '@nagiyu/common';
import type { UserRepository } from '../repositories';
import { ROLES_AND_GRANTS_MAX_ATTEMPTS } from '../repositories/user-repository';
import { computeStripeGrants, isGrantsUnchanged, type DesiredStripeRole } from './grant-diff';
import type { BillingStripe, BillingSubscription } from './stripe-client';

const ENTITLING_STATUSES: ReadonlySet<string> = new Set(['active', 'trialing', 'past_due']);

/** 更新の通知を取りこぼしても、Stripe の再送期間 (最大 3 日) の間は権利が切れないようにする猶予 */
export const GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1000;

export type SyncResult =
  | { synced: true; changed: boolean; subscriptions: EntitledSubscription[] }
  | { synced: false; reason: 'customer-deleted' | 'user-not-found' | 'customer-mismatch' };

export type SyncDependencies = {
  stripe: BillingStripe;
  userRepository: UserRepository;
  now?: () => number;
  generateId?: () => string;
};

export type EntitledSubscription = {
  roleId: string;
  subscriptionId: string;
  /** 段の切り替えで差し替える品目の ID */
  subscriptionItemId: string;
  /** 請求期間の終わり (Unix ミリ秒) */
  currentPeriodEnd: number;
  /** 解約の予約による終了日 (Unix ミリ秒)。予約がなければ null */
  endsAt: number | null;
  /** 契約の状態。支払いの遅れ (`past_due`) でも権利は続くため、段の切り替えの可否の判定に使う */
  status: string;
  /** 次の期間から別の価格に切り替わる予約。なければ null */
  scheduledChange: ScheduledChange | null;
};

export type ScheduledChange = {
  scheduleId: string;
  /** 切り替わり先の価格の ID。ロールへの対応付けは価格の一覧で行う */
  priceId: string;
  /** 切り替わる時刻 (Unix ミリ秒) */
  startsAt: number;
};

/** 今の期間より後に今と違う価格で始まるフェーズがある、有効な予約だけを下げの予約とみなす */
function findScheduledChange(
  schedule: BillingSubscription['schedule'],
  currentPriceId: string,
  periodEndSeconds: number
): ScheduledChange | null {
  if (!schedule || typeof schedule === 'string') {
    return null;
  }
  if (schedule.status !== 'active' && schedule.status !== 'not_started') {
    return null;
  }
  for (const phase of schedule.phases) {
    if (phase.start_date < periodEndSeconds) {
      continue;
    }
    // Portal の flow が品目 1 つの契約しか扱わないため、契約は 1 品目の前提で先頭だけを見る
    const price = phase.items[0]?.price;
    const priceId = typeof price === 'string' ? price : price?.id;
    if (priceId && priceId !== currentPriceId) {
      return { scheduleId: schedule.id, priceId, startsAt: phase.start_date * 1000 };
    }
  }
  return null;
}

export async function listEntitledSubscriptions(
  stripe: BillingStripe,
  customerId: string
): Promise<EntitledSubscription[]> {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 100,
    expand: ['data.schedule'],
  });

  const entitled: EntitledSubscription[] = [];

  for (const subscription of subscriptions.data) {
    if (!ENTITLING_STATUSES.has(subscription.status)) {
      continue;
    }
    for (const item of subscription.items.data) {
      // 1 サービス = 1 商品で段は価格が表すため、商品の機能ではなく価格の lookup_key で決める
      const lookupKey = item.price.lookup_key;
      if (lookupKey === null || !PAID_ROLES.includes(lookupKey)) {
        logger.warn('有料ロールでない価格の lookup_key を無視しました', {
          lookupKey,
          subscriptionId: subscription.id,
        });
        continue;
      }

      const periodEnd = item.current_period_end * 1000;
      const cancelAt = subscription.cancel_at ? subscription.cancel_at * 1000 : null;
      const endsAt = subscription.cancel_at_period_end ? periodEnd : cancelAt;

      entitled.push({
        roleId: lookupKey,
        subscriptionId: subscription.id,
        subscriptionItemId: item.id,
        currentPeriodEnd: periodEnd,
        endsAt,
        status: subscription.status,
        scheduledChange: findScheduledChange(
          subscription.schedule,
          item.price.id,
          item.current_period_end
        ),
      });
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
 * 通知の中身は合図としてだけ使い、毎回 Stripe から最新の状態を取り直す。
 * 顧客のメタデータの `userId` が指すユーザーが同じ顧客 ID を持たないときは何もしない。
 *
 * @throws Stripe や DB の失敗、競合が解けないまま試行回数を使い切ったこと。呼び出し側は再送させる
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

  // Stripe を読んでいる間に別のハンドラーが書くと古い読み取りで上書きしてしまうため、
  // 先に読んだユーザーの世代を書き込みの条件にし、競合したら両方を読み直す
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

    // 変更の有無だけを見る計算なので、権利の ID は消費しない
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
