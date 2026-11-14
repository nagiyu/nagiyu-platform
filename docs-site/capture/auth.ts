import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import type { Scenario, ServiceCapture } from './types';
import {
  EDIT_USER,
  FAKE_PORT,
  FAKE_URL,
  LIST_USERS,
  PLAIN_USER,
  PRICES,
  USERS_TABLE,
  SESSION_USER_ID,
  manualGrant,
  planUser,
  setFakeState,
  subscription,
} from './auth-data';

/**
 * auth の撮影シナリオ。画面ごとに、カードで紹介する状態を撮る。
 * 状態を足したら、カードの「画面の見た目」にも同じ名前で足す。
 *
 * auth はインメモリ DB にデータを入れる手段を持たないため、偽のサーバーを補助のプロセスとして起動する。
 * ユーザーは偽の DynamoDB から、プランの画面の価格と契約は偽の Stripe から読ませる。
 * 外部の認証プロバイダ (Google) の画面は撮らない。
 */

/** `users:read` と `roles:assign` を持つロール */
const ADMIN_ROLES = ['admin'];
/** `users:read` だけを持ち、ロールの割り当てはできないロール */
const READ_ONLY_ROLES = ['user-manager'];
/** ユーザー管理の権限を持たないロール */
const NO_PERMISSION_ROLES = ['stock-viewer'];
/** 本番以外の環境で申し込みを始められるロール */
const BILLING_TESTER_ROLES = ['billing-tester'];

/** 描画が落ち着くまで待つ。待つ対象のテキストを明示する */
async function ready(page: Page, text: string): Promise<void> {
  await page.getByText(text, { exact: false }).first().waitFor();
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
}

