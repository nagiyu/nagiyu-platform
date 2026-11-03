import Stripe from 'stripe';

export const BILLING_ERROR_MESSAGES = {
  BILLING_DISABLED: '課金は有効になっていません',
  INVALID_SIGNATURE: '通知の署名を検証できませんでした',
} as const;

export type BillingConfig = {
  secretKey: string;
  webhookSecret: string;
};

export type BillingCustomer = {
  id: string;
  deleted?: unknown;
  metadata?: Record<string, string> | null;
};

export type BillingSubscriptionItem = {
  /** 請求期間の終わり (Unix 秒)。契約ではなく品目が持つ */
  current_period_end: number;
  price: { product: string | { id: string } };
};

export type BillingSubscription = {
  id: string;
  status: string;
  /** 期間の終わりでの解約が予約されているか */
  cancel_at_period_end?: boolean;
  /** 解約が予約された日時 (Unix 秒)。期間の終わり以外を指定された場合も入る */
  cancel_at?: number | null;
  items: { data: BillingSubscriptionItem[] };
};

export type BillingProductFeature = {
  entitlement_feature: { lookup_key: string };
};

export type BillingEvent = {
  type: string;
  data: { object: unknown };
};

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

/** Price のうち画面が読む部分 */
export type BillingPrice = {
  id: string;
  lookup_key: string | null;
  /** 最小通貨単位での金額 */
  unit_amount: number | null;
  currency: string;
  recurring: { interval: string; interval_count: number } | null;
};

/** 申し込み・契約の管理が Stripe に対して使う操作 */
export interface BillingOperationsStripe extends BillingStripe {
  customers: BillingStripe['customers'] & {
    create(
      params: { email: string; name: string; metadata: Record<string, string> },
      options: { idempotencyKey: string }
    ): Promise<{ id: string }>;
  };
  prices: {
    list(params: {
      lookup_keys: string[];
      active: boolean;
      limit: number;
    }): Promise<{ data: BillingPrice[] }>;
  };
  checkout: {
    sessions: {
      create(params: BillingCheckoutParams): Promise<{ url: string | null }>;
    };
  };
  billingPortal: {
    sessions: {
      create(params: { customer: string; return_url: string }): Promise<{ url: string }>;
    };
  };
}

/** Checkout Session の作成内容 */
export type BillingCheckoutParams = {
  mode: 'subscription';
  customer: string;
  client_reference_id: string;
  line_items: { price: string; quantity: number }[];
  metadata: Record<string, string>;
  subscription_data: { metadata: Record<string, string> };
  locale: 'ja';
  success_url: string;
  cancel_url: string;
};

function isUnset(value: string): boolean {
  return value === '' || value.startsWith('PLACEHOLDER_');
}

/** 鍵が空か仮の値のままなら課金は無効とみなし、null を返す */
export function getBillingConfig(env: NodeJS.ProcessEnv = process.env): BillingConfig | null {
  const secretKey = env.STRIPE_SECRET_KEY ?? '';
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET ?? '';
  if (isUnset(secretKey) || isUnset(webhookSecret)) {
    return null;
  }
  return { secretKey, webhookSecret };
}

/**
 * Stripe の SDK から {@link BillingStripe} を作る。
 */
export function createBillingStripe(secretKey: string): BillingOperationsStripe {
  const stripe = new Stripe(secretKey);
  return {
    customers: {
      retrieve: (id) => stripe.customers.retrieve(id),
      create: (params, options) => stripe.customers.create(params, options),
    },
    prices: {
      list: (params) => stripe.prices.list(params),
    },
    checkout: {
      sessions: {
        create: (params) => stripe.checkout.sessions.create(params),
      },
    },
    billingPortal: {
      sessions: {
        create: (params) => stripe.billingPortal.sessions.create(params),
      },
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
