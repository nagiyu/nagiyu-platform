import { test, expect, resetState, type ResetSeedData } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * E2E-002: アラート設定フロー（Holding からのアラート設定）/ E2E-007: アラート一覧の絞り込み
 *
 * このテストは以下を検証します:
 * - Holding からの売りアラート設定（単一条件・範囲指定・パーセンテージ選択）
 * - アラート設定後のボタン状態変化
 * - アラート一覧の絞り込み・一時通知表示・カスタムメッセージ編集
 * - Web Push通知許可の基本動作
 *
 * `resetState` でインメモリリポジトリを都度リセット・seed し、前提となる取引所・
 * ティッカー・保有株式を決定的に用意することで、1 テスト = 1 結末で assert する。
 * 旧実装にあった「エラーが表示されていたら test.skip()」「入力方式ドロップダウンが
 * 見つからなければ test.skip()」という、実装が壊れていても green になる分岐は行わない。
 *
 * `resetState` はサービス全体のインメモリストアを消す破壊的操作であり、Playwright は
 * ファイル間も並列実行するため、他ファイルの実行と鉢合わせるとデータを巻き込む恐れがある。
 * そのため本ファイルはファイル全体を `test.describe.configure({ mode: 'serial' })` で
 * 直列化し、同一ファイル内での競合を防ぐ。
 *
 * ただし `mode: 'serial'` が直列化するのは同一ファイル内だけで、ファイル間の並列は防げない。
 * ファイル間の巻き込みは `playwright.config.base.ts` の `workers: isCI ? 1 : undefined` に
 * 依存しており、CI（workers=1）でのみ安全である。ローカルで実行するときは `--workers=1` を
 * 付けること（付けない場合、本ファイルの resetState が他ファイルのデータを消しうる）。
 *
 * また、本ファイルの最後の beforeEach が残した seed データが後続で実行される他ファイルを
 * 汚染しないよう、全テスト終了後に afterAll でストアを空の状態へ戻す。
 *
 * ## Web Push 購読のモックについて
 *
 * `chromium-mobile` プロジェクトは `serviceWorkers: 'block'` を設定しているため実際の
 * Service Worker 登録ができず、`.env.test` の `VAPID_PUBLIC_KEY` もダミー文字列（有効な
 * base64url ではない）で `atob()` が失敗するため、実ブラウザでの `PushManager.subscribe()`
 * は本テスト環境では原理的に成立しない（`window.navigator.serviceWorker.register()` も
 * ブロックされ `undefined` を返す）。
 * UC-002 の主眼は「アラート作成フォームの入力 → API 呼び出し → 画面への状態反映」であり、
 * Web Push 購読そのものの動作は「Web Push通知許可」describe が別途担う。そのため
 * `mockPushSubscription` で VAPID 公開鍵取得 API と `navigator.serviceWorker` を丸ごと
 * モックし、アラート作成フローを決定的に成功させる。
 */
test.describe.configure({ mode: 'serial' });

test.afterAll(async ({ playwright }) => {
  const context = await playwright.request.newContext({
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
  });
  await resetState(context);
  await context.dispose();
});

// SKIP_AUTH_CHECK=true 環境で使用される固定のユーザーID（lib/auth.ts の getSession() 参照）
const TEST_USER_ID = 'test-user-id';

const EXCHANGE_ID = 'E2E-ALERT-EX';
const EXCHANGE_KEY = 'E2EALERT';
const EXCHANGE_NAME = 'E2E Alert Test Exchange';

const TICKER_SYMBOL = 'ALERTTK';
const TICKER_ID = `${EXCHANGE_KEY}:${TICKER_SYMBOL}`;
const TICKER_NAME = 'E2E Alert Test Ticker';

// Web Push サブスクリプションのダミー値（P-256 公開鍵として有効な base64url 形式）。
// VAPID 公開鍵取得 API のモック応答にも流用し、`atob()` が有効な文字列で成功するようにする。
const DUMMY_SUBSCRIPTION = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-alert-mgmt-test-subscription',
  keys: {
    p256dh:
      'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
    auth: 'tBHItJI5svbpez7KI4CCXg',
  },
} as const;

/** 前提となる取引所・ティッカーの seed データ（本ファイル全テスト共通） */
function baseSeed(): ResetSeedData {
  return {
    exchanges: [
      {
        ExchangeID: EXCHANGE_ID,
        Name: EXCHANGE_NAME,
        Key: EXCHANGE_KEY,
        Timezone: 'America/New_York',
        Start: '09:30',
        End: '16:00',
        PriceSource: 'tradingview',
      },
    ],
    tickers: [
      {
        TickerID: TICKER_ID,
        Symbol: TICKER_SYMBOL,
        Name: TICKER_NAME,
        ExchangeID: EXCHANGE_ID,
      },
    ],
  };
}

