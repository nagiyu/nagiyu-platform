import type { Page } from '@playwright/test';
import type { Scenario, ServiceCapture } from './types';
import {
  BROKEN_EVENT,
  DETAIL_EVENT,
  ERROR_EVENTS_TABLE,
  FAKE_DDB_PORT,
  FAKE_DDB_URL,
  LIST_EVENTS,
  MANY_EVENTS,
  seedErrorEvents,
} from './admin-data';

/**
 * admin の撮影シナリオ。画面ごとに、カードで紹介する状態を撮る。
 * 状態を足したら、カードの「画面の見た目」にも同じ名前で足す。
 *
 * admin はインメモリ DB の切り替えを持たず、エラー履歴は DynamoDB から読む。
 * そのため偽の DynamoDB を補助のプロセスとして起動し、シナリオから履歴を投入する。
 * 履歴の時刻は固定で、一覧の期間は `period=all` で絞らずに表示する。
 */

/** 通知の権限 (`notifications:write`) も履歴の権限 (`errors:read`) も持たないロール */
const NO_PERMISSION_ROLES = ['user-manager'];
/** 公開されている Web Push のサンプル用の公開鍵。形式が正しければ値は何でもよい */
const SAMPLE_VAPID_PUBLIC_KEY =
  'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';

const detailPath = (event: { eventId: string; serviceId: string; occurredAt: number }): string =>
  `/errors/${event.eventId}?at=${event.occurredAt}&serviceId=${event.serviceId}`;

/** 描画が落ち着くまで待つ。待つ対象のテキストを明示する */
async function ready(page: Page, text: string): Promise<void> {
  await page.getByText(text, { exact: false }).first().waitFor();
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
}

/**
 * ブラウザの Push 購読の部品を差し替える。
 * ヘッドレスの Chromium は通知の許可ダイアログを出せず、Service Worker も使えないため。
 */
async function mockPush(
  page: Page,
  permission: 'granted' | 'denied' | 'unsupported'
): Promise<void> {
  await page.addInitScript((mode: string) => {
    if (mode === 'unsupported') {
      delete (window as unknown as { PushManager?: unknown }).PushManager;
      return;
    }
    const subscription = {
      endpoint: 'https://push.example.com/send/capture',
      toJSON() {
        return {
          endpoint: this.endpoint,
          keys: { p256dh: 'p256dh-capture', auth: 'auth-capture' },
        };
      },
    };
    const registration = {
      pushManager: { getSubscription: async () => null, subscribe: async () => subscription },
    };
    Object.defineProperty(window, 'PushManager', {
      value: function PushManager() {},
      configurable: true,
    });
    Object.defineProperty(window.Notification, 'requestPermission', {
      value: async () => mode,
      configurable: true,
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        getRegistration: async () => registration,
        register: async () => registration,
        ready: Promise.resolve(registration),
      },
      configurable: true,
    });
  }, permission);
  await page.route('**/api/notify/vapid-key', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ publicKey: SAMPLE_VAPID_PUBLIC_KEY }),
    })
  );
}

const dashboard: Scenario = {
  screen: 'dashboard',
  async run(ctx) {
    const enable = (page: Page) => page.getByRole('button', { name: '通知を有効にする' });

    // 通常表示 (admin ロール: 通知設定とエラー履歴のカードが出る)
    let page = await ctx.freshPage();
    await page.goto('/dashboard');
    await ready(page, 'ユーザー情報');
    await ctx.shot('default');

    // 通知の権限・履歴の権限がないロール
    page = await ctx.freshPage({ roles: NO_PERMISSION_ROLES });
    await page.goto('/dashboard');
    await ready(page, 'ユーザー情報');
    await ctx.shot('no-permission');

    // 通知を有効にできた
    page = await ctx.freshPage();
    await mockPush(page, 'granted');
    await page.route('**/api/notify/subscribe', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, subscriptionId: 'sub-capture' }),
      })
    );
    await page.goto('/dashboard');
    await ready(page, 'ユーザー情報');
    await enable(page).click();
    await page.getByText('通知を有効化しました').waitFor();
    await ctx.shot('notify-enabled');

    // ブラウザで通知を拒否した
    page = await ctx.freshPage();
    await mockPush(page, 'denied');
    await page.goto('/dashboard');
    await ready(page, 'ユーザー情報');
    await enable(page).click();
    await page.getByText('通知が拒否されました').waitFor();
    await ctx.shot('notify-denied');

    // ブラウザが Push に対応していない
    page = await ctx.freshPage();
    await mockPush(page, 'unsupported');
    await page.goto('/dashboard');
    await ready(page, 'ユーザー情報');
    await enable(page).click();
    await page.getByText('このブラウザはプッシュ通知に対応していません').waitFor();
    await ctx.shot('notify-unsupported');

    // 購読の登録 API が失敗した
    page = await ctx.freshPage();
    await mockPush(page, 'granted');
    await page.route('**/api/notify/subscribe', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'INTERNAL_ERROR',
          message: 'サブスクリプション処理に失敗しました',
        }),
      })
    );
    await page.goto('/dashboard');
    await ready(page, 'ユーザー情報');
    await enable(page).click();
    await page.getByText('サブスクリプションの登録に失敗しました').waitFor();
    await ctx.shot('notify-failed');
  },
};

