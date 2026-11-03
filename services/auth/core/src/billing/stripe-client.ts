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