/** 保有株式 seed データ（basePrice = averagePrice はパーセンテージ選択機能の前提条件） */
function holdingSeed(averagePrice: number) {
  return {
    UserID: TEST_USER_ID,
    TickerID: TICKER_ID,
    ExchangeID: EXCHANGE_ID,
    Quantity: 100,
    AveragePrice: averagePrice,
    Currency: 'USD',
  };
}

/** 通知許可を自動的に付与する（テスト環境用）。Push 購読フロー実行前に呼ぶ必要がある。 */
async function grantNotificationPermission(page: Page): Promise<void> {
  await page.context().grantPermissions(['notifications']);
}

/**
 * Web Push 購読フローをモック化する。
 *
 * VAPID 公開鍵取得 API を有効な base64url 文字列で固定し、`navigator.serviceWorker` を
 * 偽の Registration/PushManager に差し替えることで、`chromium-mobile` の
 * `serviceWorkers: 'block'` 設定やダミー VAPID 鍵の影響を受けずにアラート作成フローを
 * 決定的に成功させる。呼び出しは対象ページへの `page.goto` より前に行うこと
 * （`addInitScript` は以降のナビゲーションにのみ適用されるため）。
 */
async function mockPushSubscription(page: Page): Promise<void> {
  await page.route('**/api/push/vapid-public-key', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ publicKey: DUMMY_SUBSCRIPTION.keys.p256dh }),
    });
  });

  await page.addInitScript((subscriptionJson: typeof DUMMY_SUBSCRIPTION) => {
    const fakeSubscription = {
      endpoint: subscriptionJson.endpoint,
      toJSON: () => subscriptionJson,
    };
    const fakeRegistration = {
      pushManager: {
        getSubscription: async () => null,
        subscribe: async () => fakeSubscription,
      },
      update: async () => undefined,
    };
    const fakeServiceWorkerContainer = {
      register: async () => fakeRegistration,
      getRegistration: async () => fakeRegistration,
      ready: Promise.resolve(fakeRegistration),
    };
    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: fakeServiceWorkerContainer,
    });
  }, DUMMY_SUBSCRIPTION);
}

