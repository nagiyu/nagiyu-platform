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
  id: string;
  /** 請求期間の終わり (Unix 秒)。契約ではなく品目が持つ */
  current_period_end: number;
  /** `lookup_key` は有料ロール ID。付いていない価格は null */
  price: { id: string; lookup_key: string | null };
};

export type BillingSubscription = {
  id: string;
  status: string;
  cancel_at_period_end?: boolean;
  /** Unix 秒。期間の終わり以外を指定された解約でも入る */
  cancel_at?: number | null;
  items: { data: BillingSubscriptionItem[] };
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
  webhooks: {
    constructEvent(payload: string, header: string, secret: string): BillingEvent;
  };
}

export type BillingPrice = {
  id: string;
  lookup_key: string | null;
  /** 最小通貨単位での金額 */
  unit_amount: number | null;
  currency: string;
  recurring: { interval: string; interval_count: number } | null;
  /** 商品。`expand` しなければ ID の文字列で、説明は読めない */
  product?: string | { id: string; description?: string | null; deleted?: unknown } | null;
};

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
      expand?: string[];
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
    webhooks: {
      constructEvent: (payload, header, secret) =>
        stripe.webhooks.constructEvent(payload, header, secret),
    },
  };
}
