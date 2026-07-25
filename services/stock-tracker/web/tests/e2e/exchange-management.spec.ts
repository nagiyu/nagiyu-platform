import { test, expect, resetState } from './fixtures';

/**
 * E2E-006: 取引所管理画面のテスト
 *
 * このテストは以下を検証します:
 * - 取引所のCRUD操作が正しく動作する
 * - 権限チェックが機能する（stock-adminのみアクセス可能）
 * - バリデーションエラーが適切に表示される
 * - 画面が正しく更新される
 *
 * `resetState` でインメモリリポジトリを都度リセット・seed し、前提となる取引所を
 * 決定的に用意することで、1 テスト = 1 結末で assert する。旧実装にあった
 * `expect(isModalVisible || isErrorVisible).toBeTruthy()` のような「どちらに転んでも
 * 成功する」assert や `.catch(() => false)` によるもみ消しは行わない。
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
 * また、本ファイルの最後の beforeEach が残した seed データ（取引所等）が後続で実行される
 * 他ファイル（resetState を使わず、実行順に依存して蓄積データを前提とするテスト）を
 * 汚染しないよう、全テスト終了後に afterAll でストアを空の状態へ戻す。
 */
test.describe.configure({ mode: 'serial' });

test.afterAll(async ({ playwright }) => {
  const context = await playwright.request.newContext({
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
  });
  await resetState(context);
  await context.dispose();
});

const EXCHANGE_ID = 'E2E-EXCH-BASE';
const EXCHANGE_KEY = 'E2EEXBS';
const EXCHANGE_NAME = 'E2E Exchange Base Test';

