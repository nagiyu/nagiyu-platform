import {
  ROLES,
  BILLING_SERVICES,
  compareBillingTier,
  getBillingTierRoleIds,
  isRoleGrantActive,
} from '@nagiyu/common';
import type { RoleGrant } from '@nagiyu/common';

export const PLANS_MESSAGES = {
  PREPARING: '準備中です',
  PRICE_UNAVAILABLE: '価格を取得できませんでした',
  CHECKOUT_RESTRICTED: 'この環境ではテスト用の申し込みに限っています',
  NOTE: '契約は自動で更新されます。解約は「契約を管理」から行えます。解約しても、支払い済みの期間の終わりまで使えます。',
} as const;

export type PlanPrice = {
  /** 下げの予約の行き先 (価格 ID) を段に対応付けるのに使う */
  id?: string;
  unit_amount: number | null;
  currency: string;
  recurring: { interval: string; interval_count: number } | null;
  product?: string | { description?: string | null; deleted?: unknown } | null;
};

export type PlanSubscription = {
  roleId: string;
  currentPeriodEnd: number;
  endsAt: number | null;
  /** 次の期間から別の価格へ切り替わる予約 */
  scheduledChange?: { priceId: string; startsAt: number } | null;
};

export type PlanTierState = 'guest' | 'none' | 'subscribed' | 'canceling';

/**
 * 段のカードに出す操作。契約の状態から決め、画面は分岐しない。
 * 上げは Customer Portal の確認画面へ送り、下げは Auth の確認ダイアログを経て期末に予約する。
 */
export type PlanTierAction = 'sign-in' | 'subscribe' | 'upgrade' | 'downgrade' | null;

export type PlanTier = {
  roleId: string;
  name: string;
  /** 段ごとに別の商品なので、商品の説明 */
  description: string | null;
  priceLabel: string | null;
  /** 価格を取得できなかった。価格が無いこととは区別し、画面は案内を出す */
  priceFetchFailed: boolean;
  state: PlanTierState;
  stateLabel: string | null;
  manualLabel: string | null;
  action: PlanTierAction;
  /** 下げを予約中の契約中の段にだけ付く。予約の取り消しの導線を出す目印も兼ねる */
  scheduledChangeLabel: string | null;
  /** 下げの確認ダイアログの本文。`action` が `downgrade` のときだけ付く */
  downgradeConfirmMessage: string | null;
};

export type PlanService = {
  serviceId: string;
  name: string;
  /** 下の段から順 */
  tiers: PlanTier[];
};

export type BuildPlanServicesInput = {
  loggedIn: boolean;
  /** 取得に失敗したときは null。空の Map は「読めたが売っているものが無い」を表す */
  prices: ReadonlyMap<string, PlanPrice> | null;
  /** 取れなかったときは null で、DB の権利から状態を決める */
  subscriptions: readonly PlanSubscription[] | null;
  grants: readonly RoleGrant[];
  now: number;
};

const INTERVAL_LABELS: Record<string, [single: string, multiple: (n: number) => string]> = {
  month: ['月額', (n) => `${n}か月ごと`],
  year: ['年額', (n) => `${n}年ごと`],
  week: ['週額', (n) => `${n}週間ごと`],
  day: ['日額', (n) => `${n}日ごと`],
};

export function formatPlanDate(timestamp: number): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(timestamp));
}

export function formatPriceLabel(price: PlanPrice | undefined): string | null {
  if (!price || price.unit_amount === null || !price.currency) {
    return null;
  }
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: price.currency.toUpperCase(),
  });
  // 日本円のように小数を持たない通貨は、Stripe の金額がそのまま主単位になる
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 0;
  const amount = formatter.format(price.unit_amount / 10 ** digits);

  const labels = price.recurring ? INTERVAL_LABELS[price.recurring.interval] : undefined;
  if (!price.recurring || !labels) {
    return `${amount} (税込)`;
  }
  if (price.recurring.interval_count === 1) {
    return `${labels[0]} ${amount} (税込)`;
  }
  return `${labels[1](price.recurring.interval_count)} ${amount} (税込)`;
}

export function formatPlanDescription(price: PlanPrice | undefined): string | null {
  const product = price?.product;
  if (!product || typeof product === 'string' || product.deleted) {
    return null;
  }
  const description = product.description?.trim();
  return description ? description : null;
}

function pickSubscription(candidates: PlanSubscription[]): PlanSubscription | undefined {
  return [...candidates].sort((a, b) => {
    const aCanceling = a.endsAt !== null ? 1 : 0;
    const bCanceling = b.endsAt !== null ? 1 : 0;
    return aCanceling - bCanceling || b.currentPeriodEnd - a.currentPeriodEnd;
  })[0];
}