async function mockJson(page: Page, pattern: string, body: unknown, status = 200): Promise<void> {
  await page.route(pattern, (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  );
}

/** 狭い画面では表が横にはみ出すので、右端 (ロールと操作の列) までスクロールして写す */
async function scrollTableToEnd(page: Page): Promise<void> {
  await page.evaluate(() => {
    const container = document.querySelector('.MuiTableContainer-root');
    if (container) container.scrollLeft = container.scrollWidth;
  });
}

const signin: Scenario = {
  screen: 'signin',
  async run(ctx) {
    const page = await ctx.freshPage();
    await page.goto('/signin');
    await ready(page, 'Google でサインイン');
    await ctx.shot('default');
  },
};

const authError: Scenario = {
  screen: 'auth-error',
  async run(ctx) {
    const states: [state: string, query: string, text: string][] = [
      ['configuration', '?error=Configuration', 'サーバー設定に問題があります'],
      ['access-denied', '?error=AccessDenied', 'アクセスが拒否されました'],
      ['verification', '?error=Verification', '認証トークンの有効期限が切れています'],
      ['default', '?error=Unknown', '認証中にエラーが発生しました'],
    ];
    for (const [state, query, text] of states) {
      const page = await ctx.freshPage();
      await page.goto(`/auth/error${query}`);
      await ready(page, text);
      await ctx.shot(state);
    }
  },
};

const signout: Scenario = {
  screen: 'signout',
  async run(ctx) {
    // 通常表示 (CSRF トークンを取れたので、サインアウトを押せる)
    let page = await ctx.freshPage();
    await page.goto('/auth/signout');
    await page.locator('button:not([disabled])', { hasText: 'サインアウト' }).waitFor();
    await ctx.shot('default');

    // CSRF トークンを取れなかった
    page = await ctx.freshPage();
    await page.route('**/api/auth/csrf', (route) => route.abort());
    await page.goto('/auth/signout');
    await ready(page, 'サインアウトの準備に失敗しました');
    await ctx.shot('csrf-error');
  },
};

const dashboard: Scenario = {
  screen: 'dashboard',
  async run(ctx) {
    // 通常表示 (admin: ユーザー管理への導線が出る)
    let page = await ctx.freshPage({ roles: ADMIN_ROLES });
    await page.goto('/dashboard');
    await ready(page, 'ユーザー情報');
    await ctx.shot('default');

    // ユーザー管理の権限がない (管理機能のカードが出ない)
    page = await ctx.freshPage({ roles: NO_PERMISSION_ROLES });
    await page.goto('/dashboard');
    await ready(page, 'ユーザー情報');
    await ctx.shot('no-admin-menu');
  },
};

const users: Scenario = {
  screen: 'users',
  async run(ctx) {
    await setFakeState({ users: LIST_USERS });

    // 通常表示 (roles:assign を持つので「編集」が出る)
    let page = await ctx.freshPage({ roles: ADMIN_ROLES });
    await page.goto('/dashboard/users');
    await ready(page, '山田 太郎');
    await scrollTableToEnd(page);
    await ctx.shot('default');

    // roles:assign を持たない (「編集」が出ない)
    page = await ctx.freshPage({ roles: READ_ONLY_ROLES });
    await page.goto('/dashboard/users');
    await ready(page, '山田 太郎');
    await scrollTableToEnd(page);
    await ctx.shot('read-only');

    // 一覧の取得に失敗した
    page = await ctx.freshPage({ roles: ADMIN_ROLES });
    await mockJson(page, '**/api/users?*', { error: 'ユーザー一覧の取得に失敗しました' }, 500);
    await page.goto('/dashboard/users');
    await ready(page, 'ユーザー一覧の取得に失敗しました');
    await ctx.shot('fetch-error');

    // 権限がない
    page = await ctx.freshPage({ roles: NO_PERMISSION_ROLES });
    await page.goto('/dashboard/users');
    await ready(page, 'アクセス権限がありません');
    await ctx.shot('access-denied');

    // ユーザーがいない
    await setFakeState({ users: [] });
    page = await ctx.freshPage({ roles: ADMIN_ROLES });
    await page.goto('/dashboard/users');
    await ready(page, 'ユーザーが見つかりませんでした');
    await ctx.shot('empty');
  },
};

const userEdit: Scenario = {
  screen: 'user-edit',
  async run(ctx) {
    const editPath = (userId: string) => `/dashboard/users/${userId}/edit`;
    await setFakeState({ users: [EDIT_USER, PLAIN_USER] });

    // 通常表示 (手動と Stripe の権利、有効・期限切れ・取り消し、Stripe の顧客との対応)
    let page = await ctx.freshPage({ roles: ADMIN_ROLES });
    await page.goto(editPath(EDIT_USER.userId));
    await ready(page, '課金の権利');
    await ctx.shot('default');

    // 権利も Stripe の顧客も持たない
    page = await ctx.freshPage({ roles: ADMIN_ROLES });
    await page.goto(editPath(PLAIN_USER.userId));
    await ready(page, '課金の権利はありません');
    await ctx.shot('no-grants');

    // 保存前の変更 (期限の変更・取り消し・追加)
    page = await ctx.freshPage({ roles: ADMIN_ROLES });
    await page.goto(editPath(EDIT_USER.userId));
    await ready(page, '課金の権利');
    const rows = page.getByTestId('grant-row');
    const extendRow = rows.filter({ hasText: '支援サービスでの支援' });
    await extendRow.getByRole('button', { name: '期限の変更' }).click();
    await extendRow.getByLabel('新しい期限').fill('2026-08-31');
    await extendRow.getByRole('button', { name: '決定' }).click();
    await rows.filter({ hasText: '試用期間' }).getByRole('button', { name: '取り消し' }).click();
    await page
      .getByRole('group', { name: '課金の権利の追加' })
      .getByLabel('ロール')
      .selectOption('quick-clip-pro');
    await page.locator('#grant-add-date').fill('2026-12-31');
    await page.getByRole('group', { name: '課金の権利の追加' }).getByLabel('メモ').fill('3 か月分');
    await page.getByRole('button', { name: '追加', exact: true }).click();
    await page.getByText('追加予定').waitFor();
    await ctx.shot('pending-changes');

    // 追加の入力が足りない (ロール未選択)
    page = await ctx.freshPage({ roles: ADMIN_ROLES });
    await page.goto(editPath(EDIT_USER.userId));
    await ready(page, '課金の権利');
    await page.getByRole('button', { name: '追加', exact: true }).click();
    await ready(page, 'ロールを選択してください');
    await ctx.shot('add-error');

    // Stripe の顧客との対応を外す確認
    page = await ctx.freshPage({ roles: ADMIN_ROLES });
    await page.goto(editPath(EDIT_USER.userId));
    await ready(page, '課金の権利');
    await page.getByRole('button', { name: '顧客との対応を外す' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await ctx.shot('unlink-dialog', { around: dialog, padding: 24 });

    // 保存に失敗した (他の更新と競合)
    page = await ctx.freshPage({ roles: ADMIN_ROLES });
    await mockJson(
      page,
      '**/api/users/*/roles',
      { error: '他の更新と競合しました。再読み込みしてください' },
      409
    );
    await page.goto(editPath(EDIT_USER.userId));
    await ready(page, '課金の権利');
    await page.getByRole('button', { name: '保存' }).click();
    await ready(page, '他の更新と競合しました');
    await ctx.shot('save-error');

    // 存在しないユーザー
    page = await ctx.freshPage({ roles: ADMIN_ROLES });
    await page.goto(editPath('u-unknown'));
    await ready(page, 'ユーザーが見つかりません');
    await ctx.shot('not-found');

    // 権限がない (users:read だけでは開けない)
    page = await ctx.freshPage({ roles: READ_ONLY_ROLES });
    await page.goto(editPath(EDIT_USER.userId));
    await ready(page, 'アクセス権限がありません');
    await ctx.shot('access-denied');
  },
};

const plans: Scenario = {
  screen: 'plans',
  async run(ctx) {
    const [livetalkStandard, quickClipStandard, quickClipPro] = [
      'livetalk-standard',
      'quick-clip-standard',
      'quick-clip-pro',
    ];
    const open = async (roles: string[], path = '/plans'): Promise<Page> => {
      const page = await ctx.freshPage({ roles });
      await page.goto(path);
      await page.getByRole('heading', { name: 'プラン', level: 1 }).waitFor();
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
      return page;
    };

    // Stripe に価格が無く、出せる段が無い (準備中)
    await setFakeState({ users: [], stripe: { prices: [] } });
    await open(BILLING_TESTER_ROLES);
    await ctx.shot('preparing');

    // ユーザーが DB に無い扱い (ログインして申し込む)
    await setFakeState({ users: [], stripe: { prices: PRICES } });
    await open(BILLING_TESTER_ROLES);
    await ctx.shot('guest');

    // 本番以外で、申し込みを始められないロール
    await open(ADMIN_ROLES);
    await ctx.shot('checkout-restricted');

    // 契約のない利用者 (申し込む)
    await setFakeState({ users: [planUser({})], stripe: { prices: PRICES } });
    await open(BILLING_TESTER_ROLES);
    await ctx.shot('not-subscribed');

    // 契約中 (次の更新日。同じサービスの他の段には「この段に変える」、契約の管理)
    const standardSub = subscription('sub_capture_standard', quickClipStandard);
    await setFakeState({
      users: [planUser({ subscriptions: [standardSub] })],
      stripe: { prices: PRICES, subscriptions: [standardSub] },
    });
    await open(BILLING_TESTER_ROLES);
    await ctx.shot('subscribed');

    // 下げの確認ダイアログ
    const proSub = subscription('sub_capture_pro', quickClipPro);
    await setFakeState({
      users: [planUser({ subscriptions: [proSub] })],
      stripe: { prices: PRICES, subscriptions: [proSub] },
    });
    let page = await open(BILLING_TESTER_ROLES);
    await page.getByRole('button', { name: 'この段に変える' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await ctx.shot('downgrade-dialog', { around: dialog, padding: 24 });

    // 下げの予約中 (予約の内容と、予約を取り消す)
    const scheduledSub = subscription('sub_capture_scheduled', quickClipPro, {
      scheduledTo: quickClipStandard,
    });
    await setFakeState({
      users: [planUser({ subscriptions: [scheduledSub] })],
      stripe: { prices: PRICES, subscriptions: [scheduledSub] },
    });
    await open(BILLING_TESTER_ROLES);
    await ctx.shot('downgrade-scheduled');

    // 解約の予約中 (終了日。他の段への切り替えは出ない)
    const cancelingSub = subscription('sub_capture_canceling', quickClipStandard, {
      canceling: true,
    });
    await setFakeState({
      users: [planUser({ subscriptions: [cancelingSub] })],
      stripe: { prices: PRICES, subscriptions: [cancelingSub] },
    });
    await open(BILLING_TESTER_ROLES);
    await ctx.shot('canceling');

    // 支払いの遅れ (理由と案内。他の段への切り替えは出ない)
    const pastDueSub = {
      ...subscription('sub_capture_past_due', quickClipStandard),
      status: 'past_due',
    };
    await setFakeState({
      users: [planUser({ subscriptions: [pastDueSub] })],
      stripe: { prices: PRICES, subscriptions: [pastDueSub] },
    });
    await open(BILLING_TESTER_ROLES);
    await ctx.shot('payment-past-due');

    // 運営による付与 (Stripe の契約とは別に表示)
    await setFakeState({
      users: [planUser({ manualGrants: [manualGrant(livetalkStandard, '2035-04-30')] })],
      stripe: { prices: PRICES },
    });
    await open(BILLING_TESTER_ROLES);
    await ctx.shot('manual-grant');

    // 価格を取得できなかった
    await setFakeState({ users: [planUser({})], stripe: { pricesFail: true } });
    await open(BILLING_TESTER_ROLES);
    await ctx.shot('price-unavailable');

    // 申し込みの準備に失敗した
    await setFakeState({ users: [planUser({})], stripe: { prices: PRICES } });
    page = await open(BILLING_TESTER_ROLES);
    await mockJson(page, '**/api/billing/checkout', { error: '申し込みの準備に失敗しました' }, 500);
    await page.getByRole('button', { name: '申し込む' }).first().click();
    await ready(page, '申し込みの準備に失敗しました');
    await ctx.shot('action-error');
  },
};

const refresh: Scenario = {
  screen: 'refresh',
  async run(ctx) {
    // 遷移先への移動を中断し、移動の直前の表示を写す
    const hold = async (page: Page): Promise<void> => {
      await page.route(
        (url) => url.pathname === '/' || url.pathname === '/dashboard',
        (route) =>
          route.request().isNavigationRequest() ? route.abort('aborted') : route.continue()
      );
    };

    // 権限を更新している
    let page = await ctx.freshPage();
    await hold(page);
    await page.route('**/api/auth/session', (route) =>
      route.request().method() === 'POST' ? undefined : route.continue()
    );
    await page.goto('/refresh');
    await ready(page, 'アクセス権限を更新しています');
    await ctx.shot('refreshing', { viewportOnly: true });

    // 更新できた (遷移先へ移る)
    page = await ctx.freshPage();
    await hold(page);
    await page.route('**/api/auth/session', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
        : route.continue()
    );
    await page.goto('/refresh');
    await ready(page, 'アクセス権限を更新しました');
    await ctx.shot('done', { viewportOnly: true });
  },
};

const tokushoho: Scenario = {
  screen: 'tokushoho',
  async run(ctx) {
    const page = await ctx.freshPage();
    await page.goto('/legal/tokushoho');
    await ready(page, '特定商取引法に基づく表記');
    await ctx.shot('default');
  },
};

export const auth: ServiceCapture = {
  service: 'auth',
  // 要件はデスクトップ (1920x1080 基準) と 375px 以上のモバイルの両方で、E2E もスマホとデスクトップで流す
  devices: ['mobile', 'desktop'],
  server: {
    cwd: 'services/auth/web',
    build: ['npm', 'run', 'build'],
    command: ['npm', 'run', 'start', '--'],
    port: 3203,
    healthPath: '/api/health',
    envFile: 'services/auth/web/.env.test',
    requiredBuilds: [
      'libs/ui/dist',
      'libs/nextjs/dist',
      'libs/aws/dist',
      'libs/common/dist',
      'services/auth/core/dist',
    ],
    extraEnv: {
      AUTH_URL: 'http://localhost:3203',
      NEXTAUTH_URL: 'http://localhost:3203',
      AUTH_TRUST_HOST: 'true',
      TEST_USER_ID: SESSION_USER_ID,
      // ユーザーの置き場所と Stripe を、実物ではなく偽のサーバーに向ける。鍵はダミー
      AWS_ENDPOINT_URL_DYNAMODB: FAKE_URL,
      AWS_REGION: 'us-east-1',
      AWS_ACCESS_KEY_ID: 'capture',
      AWS_SECRET_ACCESS_KEY: 'capture',
      AWS_SESSION_TOKEN: '',
      AWS_PROFILE: '',
      DYNAMODB_TABLE_NAME: USERS_TABLE,
      STRIPE_SECRET_KEY: 'capture-dummy-stripe-key',
      STRIPE_WEBHOOK_SECRET: 'capture-dummy-webhook-key',
      CAPTURE_FAKE_PORT: String(FAKE_PORT),
      NODE_OPTIONS: [
        process.env.NODE_OPTIONS,
        `--require ${resolve(__dirname, 'auth-capture-preload.cjs')}`,
      ]
        .filter(Boolean)
        .join(' '),
    },
    companions: [
      {
        command: ['node', 'docs-site/capture/auth-fake-server.cjs'],
        env: { CAPTURE_FAKE_PORT: String(FAKE_PORT) },
        healthUrl: `${FAKE_URL}/__health`,
        requiredFiles: ['docs-site/capture/auth-fake-server.cjs'],
      },
    ],
  },
  defaultRoles: ADMIN_ROLES,
  fixedTime: '2026-02-28T01:30:00Z',
  scenarios: [signin, authError, signout, dashboard, users, userEdit, plans, refresh, tokushoho],
};
