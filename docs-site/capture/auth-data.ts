/**
 * auth の撮影に使うデータ。
 * ユーザーと Stripe の状態は、偽のサーバー (auth-fake-server.cjs) に画面ごとに入れ替える。
 * 画面の日時は撮影の固定時刻に揃うが、プランの画面はサーバー側で実時間の「今」と比べるため、
 * Stripe の契約の期間は十分先の日付に固定する。
 */

/** 偽のサーバー (DynamoDB と Stripe を兼ねる) を待ち受けるポート */
export const FAKE_PORT = 43203;
export const FAKE_URL = `http://127.0.0.1:${FAKE_PORT}`;
/** auth の web が読むテーブル名。環境変数 `DYNAMODB_TABLE_NAME` と揃える */
export const USERS_TABLE = 'auth-users-capture';
/** 撮影用のセッションのユーザー ID。プランの画面は、この ID のユーザーを読む */
export const SESSION_USER_ID = 'test-user-id';

export interface SeedRoleGrant {
  grantId: string;
  roleId: string;
  source: 'manual' | 'stripe';
  sourceRef?: string;
  expiresAt?: number;
  revokedAt?: number;
  grantedBy?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SeedUser {
  userId: string;
  googleId: string;
  email: string;
  name: string;
  roles: string[];
  roleGrants?: SeedRoleGrant[];
  stripeCustomerId?: string;
  createdAt: number;
  updatedAt: number;
  lastLoginAt?: number;
}

const CREATED_AT = Date.parse('2025-06-01T00:00:00Z');
const UPDATED_AT = Date.parse('2026-02-01T00:00:00Z');
/** 日本時間のその日の終わり (23:59:59.999) */
const endOfJstDay = (date: string): number => Date.parse(`${date}T23:59:59.999+09:00`);

export function user(partial: Partial<SeedUser> & Pick<SeedUser, 'userId' | 'name'>): SeedUser {
  return {
    googleId: `g-${partial.userId}`,
    email: `${partial.userId}@example.com`,
    roles: [],
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    lastLoginAt: UPDATED_AT,
    ...partial,
  };
}

/** ユーザー一覧に並べる利用者 */
export const LIST_USERS: SeedUser[] = [
  user({
    userId: 'u-001',
    name: '山田 太郎',
    email: 'taro.yamada@example.com',
    roles: ['admin'],
  }),
  user({
    userId: 'u-002',
    name: '佐藤 花子',
    email: 'hanako.sato@example.com',
    roles: ['user-manager', 'stock-user'],
  }),
  user({
    userId: 'u-003',
    name: '鈴木 一郎',
    email: 'ichiro.suzuki@example.com',
    roles: [],
  }),
  user({
    userId: 'u-004',
    name: '高橋 美咲',
    email: 'misaki.takahashi-with-a-very-long-address@example.com',
    roles: ['livetalk-user', 'quick-clip-standard', 'billing-tester'],
  }),
];

/** 課金の権利の状態がそろった利用者 (ユーザー編集画面の通常表示) */
export const EDIT_USER: SeedUser = user({
  userId: 'u-002',
  name: '佐藤 花子',
  email: 'hanako.sato@example.com',
  roles: ['user-manager'],
  stripeCustomerId: 'cus_capture_0002',
  roleGrants: [
    {
      grantId: 'g-stripe-1',
      roleId: 'quick-clip-pro',
      source: 'stripe',
      sourceRef: 'sub_capture_0002',
      expiresAt: endOfJstDay('2026-03-18'),
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    },
    {
      grantId: 'g-manual-1',
      roleId: 'livetalk-standard',
      source: 'manual',
      sourceRef: '支援サービスでの支援 (3 月分)',
      expiresAt: endOfJstDay('2026-04-30'),
      grantedBy: 'u-001',
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    },
    {
      grantId: 'g-manual-2',
      roleId: 'quick-clip-standard',
      source: 'manual',
      sourceRef: '試用期間',
      expiresAt: endOfJstDay('2025-12-31'),
      grantedBy: 'u-001',
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    },
    {
      grantId: 'g-manual-3',
      roleId: 'livetalk-standard',
      source: 'manual',
      expiresAt: endOfJstDay('2026-06-30'),
      revokedAt: Date.parse('2026-01-15T00:00:00Z'),
      grantedBy: 'u-001',
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
    },
  ],
});

/** 課金の権利も Stripe の顧客も持たない利用者 */
export const PLAIN_USER: SeedUser = user({
  userId: 'u-003',
  name: '鈴木 一郎',
  email: 'ichiro.suzuki@example.com',
  roles: ['stock-viewer'],
});

// ---- Stripe (プランの画面) ----

/** 契約の請求期間の終わり。サーバーの実時間より十分先にして、権利が切れた扱いにならないようにする */
const PERIOD_END_ISO = '2035-03-15T00:00:00Z';
const PERIOD_END_SEC = Date.parse(PERIOD_END_ISO) / 1000;
/** 権利の期限は請求期間の終わり + 3 日 (auth-core の猶予) */
const GRACE_MS = 3 * 24 * 60 * 60 * 1000;

export interface SeedPrice {
  id: string;
  lookup_key: string;
  unit_amount: number;
  currency: string;
  recurring: { interval: string; interval_count: number };
  product: { id: string; description: string };
}

function price(roleId: string, amount: number, description: string, interval = 'month'): SeedPrice {
  return {
    id: `price_${roleId.replace(/-/g, '_')}`,
    lookup_key: roleId,
    unit_amount: amount,
    currency: 'jpy',
    recurring: { interval, interval_count: 1 },
    product: { id: `prod_${roleId.replace(/-/g, '_')}`, description },
  };
}

/** Stripe に価格が作られている有料の段 */
export const PRICES: SeedPrice[] = [
  price('livetalk-standard', 500, '会話の相手と、毎日の振り返りを使えます'),
  price('quick-clip-standard', 800, '動画の切り抜きを、月に決まった回数まで作れます'),
  price('quick-clip-pro', 1500, '切り抜きの回数が増え、長い動画も扱えます'),
];

const priceOf = (roleId: string): SeedPrice => {
  const found = PRICES.find((p) => p.lookup_key === roleId);
  if (!found) throw new Error(`価格がありません: ${roleId}`);
  return found;
};

export interface SeedSubscription {
  id: string;
  object: 'subscription';
  status: string;
  cancel_at_period_end: boolean;
  cancel_at: number | null;
  items: {
    data: {
      id: string;
      current_period_end: number;
      price: { id: string; lookup_key: string };
    }[];
  };
  schedule: unknown;
}

interface SubscriptionOptions {
  /** 解約を期間の終わりに予約している */
  canceling?: boolean;
  /** 次の期間から切り替わる価格 (下げの予約) */
  scheduledTo?: string;
}

export function subscription(
  id: string,
  roleId: string,
  options: SubscriptionOptions = {}
): SeedSubscription {
  const current = priceOf(roleId);
  return {
    id,
    object: 'subscription',
    status: 'active',
    cancel_at_period_end: options.canceling === true,
    cancel_at: null,
    items: {
      data: [
        {
          id: `si_${id}`,
          current_period_end: PERIOD_END_SEC,
          price: { id: current.id, lookup_key: roleId },
        },
      ],
    },
    schedule: options.scheduledTo
      ? {
          id: `sub_sched_${id}`,
          status: 'active',
          phases: [
            { start_date: PERIOD_END_SEC - 2_592_000, items: [{ price: current.id }] },
            { start_date: PERIOD_END_SEC, items: [{ price: priceOf(options.scheduledTo).id }] },
          ],
        }
      : null,
  };
}

/**
 * 契約に合う Stripe 由来の権利。プランの画面を開くと、契約と権利の差が同期されて書き込みが起きる。
 * 偽のサーバーは書き込みを受けないので、あらかじめ同期後と同じ権利を持たせておく。
 */
export function stripeGrant(sub: SeedSubscription): SeedRoleGrant {
  const item = sub.items.data[0];
  return {
    grantId: `g-${sub.id}`,
    roleId: item.price.lookup_key,
    source: 'stripe',
    sourceRef: sub.id,
    expiresAt: item.current_period_end * 1000 + GRACE_MS,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  };
}

/** プランの画面を見る利用者 (セッションのユーザー) */
export function planUser(options: {
  subscriptions?: SeedSubscription[];
  manualGrants?: SeedRoleGrant[];
}): SeedUser {
  const subscriptions = options.subscriptions ?? [];
  const grants = [...subscriptions.map(stripeGrant), ...(options.manualGrants ?? [])];
  return user({
    userId: SESSION_USER_ID,
    name: 'Test User',
    email: 'test@example.com',
    roles: [],
    ...(subscriptions.length > 0 ? { stripeCustomerId: 'cus_capture_plan' } : {}),
    ...(grants.length > 0 ? { roleGrants: grants } : {}),
  });
}

/** 手動で付いた課金の権利 (期限つき) */
export function manualGrant(roleId: string, date: string): SeedRoleGrant {
  return {
    grantId: `g-manual-${roleId}`,
    roleId,
    source: 'manual',
    expiresAt: endOfJstDay(date),
    grantedBy: 'u-001',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  };
}

export interface FakeState {
  users: SeedUser[];
  stripe?: {
    pricesFail?: boolean;
    prices?: SeedPrice[];
    subscriptions?: SeedSubscription[];
  };
}

/** 偽のサーバーの状態を入れ替える */
export async function setFakeState(state: FakeState): Promise<void> {
  const response = await fetch(`${FAKE_URL}/__state`, {
    method: 'POST',
    body: JSON.stringify(state),
  });
  if (!response.ok) {
    throw new Error(`偽のサーバーの状態の入れ替えに失敗しました: ${response.status}`);
  }
}
