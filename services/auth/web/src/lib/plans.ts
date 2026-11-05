import { ROLES, PAID_ROLES } from '@nagiyu/common';
import type { RoleGrant } from '@nagiyu/common';

export const PLANS_MESSAGES = {
  PREPARING: '準備中です',
  PRICE_UNAVAILABLE: '価格を取得できませんでした',
  NOTE: '契約は自動で更新されます。解約は「契約を管理」から行えます。解約しても、支払い済みの期間の終わりまで使えます。',
} as const;

export type PlanPrice = {
  unit_amount: number | null;
  currency: string;
  recurring: { interval: string; interval_count: number } | null;
  product?: string | { description?: string | null; deleted?: unknown } | null;
};

export type PlanSubscription = {
  roleId: string;
  currentPeriodEnd: number;
  endsAt: number | null;
};

export type PlanCardState = 'guest' | 'none' | 'subscribed' | 'canceling';

export type PlanCard = {
  roleId: string;
  name: string;
  description: string | null;
  priceLabel: string | null;
  /** 価格を取得できなかった。価格が無いこととは区別し、画面は案内を出す */
  priceFetchFailed: boolean;
  state: PlanCardState;
  stateLabel: string | null;
  manualLabel: string | null;
  canSubscribe: boolean;
};

export type BuildPlanCardsInput = {
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

function isActiveGrant(grant: RoleGrant, now: number): boolean {
  return grant.revokedAt === undefined && (grant.expiresAt === undefined || grant.expiresAt > now);
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
  input: BuildPlanCardsInput
): { state: PlanCardState; stateLabel: string | null } {
  if (!input.loggedIn) {
    return { state: 'guest', stateLabel: null };
  }

  if (input.subscriptions !== null) {
    const subscription = pickSubscription(
      input.subscriptions.filter((entry) => entry.roleId === roleId)
    );
    if (!subscription) {
      return { state: 'none', stateLabel: null };
    }
    if (subscription.endsAt !== null) {
      return {
        state: 'canceling',
        stateLabel: `${formatPlanDate(subscription.endsAt)}に終了します`,
      };
    }
    return {
      state: 'subscribed',
      stateLabel: `次の更新日: ${formatPlanDate(subscription.currentPeriodEnd)}`,
    };
  }

  // Stripe から取れなかったときは、同期済みの権利から契約中かどうかだけ分かる
  const hasStripeGrant = input.grants.some(
    (grant) =>
      grant.source === 'stripe' && grant.roleId === roleId && isActiveGrant(grant, input.now)
  );
  return hasStripeGrant
    ? { state: 'subscribed', stateLabel: null }
    : { state: 'none', stateLabel: null };
}

function resolveManualLabel(roleId: string, input: BuildPlanCardsInput): string | null {
  if (!input.loggedIn) {
    return null;
  }
  const manual = input.grants.filter(
    (grant) =>
      grant.source === 'manual' && grant.roleId === roleId && isActiveGrant(grant, input.now)
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

/**
 * Stripe に価格が無いロールは、売っていないものとして枠を出さない。
 * 契約中や有効な手動の権利がある利用者には、契約の確認ができるよう枠を残す。
 * 価格の取得に失敗したときは売っているか分からないため、全ロールの枠を出す。
 */
export function buildPlanCards(input: BuildPlanCardsInput): PlanCard[] {
  const cards: PlanCard[] = [];
  for (const roleId of PAID_ROLES) {
    const role = ROLES[roleId as keyof typeof ROLES];
    const price = input.prices?.get(roleId);
    const priceLabel = formatPriceLabel(price);
    const { state, stateLabel } = resolveState(roleId, input);
    const manualLabel = resolveManualLabel(roleId, input);

    const hasEntitlement = state === 'subscribed' || state === 'canceling' || manualLabel !== null;
    if (input.prices !== null && price === undefined && !hasEntitlement) {
      continue;
    }

    cards.push({
      roleId,
      name: role.name,
      description: formatPlanDescription(price),
      priceLabel,
      priceFetchFailed: input.prices === null,
      state,
      stateLabel,
      manualLabel,
      canSubscribe: state === 'none' && priceLabel !== null,
    });
  }
  return cards;
}
