import { test, expect, resetState, type ResetSeedData } from './fixtures';

/**
 * webkit-mobile 対応: 実 Service Worker（/sw.js）を無効化する。
 *
 * 本アプリは libs/ui の ServiceWorkerRegistration が全ページで /sw.js を登録するため、
 * webkit では SW がページを制御し、API 応答を仲介・キャッシュしてしまう。Playwright は
 * 「Service Worker 経由のリクエストは Chromium 以外では page.route で捕捉できない」
 * という既知の制約があるため、モックが素通りしたり、UI が古い応答を表示したりして
 * テストが非決定的になる（実測で確認済み）。
 *
 * `chromium-mobile` プロジェクトは playwright.config.base.ts 側で
 * `serviceWorkers: 'block'` を設定済みだが、`chromium-desktop` / `webkit-mobile` は
 * 未設定という非対称があるため、本サービスの spec 側で一律に打ち消す。
 * （設定の非対称そのものの解消は E2E 横断整備の範囲と判断し、本対応では触れない。）
 */
test.use({ serviceWorkers: 'block' });

/**
 * E2E-007: ティッカー管理フロー
 *
 * このテストは以下を検証します:
 * - ティッカーのCRUD操作（作成、編集、削除）
 * - ティッカーIDの自動生成（{Exchange.Key}:{Symbol} 形式）
 * - 取引所フィルタ機能
 * - 権限チェック（書き込み系操作は stock-admin のみ許可）
 * - バリデーションエラーの表示
 *
 * `resetState` でインメモリリポジトリを都度リセット・seed し、前提となる取引所を
 * 決定的に用意することで、1 テスト = 1 結末で assert する。旧実装にあった
 * 「権限エラーが表示されていたら test.skip()」「取引所のオプションが見つからなければ
 * 最初のオプションを選択、それも無ければ skip」という自己スキップ・フォールバック
 * 分岐は行わない。
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
 * また、本ファイルの最後の beforeEach が残した seed データ（取引所・ティッカー等）が
 * 後続で実行される他ファイル（resetState を使わず、実行順に依存して蓄積データを前提とする
 * テスト）を汚染しないよう、全テスト終了後に afterAll でストアを空の状態へ戻す。
 */
test.describe.configure({ mode: 'serial' });

test.afterAll(async ({ playwright }) => {
  const context = await playwright.request.newContext({
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
  });
  await resetState(context);
  await context.dispose();
});

const EXCHANGE_ID = 'E2E-TICKER-EX';
const EXCHANGE_KEY = 'E2ETICK';
const EXCHANGE_NAME = 'E2E Ticker Test Exchange';

const TICKER_SYMBOL = 'TICKTK';
const TICKER_ID = `${EXCHANGE_KEY}:${TICKER_SYMBOL}`;
const TICKER_NAME = 'E2E Ticker Test Ticker';

const SECOND_EXCHANGE_ID = 'E2E-TICKER-EX2';
const SECOND_EXCHANGE_KEY = 'E2ETICK2';
const SECOND_EXCHANGE_NAME = 'E2E Ticker Second Exchange';

const SECOND_TICKER_SYMBOL = 'OTHERTK';
const SECOND_TICKER_ID = `${SECOND_EXCHANGE_KEY}:${SECOND_TICKER_SYMBOL}`;

/** メイン取引所の Exchange エンティティ */
function mainExchangeEntity() {
  return {
    ExchangeID: EXCHANGE_ID,
    Name: EXCHANGE_NAME,
    Key: EXCHANGE_KEY,
    Timezone: 'America/New_York',
    Start: '09:30',
    End: '16:00',
    PriceSource: 'tradingview',
  };
}

/** 前提となる取引所（メイン）の seed データ */
function exchangeSeed(): ResetSeedData {
  return {
    exchanges: [mainExchangeEntity()],
  };
}

/** メイン取引所に紐づくティッカーの seed データ */
function tickerEntity() {
  return {
    TickerID: TICKER_ID,
    Symbol: TICKER_SYMBOL,
    Name: TICKER_NAME,
    ExchangeID: EXCHANGE_ID,
  };
}