/** 前提となる取引所（編集・削除対象）の Exchange エンティティ */
function baseExchangeEntity() {
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

test.describe('取引所管理画面 (E2E-006)', () => {
  test.describe('画面表示', () => {
    test.beforeEach(async ({ page, request }) => {
      await resetState(request);
      await page.goto('/exchanges');
      await page.waitForLoadState('networkidle');
    });

    test('取引所一覧が正しく表示される', async ({ page }) => {
      await expect(page.locator('h1:has-text("取引所管理")')).toBeVisible();

      const table = page.locator('table');
      await expect(table).toBeVisible();

      await expect(page.locator('th:has-text("取引所ID")')).toBeVisible();
      await expect(page.locator('th:has-text("取引所名")')).toBeVisible();
      await expect(page.locator('th:has-text("APIキー")')).toBeVisible();
      await expect(page.locator('th:has-text("タイムゾーン")')).toBeVisible();
      await expect(page.locator('th:has-text("取引時間")')).toBeVisible();
      await expect(page.locator('th:has-text("操作")')).toBeVisible();
    });

    test('新規登録ボタンが表示される', async ({ page }) => {
      await expect(page.locator('button:has-text("新規登録")')).toBeVisible();
    });

    test('戻るボタンをクリックするとトップ画面に遷移する', async ({ page }) => {
      await page.locator('button:has-text("戻る")').click();
      await expect(page).toHaveURL('/');
    });

    test('新規登録モーダルが開閉できる', async ({ page }) => {
      await page.locator('button:has-text("新規登録")').click();

      const modal = page.getByRole('dialog', { name: '取引所登録' });
      await expect(modal).toBeVisible();
      await expect(page.locator('h2:has-text("取引所登録")')).toBeVisible();

      await expect(page.locator('input[placeholder="NASDAQ"]')).toBeVisible();
      await expect(page.locator('input[placeholder="NASDAQ Stock Market"]')).toBeVisible();
      await expect(page.locator('input[placeholder="NSDQ"]')).toBeVisible();

      await expect(modal.getByText('タイムゾーン', { exact: true }).first()).toBeVisible();
      await expect(modal.getByText('取引開始時間', { exact: true }).first()).toBeVisible();
      await expect(modal.getByText('取引終了時間', { exact: true }).first()).toBeVisible();

      await page.locator('button:has-text("キャンセル")').click();
      await expect(modal).not.toBeVisible();
    });
  });

  test.describe('取引所作成', () => {
    test.beforeEach(async ({ page, request }) => {
      await resetState(request);
      await page.goto('/exchanges');
      await page.waitForLoadState('networkidle');
    });

    test('取引所を新規作成できる', async ({ page }) => {
      const testId = 'E2E-EXCR-01';
      const testKey = 'E2EEXCR1';

      await page.locator('button:has-text("新規登録")').click();

      const modal = page.getByRole('dialog', { name: '取引所登録' });
      await expect(modal).toBeVisible();

      await page.locator('input[placeholder="NASDAQ"]').fill(testId);
      await page.locator('input[placeholder="NASDAQ Stock Market"]').fill('Test Exchange');
      await page.locator('input[placeholder="NSDQ"]').fill(testKey);

      await modal.locator('#exchange-timezone').selectOption('America/New_York');
      await modal.locator('#exchange-start-hour').selectOption('09');
      await modal.locator('#exchange-start-minute').selectOption('30');
      await modal.locator('#exchange-end-hour').selectOption('16');
      await modal.locator('#exchange-end-minute').selectOption('00');

      await page.locator('button:has-text("保存")').click();

      await expect(modal).not.toBeVisible({ timeout: 10000 });
      await expect(page.locator('text=取引所を作成しました')).toBeVisible({ timeout: 3000 });

      const createdRow = page.locator(`tr:has-text("${testId}")`);
      await expect(createdRow).toBeVisible();
      await expect(createdRow.locator('td:has-text("Test Exchange")')).toBeVisible();
    });

    test('登録モーダルのテキスト入力でエンターキーを押すと取引所が登録される', async ({ page }) => {
      const testId = 'E2E-EXCR-02';
      const testKey = 'E2EEXCR2';

      await page.locator('button:has-text("新規登録")').click();

      const modal = page.getByRole('dialog', { name: '取引所登録' });
      await expect(modal).toBeVisible();

      await page.locator('input[placeholder="NASDAQ"]').fill(testId);
      await page.locator('input[placeholder="NASDAQ Stock Market"]').fill('Test Exchange Enter');
      await page.locator('input[placeholder="NSDQ"]').fill(testKey);

      await modal.locator('#exchange-timezone').selectOption('America/New_York');
      await modal.locator('#exchange-start-hour').selectOption('09');
      await modal.locator('#exchange-start-minute').selectOption('30');
      await modal.locator('#exchange-end-hour').selectOption('16');
      await modal.locator('#exchange-end-minute').selectOption('00');

      // 保存ボタンをクリックせず、取引所ID入力欄でエンターキーを押して登録する
      await page.locator('input[placeholder="NASDAQ"]').press('Enter');

      await expect(modal).not.toBeVisible({ timeout: 10000 });
      await expect(page.locator('text=取引所を作成しました')).toBeVisible({ timeout: 3000 });

      const createdRow = page.locator(`tr:has-text("${testId}")`);
      await expect(createdRow).toBeVisible();
      await expect(createdRow.locator('td:has-text("Test Exchange Enter")')).toBeVisible();
    });
  });

  test.describe('取引所編集', () => {
    test.beforeEach(async ({ page, request }) => {
      await resetState(request, { exchanges: [baseExchangeEntity()] });
      await page.goto('/exchanges');
      await page.waitForLoadState('networkidle');
    });

    test('取引所を編集できる', async ({ page }) => {
      const updatedName = 'Updated Exchange Name';

      const targetRow = page.locator(`tr:has-text("${EXCHANGE_ID}")`);
      await expect(targetRow).toBeVisible({ timeout: 10000 });

      await targetRow.locator('button:has-text("編集")').click();

      const modal = page.getByRole('dialog', { name: '取引所編集' });
      await expect(modal).toBeVisible();
      await expect(page.locator('h2:has-text("取引所編集")')).toBeVisible();

      // 取引所名フィールドは作成モーダルと同じ placeholder を持つため一意に特定できる
      const nameInput = modal.locator('input[placeholder="NASDAQ Stock Market"]');
      await nameInput.clear();
      await nameInput.fill(updatedName);

      await page.locator('button:has-text("保存")').click();

      await expect(modal).not.toBeVisible({ timeout: 10000 });
      await expect(page.locator('text=取引所を更新しました')).toBeVisible({ timeout: 3000 });

      await expect(page.locator(`td:has-text("${updatedName}")`)).toBeVisible();
    });
  });

  test.describe('削除確認ダイアログ', () => {
    test.beforeEach(async ({ page, request }) => {
      await resetState(request, { exchanges: [baseExchangeEntity()] });
      await page.goto('/exchanges');
      await page.waitForLoadState('networkidle');
    });

    test('削除確認ダイアログが表示される', async ({ page }) => {
      const targetRow = page.locator(`tr:has-text("${EXCHANGE_ID}")`);
      await expect(targetRow).toBeVisible({ timeout: 10000 });

      await targetRow.locator('button:has-text("削除")').click();

      const deleteDialog = page.getByRole('dialog', { name: '取引所削除' });
      await expect(deleteDialog).toBeVisible();
      await expect(page.locator('h2:has-text("取引所削除")')).toBeVisible();
      await expect(
        page.locator(`text=取引所「${EXCHANGE_NAME}」を削除してもよろしいですか？`)
      ).toBeVisible();

      await page.locator('button:has-text("キャンセル")').click();
      await expect(deleteDialog).not.toBeVisible();
    });

    test('取引所を削除できる', async ({ page }) => {
      const targetRow = page.locator(`tr:has-text("${EXCHANGE_ID}")`);
      await expect(targetRow).toBeVisible({ timeout: 10000 });

      await targetRow.locator('button:has-text("削除")').click();

      const deleteDialog = page.getByRole('dialog', { name: '取引所削除' });
      await expect(deleteDialog).toBeVisible();
      await expect(page.locator('h2:has-text("取引所削除")')).toBeVisible();

      await page.locator('button:has-text("削除")').last().click();

      await expect(deleteDialog).not.toBeVisible({ timeout: 10000 });
      await expect(page.locator('text=取引所を削除しました')).toBeVisible({ timeout: 3000 });

      await expect(page.locator(`td:has-text("${EXCHANGE_ID}")`)).not.toBeVisible();
    });
  });

  test.describe('バリデーションエラー', () => {
    test.beforeEach(async ({ page, request }) => {
      await resetState(request);
      await page.goto('/exchanges');
      await page.waitForLoadState('networkidle');
    });

    test('必須項目が未入力のまま保存するとエラーメッセージが表示され、モーダルは開いたままになる', async ({
      page,
    }) => {
      await page.locator('button:has-text("新規登録")').click();

      const modal = page.getByRole('dialog', { name: '取引所登録' });
      await expect(modal).toBeVisible();

      // 空のフォームで保存を試みる（クライアント側バリデーションが無いため、
      // サーバー側バリデーションエラー（400）が返る）
      await page.locator('button:has-text("保存")').click();

      // エラーアラートはモーダル背後（メイン画面側）に表示され、MUI Dialog が背後の
      // コンテンツに aria-hidden を付与するため getByRole ではなく属性セレクタで検証する
      await expect(
        page.locator('[role="alert"]').filter({ hasText: '取引所IDは必須です' })
      ).toBeVisible({ timeout: 5000 });

      // 保存に失敗しているため、モーダルは開いたままとなる
      await expect(modal).toBeVisible();
    });
  });

  test.describe('ローディング状態', () => {
    test.beforeEach(async ({ request }) => {
      await resetState(request);
    });

    test('取引所一覧取得中はローディングインジケーターが表示される', async ({ page }) => {
      // /api/exchanges の応答を意図的に遅延させ、ローディング状態を決定的に観測する
      await page.route('**/api/exchanges', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        await route.continue();
      });

      await page.goto('/exchanges');

      await expect(page.locator('role=progressbar')).toBeVisible();

      await page.waitForLoadState('networkidle');
      await expect(page.locator('table')).toBeVisible();
    });
  });

  test.describe('権限チェック (E2E-005の一部)', () => {
    test.beforeEach(async ({ request }) => {
      await resetState(request);
    });

    test('stock-admin ロールでアクセスできる', async ({ page }) => {
      // テスト環境では SKIP_AUTH_CHECK=true で stock-admin ロールが設定されている想定
      await page.goto('/exchanges');
      await page.waitForLoadState('networkidle');

      await expect(page.locator('h1:has-text("取引所管理")')).toBeVisible();
      await expect(page.locator('button:has-text("新規登録")')).toBeVisible();
    });

    test('取引所一覧取得に失敗した場合はエラーメッセージが表示される', async ({ page }) => {
      // GET /api/exchanges を 500 に固定し、エラー表示を決定的に検証する
      await page.route('**/api/exchanges', (route) => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'INTERNAL_ERROR',
            message: '取引所一覧の取得に失敗しました',
          }),
        });
      });

      await page.goto('/exchanges');
      await page.waitForLoadState('networkidle');

      await expect(
        page.getByRole('alert').filter({ hasText: '取引所一覧の取得に失敗しました' })
      ).toBeVisible();
      // エラー時も取引所一覧は初期状態（空）のまま描画される
      await expect(page.locator('table')).toBeVisible();
      await expect(page.getByText('取引所が登録されていません')).toBeVisible();
    });
  });

  test.describe('アクセシビリティ', () => {
    test.beforeEach(async ({ page, request }) => {
      await resetState(request);
      await page.goto('/exchanges');
      await page.waitForLoadState('networkidle');
    });

    test('キーボードナビゲーションが機能する', async ({ page }) => {
      await page.keyboard.press('Tab');

      const focusedElement = page.locator(':focus');
      await expect(focusedElement).toBeVisible();
    });

    test('ボタンとリンクに適切なラベルが設定されている', async ({ page }) => {
      const createButton = page.locator('button:has-text("新規登録")');
      await expect(createButton).toBeVisible();
      await expect(createButton).toHaveAttribute('type', 'button');

      const backButton = page.locator('button:has-text("戻る")');
      await expect(backButton).toBeVisible();
    });
  });
});