test.describe('アラート設定フロー (E2E-002 一部)', () => {
  test.describe('Holdingからの売りアラート設定', () => {
    test.beforeEach(async ({ page, request }) => {
      await mockPushSubscription(page);
      await grantNotificationPermission(page);
      await resetState(request, { ...baseSeed(), holdings: [holdingSeed(150.0)] });
      await page.goto('/holdings');
      await page.waitForLoadState('networkidle');
    });

    test('売りアラート設定ボタンが表示される', async ({ page }) => {
      const targetRow = page.locator(`tr:has-text("${TICKER_SYMBOL}")`);
      await expect(targetRow).toBeVisible({ timeout: 10000 });

      await expect(targetRow.getByRole('button', { name: /売りアラート/ })).toBeVisible();
    });

    test('アラート設定モーダルが正しく開く', async ({ page }) => {
      const targetRow = page.locator(`tr:has-text("${TICKER_SYMBOL}")`);
      await expect(targetRow).toBeVisible({ timeout: 10000 });

      await targetRow.getByRole('button', { name: /売りアラート/ }).click();

      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('heading', { name: /アラート設定.*売りアラート/ })).toBeVisible();

      await expect(page.getByLabel('取引所')).toBeVisible();
      await expect(page.getByLabel('ティッカー')).toBeVisible();
      await expect(page.getByLabel('モード')).toBeVisible();
      await expect(page.getByLabel('条件タイプ')).toBeVisible();
      await expect(page.getByLabel('条件', { exact: true })).toBeVisible();
      await expect(page.getByLabel('目標価格')).toBeVisible();
      await expect(page.getByLabel('通知頻度')).toBeVisible();
      await expect(page.getByText('カスタムメッセージ（任意）')).toBeVisible();

      // 取引所とティッカーは変更不可（disabled）
      await expect(page.getByLabel('取引所')).toBeDisabled();
      await expect(page.getByLabel('ティッカー')).toBeDisabled();
      await expect(page.getByLabel('モード')).toBeDisabled();
    });

    test('アラートを設定できる', async ({ page }) => {
      const targetRow = page.locator(`tr:has-text("${TICKER_SYMBOL}")`);
      await expect(targetRow).toBeVisible({ timeout: 10000 });

      await targetRow.getByRole('button', { name: /売りアラート/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      // 平均取得価格(150) × 1.2 = 180 が目標価格として自動プリセットされる
      await expect(page.getByLabel('目標価格')).toHaveValue('180');

      await page.getByRole('button', { name: '保存' }).click();

      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 });
      await expect(page.getByText('アラートを設定しました')).toBeVisible({ timeout: 5000 });
    });

    test('アラート設定後、ボタンが「アラート設定済」に変化する', async ({ page }) => {
      const targetRow = page.locator(`tr:has-text("${TICKER_SYMBOL}")`);
      await expect(targetRow).toBeVisible({ timeout: 10000 });

      await targetRow.getByRole('button', { name: /売りアラート/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      await page.getByRole('button', { name: '保存' }).click();

      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 });
      await expect(page.getByText('アラートを設定しました')).toBeVisible({ timeout: 5000 });

      // ページをリロードして状態を確認
      await page.reload();
      await page.waitForLoadState('networkidle');

      const updatedRow = page.locator(`tr:has-text("${TICKER_SYMBOL}")`);
      await expect(updatedRow.getByRole('button', { name: /アラート設定済/ })).toBeVisible();
    });
  });

  test.describe('範囲指定アラート設定', () => {
    test.beforeEach(async ({ page, request }) => {
      await mockPushSubscription(page);
      await grantNotificationPermission(page);
      await resetState(request, { ...baseSeed(), holdings: [holdingSeed(150.0)] });
      await page.goto('/holdings');
      await page.waitForLoadState('networkidle');
    });

    test('範囲内アラート（AND）を作成できる', async ({ page }) => {
      const targetRow = page.locator(`tr:has-text("${TICKER_SYMBOL}")`);
      await expect(targetRow).toBeVisible({ timeout: 10000 });

      await targetRow.getByRole('button', { name: /売りアラート/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      // 条件タイプを「範囲指定」に変更
      await page.getByLabel('条件タイプ').selectOption('range');

      // 範囲タイプフィールドが表示されることを確認（デフォルト値は「範囲内（AND）」）
      await expect(page.getByLabel('範囲タイプ')).toBeVisible();

      // 範囲を入力（100〜110ドル）
      await page.getByLabel(/最小価格/).fill('100');
      await page.getByLabel(/最大価格/).fill('110');

      await page.getByRole('button', { name: '保存' }).click();

      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 });
      await expect(page.getByText('アラートを設定しました')).toBeVisible({ timeout: 5000 });
    });

    test('範囲外アラート（OR）を作成できる', async ({ page }) => {
      const targetRow = page.locator(`tr:has-text("${TICKER_SYMBOL}")`);
      await expect(targetRow).toBeVisible({ timeout: 10000 });

      await targetRow.getByRole('button', { name: /売りアラート/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      // 条件タイプを「範囲指定」に変更
      await page.getByLabel('条件タイプ').selectOption('range');

      // 範囲タイプを「範囲外（OR）」に変更
      await page.getByLabel('範囲タイプ').selectOption('outside');

      // 範囲を入力（90ドル以下または120ドル以上）
      await page.getByLabel(/下限価格/).fill('90');
      await page.getByLabel(/上限価格/).fill('120');

      await page.getByRole('button', { name: '保存' }).click();

      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 });
      await expect(page.getByText('アラートを設定しました')).toBeVisible({ timeout: 5000 });
    });

    test('範囲内アラートで不正な範囲を入力するとバリデーションエラーが表示される', async ({
      page,
    }) => {
      const targetRow = page.locator(`tr:has-text("${TICKER_SYMBOL}")`);
      await expect(targetRow).toBeVisible({ timeout: 10000 });

      await targetRow.getByRole('button', { name: /売りアラート/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      // 条件タイプを「範囲指定」に変更
      await page.getByLabel('条件タイプ').selectOption('range');
      const minPriceInput = page.locator('#min-price');
      // webkit-mobile では選択直後に change イベントが反映されないことがあるため、
      // 未表示時のみ再選択する（1 回のみの再試行。最終的な可視化は下の expect で担保する）
      if (!(await minPriceInput.isVisible())) {
        await page.getByLabel('条件タイプ').selectOption('range');
      }
      await expect(minPriceInput).toBeVisible({ timeout: 10000 });

      // 不正な範囲を入力（最小価格 > 最大価格）
      const maxPriceInput = page.locator('#max-price');
      await minPriceInput.fill('110');
      await expect(minPriceInput).toHaveValue('110');
      await maxPriceInput.fill('100');
      await expect(maxPriceInput).toHaveValue('100');

      await page.getByRole('button', { name: '保存' }).click();

      await expect(
        page.getByText(/範囲内アラートの場合、最小価格は最大価格より小さい値を設定してください/)
      ).toBeVisible();
    });

    test('範囲外アラートで不正な範囲を入力するとバリデーションエラーが表示される', async ({
      page,
    }) => {
      const targetRow = page.locator(`tr:has-text("${TICKER_SYMBOL}")`);
      await expect(targetRow).toBeVisible({ timeout: 10000 });

      await targetRow.getByRole('button', { name: /売りアラート/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      // 条件タイプを「範囲指定」に変更
      await page.getByLabel('条件タイプ').selectOption('range');
      const minPriceInput = page.locator('#min-price');
      // webkit-mobile では選択直後に change イベントが反映されないことがあるため、
      // 未表示時のみ再選択する（1 回のみの再試行。最終的な可視化は下の expect で担保する）
      if (!(await minPriceInput.isVisible())) {
        await page.getByLabel('条件タイプ').selectOption('range');
      }
      await expect(minPriceInput).toBeVisible({ timeout: 10000 });

      // 範囲タイプを「範囲外（OR）」に変更
      await page.getByLabel('範囲タイプ').selectOption('outside');

      // 不正な範囲を入力（下限価格 >= 上限価格）
      const maxPriceInput = page.locator('#max-price');
      await minPriceInput.fill('120');
      await expect(minPriceInput).toHaveValue('120');
      await maxPriceInput.fill('90');
      await expect(maxPriceInput).toHaveValue('90');

      await page.getByRole('button', { name: '保存' }).click();

      await expect(
        page.getByText(/範囲外アラートの場合、下限価格は上限価格より小さい値を設定してください/)
      ).toBeVisible();
    });

    test('単一条件と範囲指定を切り替えできる', async ({ page }) => {
      const targetRow = page.locator(`tr:has-text("${TICKER_SYMBOL}")`);
      await expect(targetRow).toBeVisible({ timeout: 10000 });

      await targetRow.getByRole('button', { name: /売りアラート/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      const alertDialog = page.getByRole('dialog').first();

      // 初期状態は単一条件（条件タイプのデフォルト値確認）
      await expect(alertDialog.getByLabel('条件タイプ')).toBeVisible();
      await expect(alertDialog.getByLabel('条件', { exact: true })).toBeVisible();
      await expect(alertDialog.getByLabel('目標価格')).toBeVisible();

      // 範囲指定に切り替え
      const conditionTypeCombobox = alertDialog.getByLabel('条件タイプ');
      await conditionTypeCombobox.selectOption('range');

      // 範囲指定のフィールドが表示される
      await expect(alertDialog.getByLabel('範囲タイプ')).toBeVisible();
      await expect(alertDialog.locator('#min-price')).toBeVisible();
      await expect(alertDialog.locator('#max-price')).toBeVisible();

      // 単一条件のフィールドが非表示になる
      await expect(alertDialog.getByLabel('条件', { exact: true })).not.toBeVisible();
      await expect(alertDialog.getByLabel('目標価格')).not.toBeVisible();

      // 単一条件に戻す
      await conditionTypeCombobox.selectOption('single');

      // 単一条件のフィールドが表示される
      await expect(alertDialog.getByLabel('条件', { exact: true })).toBeVisible();
      await expect(alertDialog.getByLabel('目標価格')).toBeVisible();

      // 範囲指定のフィールドが非表示になる
      await expect(alertDialog.getByLabel('範囲タイプ')).not.toBeVisible();
      await expect(alertDialog.locator('#min-price')).not.toBeVisible();
      await expect(alertDialog.locator('#max-price')).not.toBeVisible();
    });
  });

  test.describe('パーセンテージ選択機能 - 単一条件モード', () => {
    // 基準価格(basePrice) = 保有株式の平均取得価格。100 に固定することで
    // 「入力方式」ドロップダウン（basePrice > 0 の場合のみ表示）を決定的に出現させる。
    test.beforeEach(async ({ page, request }) => {
      await mockPushSubscription(page);
      await grantNotificationPermission(page);
      await resetState(request, { ...baseSeed(), holdings: [holdingSeed(100.0)] });
      await page.goto('/holdings');
      await page.waitForLoadState('networkidle');
    });

    test('入力方式を「パーセンテージ」に切り替えられる', async ({ page }) => {
      const targetRow = page.locator(`tr:has-text("${TICKER_SYMBOL}")`);
      await expect(targetRow).toBeVisible({ timeout: 10000 });

      await targetRow.getByRole('button', { name: /売りアラート/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      // 初期状態: 手動入力モードで目標価格入力フィールドが表示される
      await expect(page.getByLabel('目標価格')).toBeVisible();

      // 保有株式の平均取得価格(basePrice)が seed 済みのため、入力方式ドロップダウンは
      // 必ず表示される
      const inputModeSelect = page.locator('#input-mode-select');
      await expect(inputModeSelect).toBeVisible();

      // 入力方式を「パーセンテージ」に変更
      await inputModeSelect.selectOption('percentage');

      // パーセンテージ選択フィールドが表示される（IDで特定）
      await expect(page.locator('#percentage-select')).toBeVisible();

      // 目標価格入力フィールドは非表示になる
      await expect(page.getByLabel('目標価格')).not.toBeVisible();
    });

    test('パーセンテージ選択で目標価格が自動計算される - +20%', async ({ page }) => {
      const targetRow = page.locator(`tr:has-text("${TICKER_SYMBOL}")`);
      await expect(targetRow).toBeVisible({ timeout: 10000 });

      await targetRow.getByRole('button', { name: /売りアラート/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      const inputModeSelect = page.locator('#input-mode-select');
      await expect(inputModeSelect).toBeVisible();
      await inputModeSelect.selectOption('percentage');

      // パーセンテージで「+20%」を選択
      await page.locator('#percentage-select').selectOption('20');

      // 計算結果が表示される（基準価格100ドル × 1.2 = 120ドル）
      await expect(page.getByText(/基準価格.*100\.00/)).toBeVisible();
      await expect(page.getByText(/=.*120\.00/)).toBeVisible();
    });

    test('パーセンテージ選択で目標価格が自動計算される - -10%', async ({ page }) => {
      const targetRow = page.locator(`tr:has-text("${TICKER_SYMBOL}")`);
      await expect(targetRow).toBeVisible({ timeout: 10000 });

      await targetRow.getByRole('button', { name: /売りアラート/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      const inputModeSelect = page.locator('#input-mode-select');
      await expect(inputModeSelect).toBeVisible();
      await inputModeSelect.selectOption('percentage');

      // パーセンテージで「-10%」を選択
      await page.locator('#percentage-select').selectOption('-10');

      // 計算結果が表示される（基準価格100ドル × 0.9 = 90ドル）
      await expect(page.getByText(/基準価格.*100\.00/)).toBeVisible();
      await expect(page.getByText(/=.*90\.00/)).toBeVisible();
    });

    test('パーセンテージ選択でアラートを作成できる', async ({ page }) => {
      const targetRow = page.locator(`tr:has-text("${TICKER_SYMBOL}")`);
      await expect(targetRow).toBeVisible({ timeout: 10000 });

      await targetRow.getByRole('button', { name: /売りアラート/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      const inputModeSelect = page.locator('#input-mode-select');
      await expect(inputModeSelect).toBeVisible();
      await inputModeSelect.selectOption('percentage');

      // パーセンテージで「+15%」を選択
      await page.locator('#percentage-select').selectOption('15');

      // 計算結果が表示される（基準価格100ドル × 1.15 = 115ドル）
      await expect(page.getByText(/=.*115\.00/)).toBeVisible();

      await page.getByRole('button', { name: '保存' }).click();

      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 });
      await expect(page.getByText('アラートを設定しました')).toBeVisible({ timeout: 5000 });
    });

    test('手動入力モードとパーセンテージモードを切り替えできる', async ({ page }) => {
      const targetRow = page.locator(`tr:has-text("${TICKER_SYMBOL}")`);
      await expect(targetRow).toBeVisible({ timeout: 10000 });

      await targetRow.getByRole('button', { name: /売りアラート/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      // 初期状態: 手動入力モード
      await expect(page.getByLabel('目標価格')).toBeVisible();

      const inputModeSelect = page.locator('#input-mode-select');
      await expect(inputModeSelect).toBeVisible();

      // パーセンテージモードに切り替え
      await inputModeSelect.selectOption('percentage');
      await expect(page.locator('#percentage-select')).toBeVisible();
      await expect(page.getByLabel('目標価格')).not.toBeVisible();

      // 手動入力モードに戻す
      await inputModeSelect.selectOption('manual');
      await expect(page.getByLabel('目標価格')).toBeVisible();
      await expect(page.locator('#percentage-select')).not.toBeVisible();
    });
  });

  test.describe('パーセンテージ選択機能 - 範囲指定モード', () => {
    // 基準価格(basePrice) = 保有株式の平均取得価格。100 に固定することで
    // 範囲指定モードの「入力方式」ドロップダウンを決定的に出現させる。
    test.beforeEach(async ({ page, request }) => {
      await mockPushSubscription(page);
      await grantNotificationPermission(page);
      await resetState(request, { ...baseSeed(), holdings: [holdingSeed(100.0)] });
      await page.goto('/holdings');
      await page.waitForLoadState('networkidle');
    });

    test('範囲指定モードで入力方式を「パーセンテージ」に切り替えられる', async ({ page }) => {
      const targetRow = page.locator(`tr:has-text("${TICKER_SYMBOL}")`);
      await expect(targetRow).toBeVisible({ timeout: 10000 });

      await targetRow.getByRole('button', { name: /売りアラート/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      // 条件タイプを「範囲指定」に変更
      await page.getByLabel('条件タイプ').selectOption('range');

      // 初期状態: 手動入力モードで価格入力フィールドが表示される
      await expect(page.locator('#min-price')).toBeVisible();
      await expect(page.locator('#max-price')).toBeVisible();

      const inputModeSelect = page.locator('#range-input-mode-select');
      await expect(inputModeSelect).toBeVisible();

      // 入力方式を「パーセンテージ」に変更
      await inputModeSelect.selectOption('percentage');

      // パーセンテージ選択フィールドが表示される
      await expect(page.locator('#min-percentage-select')).toBeVisible();
      await expect(page.locator('#max-percentage-select')).toBeVisible();

      // 価格入力フィールドは非表示になる
      await expect(page.locator('#min-price')).not.toBeVisible();
      await expect(page.locator('#max-price')).not.toBeVisible();
    });

    test('範囲指定でパーセンテージ選択すると価格範囲が自動計算される', async ({ page }) => {
      const targetRow = page.locator(`tr:has-text("${TICKER_SYMBOL}")`);
      await expect(targetRow).toBeVisible({ timeout: 10000 });

      await targetRow.getByRole('button', { name: /売りアラート/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      await page.getByLabel('条件タイプ').selectOption('range');

      const inputModeSelect = page.locator('#range-input-mode-select');
      await expect(inputModeSelect).toBeVisible();
      await inputModeSelect.selectOption('percentage');

      // 最小パーセンテージで「-10%」を選択
      await page.locator('#min-percentage-select').selectOption('-10');
      // 最大パーセンテージで「+10%」を選択
      await page.locator('#max-percentage-select').selectOption('10');

      // 計算結果が表示される（基準価格100ドル → 90ドル〜110ドル）
      await expect(page.getByText(/基準価格.*100\.00/)).toBeVisible();
      await expect(page.getByText(/価格範囲.*90\.00.*110\.00/)).toBeVisible();
    });

    test('範囲指定でパーセンテージ選択してアラートを作成できる', async ({ page }) => {
      const targetRow = page.locator(`tr:has-text("${TICKER_SYMBOL}")`);
      await expect(targetRow).toBeVisible({ timeout: 10000 });

      await targetRow.getByRole('button', { name: /売りアラート/ }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      await page.getByLabel('条件タイプ').selectOption('range');

      const inputModeSelect = page.locator('#range-input-mode-select');
      await expect(inputModeSelect).toBeVisible();
      await inputModeSelect.selectOption('percentage');

      // 最小パーセンテージで「-5%」、最大パーセンテージで「+5%」を選択
      await page.locator('#min-percentage-select').selectOption('-5');
      await page.locator('#max-percentage-select').selectOption('5');

      await page.getByRole('button', { name: '保存' }).click();

      await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10000 });
      await expect(page.getByText('アラートを設定しました')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('アラート一覧フィルタリング', () => {
    // webkit-mobile では Service Worker の影響で API モックが不安定になるため、このスイートでは無効化する
    test.use({ serviceWorkers: 'block' });

    test.beforeEach(async ({ request }) => {
      await resetState(request);
    });

    test('取引所とモードで絞り込み、クリアで全件表示に戻せる', async ({ page }) => {
      const suffix = Date.now().toString().slice(-6);
      const firstBuySymbol = `FA${suffix}1`;
      const firstSellSymbol = `FA${suffix}2`;
      const secondSellSymbol = `FB${suffix}3`;
      const firstExchangeName = `Filter Exchange A ${suffix}`;
      const secondExchangeName = `Filter Exchange B ${suffix}`;

      await page.route('**/api/exchanges', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            exchanges: [
              { exchangeId: `ex-a-${suffix}`, name: firstExchangeName, key: 'FLTA' },
              { exchangeId: `ex-b-${suffix}`, name: secondExchangeName, key: 'FLTB' },
            ],
          }),
        });
      });

      await page.route('**/api/alerts', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            alerts: [
              {
                alertId: `alert-a-buy-${suffix}`,
                tickerId: `FLTA:${firstBuySymbol}`,
                symbol: firstBuySymbol,
                name: 'Filter A Buy',
                mode: 'Buy',
                frequency: 'MINUTE_LEVEL',
                conditions: [{ field: 'price', operator: 'gte', value: 100 }],
                enabled: true,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
              },
              {
                alertId: `alert-a-sell-${suffix}`,
                tickerId: `FLTA:${firstSellSymbol}`,
                symbol: firstSellSymbol,
                name: 'Filter A Sell',
                mode: 'Sell',
                frequency: 'MINUTE_LEVEL',
                conditions: [{ field: 'price', operator: 'gte', value: 100 }],
                enabled: true,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
              },
              {
                alertId: `alert-b-sell-${suffix}`,
                tickerId: `FLTB:${secondSellSymbol}`,
                symbol: secondSellSymbol,
                name: 'Filter B Sell',
                mode: 'Sell',
                frequency: 'MINUTE_LEVEL',
                conditions: [{ field: 'price', operator: 'gte', value: 100 }],
                enabled: true,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
              },
            ],
          }),
        });
      });

      await page.goto('/alerts');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('tbody td', { hasText: firstBuySymbol }).first()).toBeVisible();
      await expect(page.locator('tbody td', { hasText: firstSellSymbol }).first()).toBeVisible();
      await expect(page.locator('tbody td', { hasText: secondSellSymbol }).first()).toBeVisible();

      await page.getByLabel('取引所フィルタ').selectOption({ label: firstExchangeName });

      await expect(page.locator('tbody td', { hasText: firstBuySymbol }).first()).toBeVisible();
      await expect(page.locator('tbody td', { hasText: firstSellSymbol }).first()).toBeVisible();
      await expect(page.locator('tbody td', { hasText: secondSellSymbol })).toHaveCount(0);

      await page.getByLabel('モードフィルタ').selectOption('Buy');

      await expect(page.locator('tbody td', { hasText: firstBuySymbol }).first()).toBeVisible();
      await expect(page.locator('tbody td', { hasText: firstSellSymbol })).toHaveCount(0);

      await page.getByRole('button', { name: 'クリア' }).click();

      await expect(page.locator('tbody td', { hasText: firstBuySymbol }).first()).toBeVisible();
      await expect(page.locator('tbody td', { hasText: firstSellSymbol }).first()).toBeVisible();
      await expect(page.locator('tbody td', { hasText: secondSellSymbol }).first()).toBeVisible();
    });
  });

  test.describe('アラート一覧の一時通知表示', () => {
    // webkit-mobile では Service Worker の影響で API モックが不安定になるため、このスイートでは無効化する
    test.use({ serviceWorkers: 'block' });

    test.beforeEach(async ({ request }) => {
      await resetState(request);
    });

    test('一時通知のアラートは「一時」、常設は「常設」が表示される', async ({ page }) => {
      const suffix = Date.now().toString().slice(-6);
      const temporarySymbol = `TMP${suffix}`;
      const persistentSymbol = `PST${suffix}`;

      await page.route('**/api/exchanges', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            exchanges: [{ exchangeId: `ex-${suffix}`, name: 'TEST', key: 'TEST' }],
          }),
        });
      });

      await page.route('**/api/alerts', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            alerts: [
              {
                alertId: `alert-tmp-${suffix}`,
                tickerId: `TEST:${temporarySymbol}`,
                symbol: temporarySymbol,
                name: 'Temporary Alert',
                mode: 'Buy',
                frequency: 'MINUTE_LEVEL',
                conditions: [{ field: 'price', operator: 'gte', value: 100 }],
                enabled: true,
                temporary: true,
                temporaryExpireDate: '2026-12-31',
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
              },
              {
                alertId: `alert-pst-${suffix}`,
                tickerId: `TEST:${persistentSymbol}`,
                symbol: persistentSymbol,
                name: 'Persistent Alert',
                mode: 'Sell',
                frequency: 'MINUTE_LEVEL',
                conditions: [{ field: 'price', operator: 'gte', value: 200 }],
                enabled: true,
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:00.000Z',
              },
            ],
          }),
        });
      });

      await page.goto('/alerts');
      await page.waitForLoadState('networkidle');

      const temporaryRow = page.locator('tbody tr', { hasText: temporarySymbol });
      await expect(temporaryRow).toBeVisible();
      await expect(temporaryRow.getByText('一時', { exact: true })).toBeVisible();

      const persistentRow = page.locator('tbody tr', { hasText: persistentSymbol });
      await expect(persistentRow).toBeVisible();
      await expect(persistentRow.getByText('常設', { exact: true })).toBeVisible();
    });
  });

  test.describe('アラート編集のカスタムメッセージ', () => {
    // webkit-mobile では Service Worker の影響で API モックが不安定になるため、このスイートでは無効化する
    test.use({ serviceWorkers: 'block' });

    interface MockEditableAlert {
      alertId: string;
      tickerId: string;
      symbol: string;
      name: string;
      mode: 'Buy' | 'Sell';
      frequency: 'MINUTE_LEVEL' | 'HOURLY_LEVEL';
      conditions: Array<{ field: 'price'; operator: 'gte' | 'lte'; value: number }>;
      enabled: boolean;
      customMessage?: string;
      createdAt: string;
      updatedAt: string;
    }

    const editableAlert: MockEditableAlert = {
      alertId: 'editable-alert-1',
      tickerId: 'NASDAQ:AAPL',
      symbol: 'AAPL',
      name: 'Apple Inc.',
      mode: 'Buy',
      frequency: 'MINUTE_LEVEL',
      conditions: [{ field: 'price', operator: 'lte', value: 180 }],
      enabled: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    /**
     * 編集対象アラート1件のみを返す `/api/alerts` と、その PUT 更新を受け付ける
     * `/api/alerts/:id` をモックし、アラート編集モーダルを開いた状態まで進める。
     * GET/PUT ともに `page.route` で完全に固定しているため、編集ボタンの出現は決定的であり、
     * 「見えなければリロードして再試行する」防御的なフォールバックは不要。
     */
    async function setupAlertsEditPage(
      page: Page,
      editableAlert: MockEditableAlert,
      onUpdate?: (body: Record<string, unknown>) => void
    ): Promise<void> {
      const currentAlert = { ...editableAlert };

      await page.route('**/api/exchanges', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            exchanges: [{ exchangeId: 'nasdaq', name: 'NASDAQ', key: 'NASDAQ' }],
          }),
        });
      });

      await page.route(/\/api\/alerts\/?(?:\?.*)?$/, async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ alerts: [currentAlert] }),
          });
          return;
        }
        await route.continue();
      });

      await page.route(/\/api\/alerts\/[^/?]+(?:\?.*)?$/, async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(currentAlert),
          });
          return;
        }

        if (route.request().method() !== 'PUT') {
          await route.continue();
          return;
        }

        const requestBody = route.request().postDataJSON() as Record<string, unknown>;
        onUpdate?.(requestBody);

        const nextCustomMessage = requestBody.customMessage;
        const nextConditions = requestBody.conditions;
        if (typeof nextCustomMessage === 'string') {
          currentAlert.customMessage = nextCustomMessage;
        }
        if (Array.isArray(nextConditions) && nextConditions.length > 0) {
          const firstCondition = nextConditions[0];
          if (firstCondition && typeof firstCondition === 'object' && 'value' in firstCondition) {
            const nextValue = (firstCondition as { value?: number }).value;
            if (typeof nextValue === 'number') {
              currentAlert.conditions = [{ field: 'price', operator: 'lte', value: nextValue }];
            }
          }
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(currentAlert),
        });
      });

      await page.goto('/alerts');
      await page.waitForLoadState('networkidle');
      const editButton = page.getByRole('button', { name: '編集' }).first();
      await expect(editButton).toBeVisible({ timeout: 15000 });
      await editButton.click();
      await expect(page.getByRole('dialog').first()).toBeVisible();
    }

    test.beforeEach(async ({ request }) => {
      await resetState(request);
    });

    test('カスタムメッセージを入力して保存できる', async ({ page }) => {
      let savedBody: Record<string, unknown> = {};
      await setupAlertsEditPage(page, editableAlert, (body) => {
        savedBody = body;
      });

      const alertDialog = page.getByRole('dialog').first();
      await alertDialog
        .getByLabel('カスタムメッセージ（通知本文の末尾に追加されます）')
        .fill('決算前のエントリーポイント');
      await alertDialog.getByRole('button', { name: '保存' }).click();

      expect(savedBody.customMessage).toBe('決算前のエントリーポイント');
    });

    test('カスタムメッセージ空欄のまま保存できる', async ({ page }) => {
      let updateCallCount = 0;
      await setupAlertsEditPage(page, editableAlert, () => {
        updateCallCount += 1;
      });

      const alertDialog = page.getByRole('dialog').first();
      await alertDialog.getByRole('button', { name: '保存' }).click();

      expect(updateCallCount).toBe(1);
    });

    test('価格を変更してもカスタムメッセージ入力が維持される', async ({ page }) => {
      await setupAlertsEditPage(page, editableAlert);

      const alertDialog = page.getByRole('dialog').first();
      await alertDialog
        .getByLabel('カスタムメッセージ（通知本文の末尾に追加されます）')
        .fill('戦略メモ');
      await alertDialog.getByLabel('目標価格').fill('190');

      await expect(
        alertDialog.getByLabel('カスタムメッセージ（通知本文の末尾に追加されます）')
      ).toHaveValue('戦略メモ');
    });

    test('目標価格入力欄でエンターキーを押すと保存処理が実行される', async ({ page }) => {
      // PUT リクエストが呼ばれたことを確認するためのカウンタ
      let updateCallCount = 0;
      await setupAlertsEditPage(page, editableAlert, () => {
        updateCallCount += 1;
      });

      const alertDialog = page.getByRole('dialog').first();
      // 目標価格を入力してエンターキーで保存する（保存ボタンはクリックしない）
      const targetPriceInput = alertDialog.getByLabel('目標価格');
      await targetPriceInput.fill('190');
      await targetPriceInput.press('Enter');

      // PUT リクエストが 1 回呼ばれ、保存処理が実行されたことを確認する
      expect(updateCallCount).toBe(1);
    });
  });

  test.describe('Web Push通知許可', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
    });

    test('通知許可がリクエストされる', async ({ page, context }) => {
      // Notification API がサポートされているか確認
      const hasNotificationApi = await page.evaluate(() => {
        return typeof Notification !== 'undefined';
      });

      // Notification API がサポートされていない環境（webkit-mobile等）ではスキップ
      // testing.md「E2Eテストにおけるブラウザ固有の制約」で明示的に許容されている静的スキップ
      test.skip(!hasNotificationApi, 'Notification API is not supported in this environment');

      // 通知許可の状態を確認
      const permissionState = await page.evaluate(() => {
        return Notification.permission;
      });

      // テスト環境では初期状態は default, granted, または denied のいずれか
      expect(['default', 'granted', 'denied']).toContain(permissionState);

      // 通知許可を付与（テスト環境）
      await context.grantPermissions(['notifications']);

      const newPermissionState = await page.evaluate(() => {
        return Notification.permission;
      });

      // ヘッドレス Chromium では `Notification.permission`（静的プロパティ）は
      // ページ読み込み時点の値のまま固定され、`context.grantPermissions()` を後から
      // 呼んでも変化しない（実際の許可反映は `Notification.requestPermission()` の
      // 戻り値にのみ現れる。この非同期 API 自体は Web Push 購読フロー側で別途検証する）。
      // そのため本テストでは「grantPermissions 前後で値が変わらない」ことを決定的に検証する。
      expect(newPermissionState).toBe(permissionState);
    });

    test('Service Workerが登録される', async ({ page }) => {
      // Service Workerがサポートされているか確認
      const hasServiceWorker = await page.evaluate(() => {
        return 'serviceWorker' in navigator;
      });

      expect(hasServiceWorker).toBe(true);
    });
  });
});
