import { ROLES, PAID_ROLES } from '@nagiyu/common';
import type { RoleGrant } from '@nagiyu/common';

export const PLANS_MESSAGES = {
  PREPARING: '準備中です',
  PRICE_UNAVAILABLE: '価格を取得できませんでした',
  NOTE: '契約は自動で更新されます。解約は「契約を管理」から行えます。解約しても、支払い済みの期間の終わりまで使えます。',
} as const;

/** Price のうち表示に使う部分 */
export type PlanPrice = {
  unit_amount: number | null;
  currency: string;
  recurring: { interval: string; interval_count: number } | null;
  /** 商品。説明を読めるのは展開されているときだけ */
  product?: string | { description?: string | null; deleted?: unknown } | null;
};

/** Stripe の契約のうち表示に使う部分 */
export type PlanSubscription = {
  roleId: string;
  /** 請求期間の終わり (Unix ミリ秒) */
  currentPeriodEnd: number;
  /** 解約の予約による終了日 (Unix ミリ秒)。予約がなければ null */
  endsAt: number | null;
};

export type PlanCardState = 'guest' | 'none' | 'subscribed' | 'canceling';

/** プランのカード 1 枚分の表示データ */
export type PlanCard = {
  roleId: string;
  name: string;
  /** Stripe の商品の説明。空・無い・取れないときは null */
  description: string | null;
  /** 「月額 ¥500 (税込)」の形。Price が無ければ null */
  priceLabel: string | null;
  state: PlanCardState;
  /** 契約中・解約予約中の説明。日付が分からないときは null */
  stateLabel: string | null;
  /** 手動の権利の期限の説明 */
  manualLabel: string | null;
  /** 申し込みの操作を出してよいか。契約が無く、Price があるときだけ */
  canSubscribe: boolean;
};

export type BuildPlanCardsInput = {
  loggedIn: boolean;
  prices: ReadonlyMap<string, PlanPrice>;
  /** Stripe から取れた契約。取れなかったときは null で、DB の権利から状態を決める */
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

/**
 * 日付を日本時間の「2026年12月3日」の形にする。
 */
export function formatPlanDate(timestamp: number): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(timestamp));
}

/**
 * Price を「月額 ¥500 (税込)」の形にする。金額か通貨が読めなければ null。
 */
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

/**
 * Price の商品から説明文を読む。空白だけの説明は無いものとして扱う。
 */
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

/**
 * 同じロールの契約が複数あるときに表示する 1 件を選ぶ。
 * 解約の予約がないものを優先し、同じなら期間の終わりが遅いものを採る。
 */
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
 * プランの画面に出すカードを、有料ロールごとに組み立てる。
 */
export function buildPlanCards(input: BuildPlanCardsInput): PlanCard[] {
  return PAID_ROLES.map((roleId): PlanCard => {
    const role = ROLES[roleId as keyof typeof ROLES];
    const priceLabel = formatPriceLabel(input.prices.get(roleId));
    const { state, stateLabel } = resolveState(roleId, input);
    return {
      roleId,
      name: role.name,
      description: formatPlanDescription(input.prices.get(roleId)),
      priceLabel,
      state,
      stateLabel,
      manualLabel: resolveManualLabel(roleId, input),
      canSubscribe: state === 'none' && priceLabel !== null,
    };
  });
}