const errors: Scenario = {
  screen: 'errors',
  async run(ctx) {
    await seedErrorEvents(LIST_EVENTS);

    // 既定の期間 (直近 24 時間) に履歴がない
    let page = await ctx.freshPage();
    await page.goto('/errors');
    await ready(page, 'エラー履歴がありません');
    await ctx.shot('empty');

    // 通常表示 (期間は指定なし)
    page = await ctx.freshPage();
    await page.goto('/errors?period=all');
    await ready(page, '勉強バッチ: 致命的エラー');
    await ctx.shot('default');

    // サービス ID で絞り込んだ
    page = await ctx.freshPage();
    await page.goto('/errors?serviceId=livetalk-batch&period=all');
    await ready(page, 'livetalk-batch-acquire-errors-dev (ALARM)');
    await ctx.shot('filtered');

    // 権限がない
    page = await ctx.freshPage({ roles: NO_PERMISSION_ROLES });
    await page.goto('/errors');
    await ready(page, 'アクセス権限がありません');
    await ctx.shot('access-denied');

    // 履歴が 1 ページに収まらない (50 件を超える): 末尾の「次のページ」を写す
    await seedErrorEvents(MANY_EVENTS);
    page = await ctx.freshPage();
    await page.goto('/errors?period=all');
    await ready(page, '次のページ');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await ctx.shot('next-page', { viewportOnly: true });

    // 履歴に解釈できない項目がある (一覧の取得が例外になる)
    await seedErrorEvents([...LIST_EVENTS, BROKEN_EVENT]);
    page = await ctx.freshPage();
    await page.goto('/errors?period=all');
    await ready(page, 'エラーが発生しました');
    await ctx.shot('fetch-error');
  },
};

const errorDetail: Scenario = {
  screen: 'error-detail',
  async run(ctx) {
    await seedErrorEvents(LIST_EVENTS);

    // 通常表示 (CloudWatch Alarm 由来。コンテキストは JSON を整形して出す)
    let page = await ctx.freshPage();
    await page.goto(detailPath(DETAIL_EVENT));
    await ready(page, 'コンテキスト');
    await ctx.shot('default');

    // 指定した履歴がない
    page = await ctx.freshPage();
    await page.goto(
      `/errors/00000000-0000-4000-8000-000000000000?at=${DETAIL_EVENT.occurredAt}&serviceId=${DETAIL_EVENT.serviceId}`
    );
    await ready(page, 'ページが見つかりません');
    await ctx.shot('not-found');

    // 権限がない
    page = await ctx.freshPage({ roles: NO_PERMISSION_ROLES });
    await page.goto(detailPath(DETAIL_EVENT));
    await ready(page, 'アクセス権限がありません');
    await ctx.shot('access-denied');
  },
};

export const admin: ServiceCapture = {
  service: 'admin',
  // 要件はスマホファーストで、デスクトップ (1920x1080 基準) とタブレットにも対応する
  devices: ['mobile', 'desktop'],
  server: {
    cwd: 'services/admin/web',
    build: ['npm', 'run', 'build'],
    command: ['npm', 'run', 'start', '--'],
    port: 3200,
    healthPath: '/api/health',
    envFile: 'services/admin/web/.env.test',
    requiredBuilds: [
      'libs/ui/dist',
      'libs/nextjs/dist',
      'libs/aws/dist',
      'libs/react/dist',
      'libs/browser/dist',
      'services/admin/core/dist',
    ],
    // 履歴の置き場所を、実際の AWS ではなく偽の DynamoDB に向ける。鍵はダミー
    extraEnv: {
      AWS_ENDPOINT_URL_DYNAMODB: FAKE_DDB_URL,
      AWS_REGION: 'us-east-1',
      AWS_ACCESS_KEY_ID: 'capture',
      AWS_SECRET_ACCESS_KEY: 'capture',
      AWS_SESSION_TOKEN: '',
      AWS_PROFILE: '',
      ERROR_EVENTS_TABLE_NAME: ERROR_EVENTS_TABLE,
      DYNAMODB_TABLE_NAME: 'admin-capture',
      APP_URL: 'http://localhost:3200',
    },
    companions: [
      {
        command: ['node', '.claude/skills/exploratory-test/scripts/fake-aws/admin-fake-ddb.js'],
        env: { FAKE_DDB_PORT: String(FAKE_DDB_PORT) },
        healthUrl: `${FAKE_DDB_URL}/__dump`,
        requiredFiles: ['.claude/skills/exploratory-test/scripts/fake-aws/admin-fake-ddb.js'],
      },
    ],
  },
  defaultRoles: ['admin'],
  fixedTime: '2026-02-28T01:30:00Z',
  scenarios: [dashboard, errors, errorDetail],
};