function resolveState(
  roleId: string,
  input: BuildPlanServicesInput
): { state: PlanTierState; stateLabel: string | null; subscription: PlanSubscription | null } {
  if (!input.loggedIn) {
    return { state: 'guest', stateLabel: null, subscription: null };
  }

  if (input.subscriptions !== null) {
    const subscription = pickSubscription(
      input.subscriptions.filter((entry) => entry.roleId === roleId)
    );
    if (!subscription) {
      return { state: 'none', stateLabel: null, subscription: null };
    }
    if (subscription.endsAt !== null) {
      return {
        state: 'canceling',
        stateLabel: `${formatPlanDate(subscription.endsAt)}に終了します`,
        subscription,
      };
    }
    return {
      state: 'subscribed',
      stateLabel: `次の更新日: ${formatPlanDate(subscription.currentPeriodEnd)}`,
      subscription,
    };
  }

  // Stripe から取れなかったときは、同期済みの権利から契約中かどうかだけ分かる
  const hasStripeGrant = input.grants.some(
    (grant) =>
      grant.source === 'stripe' && grant.roleId === roleId && isRoleGrantActive(grant, input.now)
  );
  return hasStripeGrant
    ? { state: 'subscribed', stateLabel: null, subscription: null }
    : { state: 'none', stateLabel: null, subscription: null };
}

function resolveManualLabel(roleId: string, input: BuildPlanServicesInput): string | null {
  if (!input.loggedIn) {
    return null;
  }
  const manual = input.grants.filter(
    (grant) =>
      grant.source === 'manual' && grant.roleId === roleId && isRoleGrantActive(grant, input.now)
  );
  if (manual.length === 0) {
    return null;
  }
  if (manual.some((grant) => grant.expiresAt === undefined)) {
    return '運営による付与があります (期限なし)';
  }
  const latest = Math.max(...manual.map((grant) => grant.expiresAt as number));
  return `運営による付与があります (${formatPlanDate(latest)}まで)`;
}

/** 行き先の価格が段に対応付けられないときは、日付だけの文言にする */
function resolveScheduledChangeLabel(
  subscription: PlanSubscription | null,
  input: BuildPlanServicesInput
): string | null {
  const change = subscription?.scheduledChange;
  if (!change) {
    return null;
  }
  const date = formatPlanDate(change.startsAt);
  for (const [roleId, price] of input.prices ?? []) {
    if (price.id === change.priceId) {
      return `${date}から${ROLES[roleId as keyof typeof ROLES].name}に変わります`;
    }
  }
  return `${date}に別の段に変わります`;
}

/**
 * サービスごとに、段のカードの状態と操作を決める。
 *
 * Stripe に価格が無い段は、売っていないものとして枠を出さない。
 * 契約中や有効な手動の権利がある利用者には、契約の確認ができるよう枠を残す。
 * 価格の取得に失敗したときは売っているか分からないため、全段の枠を出す。
 * 出す段が 1 つも無いサービスは返さない。
 */
export function buildPlanServices(input: BuildPlanServicesInput): PlanService[] {
  const services: PlanService[] = [];
  for (const [serviceId, serviceName] of Object.entries(BILLING_SERVICES)) {
    const roleIds = getBillingTierRoleIds(serviceId);
    const resolved = roleIds.map((roleId) => ({
      roleId,
      price: input.prices?.get(roleId),
      manualLabel: resolveManualLabel(roleId, input),
      ...resolveState(roleId, input),
    }));

    const serviceSubscription =
      input.subscriptions === null
        ? undefined
        : pickSubscription(input.subscriptions.filter((entry) => roleIds.includes(entry.roleId)));
    const hasContract = resolved.some(
      (tier) => tier.state === 'subscribed' || tier.state === 'canceling'
    );
    // 解約予約中・下げの予約中の契約は、切り替えを断るため導線を出さない
    const canChange =
      serviceSubscription !== undefined &&
      serviceSubscription.endsAt === null &&
      !serviceSubscription.scheduledChange;

    const tiers: PlanTier[] = [];
    for (const tier of resolved) {
      const priceLabel = formatPriceLabel(tier.price);
      const hasEntitlement =
        tier.state === 'subscribed' || tier.state === 'canceling' || tier.manualLabel !== null;
      if (input.prices !== null && tier.price === undefined && !hasEntitlement) {
        continue;
      }

      let action: PlanTierAction = null;
      if (tier.state === 'guest') {
        action = 'sign-in';
      } else if (tier.state === 'none' && priceLabel !== null) {
        if (!hasContract) {
          action = 'subscribe';
        } else if (canChange && serviceSubscription) {
          action =
            compareBillingTier(tier.roleId, serviceSubscription.roleId) > 0
              ? 'upgrade'
              : 'downgrade';
        }
      }

      tiers.push({
        roleId: tier.roleId,
        name: ROLES[tier.roleId as keyof typeof ROLES].name,
        description: formatPlanDescription(tier.price),
        priceLabel,
        priceFetchFailed: input.prices === null,
        state: tier.state,
        stateLabel: tier.stateLabel,
        manualLabel: tier.manualLabel,
        action,
        scheduledChangeLabel:
          tier.state === 'subscribed'
            ? resolveScheduledChangeLabel(tier.subscription, input)
            : null,
        downgradeConfirmMessage:
          action === 'downgrade' && serviceSubscription
            ? `${formatPlanDate(serviceSubscription.currentPeriodEnd)}から${ROLES[tier.roleId as keyof typeof ROLES].name}に変わります。それまでは今の段のまま使えます。返金はありません。`
            : null,
      });
    }
    if (tiers.length === 0) {
      continue;
    }

    services.push({
      serviceId,
      name: serviceName,
      tiers,
    });
  }
  return services;
}
