import Stripe from 'stripe';

/**
 * 課金まわりのエラーメッセージ
 */
export const BILLING_ERROR_MESSAGES = {
  BILLING_DISABLED: '課金は有効になっていません',
  INVALID_SIGNATURE: '通知の署名を検証できませんでした',
  CUSTOMER_LOOKUP_FAILED: 'Stripe の顧客を取得できませんでした',
} as const;

/** 課金の設定。鍵が空なら課金は無効 */
export type BillingConfig = {
  secretKey: string;
  webhookSecret: string;
};

/** Stripe の顧客のうち同期が読む部分 */
export type BillingCustomer = {
  id: string;
  deleted?: unknown;
  metadata?: Record<string, string> | null;
};

/** 契約の品目のうち同期が読む部分 */
export type BillingSubscriptionItem = {
  /** 請求期間の終わり (Unix 秒)。契約ではなく品目が持つ */
  current_period_end: number;
  price: { product: string | { id: string } };
};

/** 契約のうち同期が読む部分 */
export type BillingSubscription = {
  id: string;
  status: string;
  items: { data: BillingSubscriptionItem[] };
};

/** 商品に紐づく機能のうち同期が読む部分 */
export type BillingProductFeature = {
  entitlement_feature: { lookup_key: string };
};

/** 通知のイベントのうち受け口が読む部分 */
export type BillingEvent = {
  type: string;
  data: { object: unknown };
};

/**
 * 同期と受け口が Stripe に対して使う操作。
 *
 * SDK 全体ではなく使うものだけに絞ることで、テストで差し替えやすくする。
 */
export interface BillingStripe {
  customers: {
    retrieve(id: string): Promise<BillingCustomer>;
  };
  subscriptions: {
    list(params: {
      customer: string;
      status: 'all';
      limit: number;
    }): Promise<{ data: BillingSubscription[] }>;
  };
  products: {
    listFeatures(id: string, params: { limit: number }): Promise<{ data: BillingProductFeature[] }>;
  };
  webhooks: {
    constructEvent(payload: string, header: string, secret: string): BillingEvent;
  };
}

function isUnset(value: string): boolean {
  return value === '' || value.startsWith('PLACEHOLDER_');
}

/**
 * 環境変数から課金の設定を読む。
 *
 * 鍵が空か仮の値のまま (人が値を入れるまでの dev や本番) の環境では、課金を無効として扱う。
 *
 * @returns 無効なら null
 */
export function getBillingConfig(env: NodeJS.ProcessEnv = process.env): BillingConfig | null {
  const secretKey = env.STRIPE_SECRET_KEY ?? '';
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET ?? '';
  // 秘密情報は人が値を入れるまで PLACEHOLDER_ で始まる値で作られるため、空と同じく無効として扱う
  if (isUnset(secretKey) || isUnset(webhookSecret)) {
    return null;
  }
  return { secretKey, webhookSecret };
}

/**
 * Stripe の SDK から {@link BillingStripe} を作る。
 */
export function createBillingStripe(secretKey: string): BillingStripe {
  const stripe = new Stripe(secretKey);
  return {
    customers: {
      retrieve: (id) => stripe.customers.retrieve(id),
    },
    subscriptions: {
      list: (params) => stripe.subscriptions.list(params),
    },
    products: {
      listFeatures: (id, params) => stripe.products.listFeatures(id, params),
    },
    webhooks: {
      constructEvent: (payload, header, secret) =>
        stripe.webhooks.constructEvent(payload, header, secret),
    },
  };
}
