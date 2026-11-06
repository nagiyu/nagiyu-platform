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

/** 契約に付く予約 (Subscription Schedule)。`expand: ['data.schedule']` で展開したときだけ中身が入る */
export type BillingSchedule = {
  id: string;
  status: string;
  phases: {
    /** Unix 秒 */
    start_date: number;
    /** 展開しない限り価格 ID の文字列。展開の深さの上限のため展開しない */
    items: { price: string | { id: string } }[];
  }[];
};

export type BillingSubscription = {
  id: string;
  status: string;
  cancel_at_period_end?: boolean;
  /** Unix 秒。期間の終わり以外を指定された解約でも入る */
  cancel_at?: number | null;
  items: { data: BillingSubscriptionItem[] };
  schedule?: string | BillingSchedule | null;
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
      expand?: string[];
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
      create(params: BillingPortalParams): Promise<{ url: string }>;
    };
  };
  subscriptionSchedules: {
    /** 契約から予約を作る。直後の phases は今の期間の 1 つだけで、価格は文字列の ID で返る */
    create(params: { from_subscription: string }): Promise<BillingCreatedSchedule>;
    update(id: string, params: BillingScheduleUpdateParams): Promise<unknown>;
    release(id: string): Promise<unknown>;
  };
}

export type BillingCreatedSchedule = {
  id: string;
  phases: {
    /** Unix 秒 */
    start_date: number;
    /** Unix 秒 */
    end_date: number;
    items: { price: string | { id: string }; quantity?: number | null }[];
  }[];
};

export type BillingSchedulePhaseParams = {
  /** 先頭の phase では必須。作成直後の phase の開始時刻を渡し直す */
  start_date?: number;
  end_date?: number;
  items: { price: string; quantity: number }[];
  proration_behavior?: 'none';
};

export type BillingScheduleUpdateParams = {
  phases: BillingSchedulePhaseParams[];
  end_behavior: 'release';
  proration_behavior: 'none';
  metadata: Record<string, string>;
};

export type BillingPortalParams = {
  customer: string;
  return_url: string;
  /** 指定すると Portal の特定の画面から始める */
  flow_data?: {
    type: 'subscription_update_confirm';
    subscription_update_confirm: {
      subscription: string;
      items: { id: string; price: string; quantity: number }[];
    };
    after_completion: { type: 'redirect'; redirect: { return_url: string } };
  };
};

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
    subscriptionSchedules: {
      create: (params) => stripe.subscriptionSchedules.create(params),
      update: (id, params) => stripe.subscriptionSchedules.update(id, params),
      release: (id) => stripe.subscriptionSchedules.release(id),
    },
    webhooks: {
      constructEvent: (payload, header, secret) =>
        stripe.webhooks.constructEvent(payload, header, secret),
    },
  };
}