test.describe('ティッカー管理 (E2E-007)', () => {
  test.describe('画面表示', () => {
    test.beforeEach(async ({ page, request }) => {
      await resetState(request, exchangeSeed());
      await page.goto('/tickers');
      await page.waitForLoadState('networkidle');
    });

    test('ティッカー管理画面が正しく表示される', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'ティッカー管理' })).toBeVisible();
      await expect(page.getByRole('button', { name: '新規作成' })).toBeVisible();
      await expect(page.getByLabel('取引所でフィルタ')).toBeVisible();
      await expect(page.getByRole('table')).toBeVisible();

      await expect(page.getByRole('columnheader', { name: 'ティッカーID' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: 'シンボル' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '銘柄名' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '取引所' })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: '操作' })).toBeVisible();
    });
  });

  test.describe('ティッカー作成', () => {
    test.beforeEach(async ({ page, request }) => {
      await resetState(request, exchangeSeed());
      await page.goto('/tickers');
      await page.waitForLoadState('networkidle');
    });

    test('シンボル入力欄でエンターキーを押すとティッカーを作成できる', async ({ page }) => {
      const testSymbol = 'ENTERTK';
      const testName = 'Enter Key Test Corporation';

      await page.getByRole('button', { name: '新規作成' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      const symbolField = page.getByRole('textbox', { name: /シンボル/ });
      const nameField = page.getByRole('textbox', { name: /銘柄名/ });
      const exchangeField = page.locator('#create-exchange');

      await symbolField.fill(testSymbol);
      await nameField.fill(testName);
      // 前提の取引所は resetState で確実に seed済みのため、選択は決定的に成功する
      await exchangeField.selectOption({ label: EXCHANGE_NAME });

      // 作成ボタンをクリックせず、シンボル入力欄でエンターキーを押して確定する
      await symbolField.press('Enter');

      await expect(page.getByText('ティッカーを作成しました')).toBeVisible({ timeout: 10000 });
      await expect(page.getByRole('dialog')).not.toBeVisible();

      const tickerRow = page.getByRole('row').filter({ hasText: testSymbol });
      await expect(tickerRow).toBeVisible();
    });

    test('ティッカーを作成できる', async ({ page }) => {
      const testSymbol = 'CREATETK';
      const testName = 'Test Ticker Corporation';

      await page.getByRole('button', { name: '新規作成' }).click();

      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'ティッカー新規作成' })).toBeVisible();

      const symbolField = page.getByRole('textbox', { name: /シンボル/ });
      const nameField = page.getByRole('textbox', { name: /銘柄名/ });
      const exchangeField = page.locator('#create-exchange');

      await expect(symbolField).toBeVisible();
      await expect(nameField).toBeVisible();
      await expect(exchangeField).toBeVisible();
      await expect(page.getByText(/ティッカーIDは自動生成されます/)).toBeVisible();

      await symbolField.fill(testSymbol);
      await nameField.fill(testName);
      await exchangeField.selectOption({ label: EXCHANGE_NAME });

      const createButton = page.getByRole('button', { name: '作成' });
      await expect(createButton).toBeEnabled();
      await createButton.click();

      await expect(page.getByText('ティッカーを作成しました')).toBeVisible({ timeout: 10000 });
      await expect(page.getByRole('dialog')).not.toBeVisible();

      const tickerRow = page.getByRole('row').filter({ hasText: testSymbol });
      await expect(tickerRow).toBeVisible();
      await expect(tickerRow.getByRole('cell', { name: testSymbol, exact: true })).toBeVisible();
      await expect(tickerRow.getByRole('cell', { name: testName })).toBeVisible();

      // ティッカーIDが {取引所キー}:{シンボル} 形式で自動生成されていることを確認
      const expectedTickerId = `${EXCHANGE_KEY}:${testSymbol}`;
      await expect(tickerRow.getByRole('cell').first()).toHaveText(expectedTickerId);
    });
  });

  test.describe('ティッカー編集', () => {
    test.beforeEach(async ({ page, request }) => {
      await resetState(request, { ...exchangeSeed(), tickers: [tickerEntity()] });
      await page.goto('/tickers');
      await page.waitForLoadState('networkidle');
    });

    test('ティッカーを編集できる', async ({ page }) => {
      const updatedName = 'Updated Ticker Corporation';

      const tickerRow = page.locator(`tr:has-text("${TICKER_SYMBOL}")`);
      await expect(tickerRow).toBeVisible({ timeout: 10000 });

      await tickerRow.getByRole('button', { name: /編集/ }).click();

      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'ティッカー編集' })).toBeVisible();

      // ティッカーIDは変更不可（disabled）
      await expect(page.getByRole('textbox', { name: /ティッカーID/ })).toBeDisabled();

      // シンボルは変更不可（disabled）
      await expect(page.getByRole('textbox', { name: /シンボル/ })).toBeDisabled();

      // 取引所は変更不可（disabled）
      await expect(page.locator('#edit-exchange')).toBeDisabled();

      // 銘柄名のみ編集可能
      const nameField = page.getByRole('textbox', { name: /銘柄名/ });
      await expect(nameField).toBeEnabled();
      await nameField.clear();
      await nameField.fill(updatedName);

      await page.getByRole('button', { name: '更新' }).click();

      await expect(page.getByText('ティッカーを更新しました')).toBeVisible({ timeout: 10000 });
      await expect(page.getByRole('dialog')).not.toBeVisible();

      const updatedTickerRow = page.getByRole('row').filter({ hasText: TICKER_SYMBOL });
      await expect(updatedTickerRow.getByRole('cell', { name: updatedName })).toBeVisible();
    });
  });

  test.describe('取引所フィルタ', () => {
    test.beforeEach(async ({ page, request }) => {
      await resetState(request, {
        exchanges: [
          mainExchangeEntity(),
          {
            ExchangeID: SECOND_EXCHANGE_ID,
            Name: SECOND_EXCHANGE_NAME,
            Key: SECOND_EXCHANGE_KEY,
            Timezone: 'Asia/Tokyo',
            Start: '09:00',
            End: '15:00',
            PriceSource: 'tradingview',
          },
        ],
        tickers: [
          tickerEntity(),
          {
            TickerID: SECOND_TICKER_ID,
            Symbol: SECOND_TICKER_SYMBOL,
            Name: 'Other Exchange Ticker',
            ExchangeID: SECOND_EXCHANGE_ID,
          },
        ],
      });
      await page.goto('/tickers');
      await page.waitForLoadState('networkidle');
    });

    test('取引所を選択すると該当取引所のティッカーのみ表示される', async ({ page }) => {
      const exchangeFilter = page.locator('#exchange-filter');
      await expect(exchangeFilter).toBeEnabled();

      // フィルタ前は両方の取引所のティッカーが表示されている
      await expect(page.getByRole('row').filter({ hasText: TICKER_SYMBOL })).toBeVisible();
      await expect(page.getByRole('row').filter({ hasText: SECOND_TICKER_SYMBOL })).toBeVisible();

      await exchangeFilter.selectOption(EXCHANGE_ID);
      await page.waitForLoadState('networkidle');

      await expect(page.getByRole('row').filter({ hasText: TICKER_SYMBOL })).toBeVisible();
      await expect(
        page.getByRole('row').filter({ hasText: SECOND_TICKER_SYMBOL })
      ).not.toBeVisible();

      // フィルタをクリア（「すべて」を選択）すると両方のティッカーが再び表示される
      await exchangeFilter.selectOption('');
      await page.waitForLoadState('networkidle');

      await expect(page.getByRole('row').filter({ hasText: SECOND_TICKER_SYMBOL })).toBeVisible();
    });
  });

  test.describe('バリデーション', () => {
    test.beforeEach(async ({ page, request }) => {
      await resetState(request, exchangeSeed());
      await page.goto('/tickers');
      await page.waitForLoadState('networkidle');
    });

    test('バリデーションエラーが正しく表示される', async ({ page }) => {
      await page.getByRole('button', { name: '新規作成' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      // 作成ボタンは初期状態で無効
      const createButton = page.getByRole('button', { name: '作成' });
      await expect(createButton).toBeDisabled();

      // シンボルのみ入力
      await page.getByRole('textbox', { name: /シンボル/ }).fill('TEST');

      // 作成ボタンはまだ無効（銘柄名と取引所が未入力）
      await expect(createButton).toBeDisabled();

      await page.getByRole('button', { name: 'キャンセル' }).click();
      await expect(page.getByRole('dialog')).not.toBeVisible();
    });
  });

  test.describe('ティッカー削除', () => {
    test.beforeEach(async ({ page, request }) => {
      await resetState(request, { ...exchangeSeed(), tickers: [tickerEntity()] });
      await page.goto('/tickers');
      await page.waitForLoadState('networkidle');
    });

    test('ティッカーを削除できる', async ({ page }) => {
      const tickerRow = page.locator(`tr:has-text("${TICKER_SYMBOL}")`);
      await expect(tickerRow).toBeVisible({ timeout: 10000 });

      await tickerRow.getByRole('button', { name: /削除/ }).click();

      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'ティッカー削除' })).toBeVisible();
      await expect(page.getByText('本当にこのティッカーを削除しますか？')).toBeVisible();
      await expect(page.getByText('この操作は取り消せません')).toBeVisible();

      await page.getByRole('button', { name: '削除', exact: true }).click();

      await expect(page.getByText('ティッカーを削除しました')).toBeVisible({ timeout: 10000 });
      await expect(page.getByRole('dialog')).not.toBeVisible();

      await expect(page.getByRole('cell', { name: TICKER_SYMBOL, exact: true })).not.toBeVisible();
    });
  });

  test.describe('権限チェック', () => {
    test.describe('stock-viewer ロール', () => {
      test.use({ role: ['stock-viewer'] });

      test.beforeEach(async ({ page, request }) => {
        await resetState(request, exchangeSeed());
        await page.goto('/tickers');
        await page.waitForLoadState('networkidle');
      });

      test('stock-viewer ロールでは新規作成が拒否される', async ({ page }) => {
        // stock-viewer は stocks:read のみ保持するため画面閲覧自体はできるが、
        // 新規作成（POST /api/tickers、要 stocks:manage-data）は拒否される
        await expect(page.getByRole('heading', { name: 'ティッカー管理' })).toBeVisible();

        await page.getByRole('button', { name: '新規作成' }).click();
        await expect(page.getByRole('dialog')).toBeVisible();

        await page.getByRole('textbox', { name: /シンボル/ }).fill('DENYTK');
        await page.getByRole('textbox', { name: /銘柄名/ }).fill('Denied Ticker');
        await page.locator('#create-exchange').selectOption({ label: EXCHANGE_NAME });

        await page.getByRole('button', { name: '作成' }).click();

        await expect(page.getByText('アクセスが拒否されました')).toBeVisible({ timeout: 10000 });
        // 作成に失敗しているため、モーダルは開いたままとなる
        await expect(page.getByRole('dialog')).toBeVisible();
      });
    });

    test.describe('stock-admin ロール', () => {
      test.use({ role: ['stock-admin'] });

      test.beforeEach(async ({ page, request }) => {
        await resetState(request, exchangeSeed());
        await page.goto('/tickers');
        await page.waitForLoadState('networkidle');
      });

      test('stock-admin ロールでは新規作成が許可される', async ({ page }) => {
        await expect(page.getByRole('heading', { name: 'ティッカー管理' })).toBeVisible();
        await expect(page.getByRole('button', { name: '新規作成' })).toBeVisible();

        await page.getByRole('button', { name: '新規作成' }).click();
        await expect(page.getByRole('dialog')).toBeVisible();

        await page.getByRole('textbox', { name: /シンボル/ }).fill('ALLOWTK');
        await page.getByRole('textbox', { name: /銘柄名/ }).fill('Allowed Ticker');
        await page.locator('#create-exchange').selectOption({ label: EXCHANGE_NAME });

        await page.getByRole('button', { name: '作成' }).click();

        await expect(page.getByText('ティッカーを作成しました')).toBeVisible({ timeout: 10000 });
        await expect(page.getByRole('dialog')).not.toBeVisible();
      });
    });
  });

  test.describe('モバイル対応', () => {
    test.beforeEach(async ({ page, request }) => {
      await resetState(request, exchangeSeed());
      await page.goto('/tickers');
      await page.waitForLoadState('networkidle');
    });

    test('モバイル画面で正しくレイアウトされる', async ({ page }) => {
      await page.setViewportSize({ width: 393, height: 851 });
      await page.waitForLoadState('networkidle');

      await expect(page.getByRole('heading', { name: 'ティッカー管理' })).toBeVisible();
      await expect(page.getByRole('button', { name: '新規作成' })).toBeVisible();
      await expect(page.getByRole('table')).toBeVisible();
    });
  });
});
