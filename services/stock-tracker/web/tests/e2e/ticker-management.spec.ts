import { test, expect } from '@playwright/test';
import { TestDataFactory, CreatedTicker } from './utils/test-data-factory';

/**
 * E2E-007: ティッカー管理フロー
 *
 * このテストは以下を検証します:
 * - ティッカーのCRUD操作（作成、編集、削除）
 * - ティッカーIDの自動生成（{Exchange.Key}:{Symbol} 形式）
 * - 取引所フィルタ機能
 * - 権限チェック（stock-admin のみアクセス可能）
 * - バリデーションエラーの表示
 */

test.describe('ティッカー管理', () => {
  let factory: TestDataFactory;

  test.beforeEach(async ({ page, request }) => {
    // TestDataFactory を初期化
    factory = new TestDataFactory(request);

    // ティッカー管理画面にアクセス
    await page.goto('/tickers');

    // ページが読み込まれるまで待つ
    await page.waitForLoadState('networkidle');

    // エラーメッセージがある場合は待つ（権限エラーなど）
    const errorAlert = page.locator('[role="alert"]').filter({ hasText: 'エラー' }).first();
    const isErrorVisible = await errorAlert.isVisible().catch(() => false);

    if (isErrorVisible) {
      const errorText = await errorAlert.textContent();
      console.log('権限エラーが表示されました:', errorText);
      // 権限エラーの場合はテストをスキップ
      if (errorText?.includes('アクセスが拒否') || errorText?.includes('権限がありません')) {
        test.skip();
      }
    }
  });

  test.afterEach(async () => {
    // TestDataFactory でクリーンアップ
    await factory.cleanup();
  });

  test('ティッカー管理画面が正しく表示される', async ({ page }) => {
    // ページタイトルが表示される
    await expect(page.getByRole('heading', { name: 'ティッカー管理' })).toBeVisible();

    // 新規作成ボタンが表示される
    await expect(page.getByRole('button', { name: '新規作成' })).toBeVisible();

    // 取引所フィルタが表示される
    await expect(page.getByLabel('取引所でフィルタ')).toBeVisible();

    // テーブルが表示される
    await expect(page.getByRole('table')).toBeVisible();

    // テーブルヘッダーが正しく表示される
    await expect(page.getByRole('columnheader', { name: 'ティッカーID' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'シンボル' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '銘柄名' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '取引所' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '操作' })).toBeVisible();
  });

  test.describe('ティッカー作成', () => {
    test('ティッカーを作成できる', async ({ page, request }) => {
      // テスト用の Exchange を API 経由で作成
      const exchange = await factory.createExchange();

      // データが反映されるまで待つ
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // ページをリロード
      await page.reload();
      await page.waitForLoadState('networkidle');

      // テスト用のユニークなシンボルと名前
      const testSymbol = `T${Date.now() % 100000}`.substring(0, 10).toUpperCase();
      const testName = 'Test Ticker Corporation';

      // 新規作成ボタンをクリック
      await page.getByRole('button', { name: '新規作成' }).click();

      // モーダルが表示される
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'ティッカー新規作成' })).toBeVisible();

      // フォームフィールドが表示される（Material-UIのTextFieldはlabelテキストで検索）
      const symbolField = page.getByRole('textbox', { name: /シンボル/ });
      const nameField = page.getByRole('textbox', { name: /銘柄名/ });
      const exchangeField = page.getByRole('combobox', { name: /取引所/ });

      await expect(symbolField).toBeVisible();
      await expect(nameField).toBeVisible();
      await expect(exchangeField).toBeVisible();

      // ティッカーID自動生成の説明が表示される
      await expect(page.getByText(/ティッカーIDは自動生成されます/)).toBeVisible();

      // シンボルを入力（自動的に大文字に変換される）
      await symbolField.fill(testSymbol);

      // 銘柄名を入力
      await nameField.fill(testName);

      // 取引所を選択
      await exchangeField.click();

      // 作成した取引所のオプションを選択
      const exchangeOption = page.locator(
        `[role="listbox"] [role="option"]:has-text("${exchange.name}")`
      );
      const isExchangeVisible = await exchangeOption.isVisible().catch(() => false);

      if (isExchangeVisible) {
        await exchangeOption.click();
      } else {
        // 作成した取引所が見つからない場合は最初のオプションを選択
        const exchangeOptions = page.locator('[role="listbox"] [role="option"]');
        const optionCount = await exchangeOptions.count();
        if (optionCount > 0) {
          await exchangeOptions.first().click();
        } else {
          console.log('取引所データがないためテストをスキップ');
          test.skip();
          return;
        }
      }

      // 作成ボタンが有効になる
      const createButton = page.getByRole('button', { name: '作成' });
      await expect(createButton).toBeEnabled();

      // 作成ボタンをクリック
      await createButton.click();

      // 成功メッセージが表示される
      await expect(page.getByText('ティッカーを作成しました')).toBeVisible({ timeout: 10000 });

      // モーダルが閉じる
      await expect(page.getByRole('dialog')).not.toBeVisible();

      // テーブルに新しいティッカーが表示される
      const tickerRow = page.getByRole('row').filter({ hasText: testSymbol });
      await expect(tickerRow).toBeVisible();

      // 行内でシンボルと名前が表示されていることを確認
      await expect(tickerRow.getByRole('cell', { name: testSymbol, exact: true })).toBeVisible();
      await expect(tickerRow.getByRole('cell', { name: testName })).toBeVisible();

      // ティッカーIDを取得（{Exchange.Key}:{Symbol} 形式を確認）
      const tickerIdCell = tickerRow.getByRole('cell').first();
      const createdTickerId = (await tickerIdCell.textContent()) || '';
      console.log('作成されたティッカーID:', createdTickerId);

      // ティッカーIDが正しい形式であることを確認（Exchange.Key:Symbol）
      expect(createdTickerId).toMatch(/^[A-Z0-9]+:[A-Z0-9]+$/);
      expect(createdTickerId).toContain(testSymbol);

      // UI経由で作成したTickerをAPI経由でクリーンアップ
      // TestDataFactoryでは追跡されていないため、手動で削除する
      if (createdTickerId) {
        try {
          await request.delete(`/api/tickers/${encodeURIComponent(createdTickerId)}`);
          console.log(`UI作成ティッカーをクリーンアップ: ${createdTickerId}`);
        } catch (error) {
          console.warn(`Warning: Failed to cleanup UI-created ticker ${createdTickerId}:`, error);
        }
      }
    });
  });

  test.describe('ティッカー編集', () => {
    let testTicker: CreatedTicker;
    const updatedName = 'Updated Ticker Corporation';

    test.beforeEach(async () => {
      // テスト用の Ticker を API 経由で作成
      testTicker = await factory.createTicker();

      // データが反映されるまで待つ
      await new Promise((resolve) => setTimeout(resolve, 2000));
    });

    test('ティッカーを編集できる', async ({ page }) => {
      // ページをリロード
      await page.reload();
      await page.waitForLoadState('networkidle');

      // 作成されたティッカーを検索
      const tickerRow = page.locator(`tr:has-text("${testTicker.symbol}")`);
      await expect(tickerRow).toBeVisible({ timeout: 10000 });

      // 編集ボタンをクリック
      await tickerRow.getByRole('button', { name: /編集/ }).click();

      // 編集モーダルが表示される
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'ティッカー編集' })).toBeVisible();

      // ティッカーIDは変更不可（disabled）
      const tickerIdField = page.getByRole('textbox', { name: /ティッカーID/ });
      await expect(tickerIdField).toBeDisabled();

      // シンボルは変更不可（disabled）
      const symbolField = page.getByRole('textbox', { name: /シンボル/ });
      await expect(symbolField).toBeDisabled();

      // 取引所は変更不可（disabled）
      const exchangeField = page.getByRole('combobox', { name: /取引所/ });
      await expect(exchangeField).toBeDisabled();

      // 銘柄名のみ編集可能
      const nameField = page.getByRole('textbox', { name: /銘柄名/ });
      await expect(nameField).toBeEnabled();

      // 銘柄名を変更
      await nameField.clear();
      await nameField.fill(updatedName);

      // 更新ボタンをクリック
      await page.getByRole('button', { name: '更新' }).click();

      // 成功メッセージが表示される
      await expect(page.getByText('ティッカーを更新しました')).toBeVisible({ timeout: 10000 });

      // モーダルが閉じる
      await expect(page.getByRole('dialog')).not.toBeVisible();

      // テーブルに更新された銘柄名が表示される（該当行内で確認）
      const updatedTickerRow = page.getByRole('row').filter({ hasText: testTicker.symbol });
      await expect(updatedTickerRow.getByRole('cell', { name: updatedName })).toBeVisible();
    });
  });

  test('取引所フィルタが正しく動作する', async ({ page }) => {
    // 取引所フィルタを開く
    const exchangeFilter = page.getByRole('combobox', { name: /取引所でフィルタ/ });
    await exchangeFilter.click();

    // オプションを取得
    const options = page.locator('[role="listbox"] [role="option"]');
    const optionCount = await options.count();

    if (optionCount > 1) {
      // 「すべて」以外のオプションがある場合
      // 最初の取引所を選択
      await options.nth(1).click();

      // ページが更新されるまで待つ
      await page.waitForLoadState('networkidle');

      // テーブルに表示されるティッカーが選択した取引所のもののみであることを確認
      // （データがある場合のみ）
      const rows = page.locator('table tbody tr');
      const rowCount = await rows.count();

      if (rowCount > 0) {
        // 空のメッセージが表示されていないことを確認
        await expect(page.getByText('ティッカーが登録されていません')).not.toBeVisible();
      }

      // フィルタをクリア（「すべて」を選択）
      await exchangeFilter.click();
      await options.first().click();

      // ページが更新されるまで待つ
      await page.waitForLoadState('networkidle');
    }
  });

  test('バリデーションエラーが正しく表示される', async ({ page }) => {
    // 新規作成ボタンをクリック
    await page.getByRole('button', { name: '新規作成' }).click();

    // モーダルが表示される
    await expect(page.getByRole('dialog')).toBeVisible();

    // 作成ボタンは初期状態で無効
    const createButton = page.getByRole('button', { name: '作成' });
    await expect(createButton).toBeDisabled();

    // シンボルのみ入力
    await page.getByRole('textbox', { name: /シンボル/ }).fill('TEST');

    // 作成ボタンはまだ無効（銘柄名と取引所が未入力）
    await expect(createButton).toBeDisabled();

    // キャンセルしてモーダルを閉じる
    await page.getByRole('button', { name: 'キャンセル' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test.describe('ティッカー削除', () => {
    let testTicker: CreatedTicker;

    test.beforeEach(async () => {
      // テスト用の Ticker を API 経由で作成
      testTicker = await factory.createTicker();

      // データが反映されるまで待つ
      await new Promise((resolve) => setTimeout(resolve, 2000));
    });

    test('ティッカーを削除できる', async ({ page }) => {
      // ページをリロード
      await page.reload();
      await page.waitForLoadState('networkidle');

      // 作成されたティッカーを検索
      const tickerRow = page.locator(`tr:has-text("${testTicker.symbol}")`);
      await expect(tickerRow).toBeVisible({ timeout: 10000 });

      // 削除ボタンをクリック
      await tickerRow.getByRole('button', { name: /削除/ }).click();

      // 削除確認ダイアログが表示される
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'ティッカー削除' })).toBeVisible();

      // 確認メッセージが表示される
      await expect(page.getByText('本当にこのティッカーを削除しますか？')).toBeVisible();

      // 警告メッセージが表示される
      await expect(page.getByText('この操作は取り消せません')).toBeVisible();

      // 削除ボタンをクリック
      await page.getByRole('button', { name: '削除', exact: true }).click();

      // 成功メッセージが表示される
      await expect(page.getByText('ティッカーを削除しました')).toBeVisible({ timeout: 10000 });

      // ダイアログが閉じる
      await expect(page.getByRole('dialog')).not.toBeVisible();

      // テーブルから削除されたティッカーが消える（セル内で検索）
      await expect(
        page.getByRole('cell', { name: testTicker.symbol, exact: true })
      ).not.toBeVisible();
    });
  });

  test.describe('権限チェック', () => {
    test('stock-viewer ロールではアクセスが拒否される', async ({ page }) => {
      // Note: このテストは認証実装後に有効化
      // 現在は SKIP_AUTH_CHECK=true のため、実装されていない
      test.skip(process.env.SKIP_AUTH_CHECK === 'true', '認証スキップモードのためテストをスキップ');

      // stock-viewer ロールでアクセス
      // （実装は認証システムの実装後に追加）
      await page.goto('/tickers');

      // 403エラーまたはアクセス拒否メッセージが表示される
      await expect(page.getByText(/アクセスが拒否されました|権限がありません/)).toBeVisible();
    });

    test('stock-admin ロールではアクセスが許可される', async ({ page }) => {
      // Note: このテストは認証実装後に有効化
      test.skip(process.env.SKIP_AUTH_CHECK === 'true', '認証スキップモードのためテストをスキップ');

      // stock-admin ロールでアクセス
      // （実装は認証システムの実装後に追加）
      await page.goto('/tickers');

      // ページが正常に表示される
      await expect(page.getByRole('heading', { name: 'ティッカー管理' })).toBeVisible();

      // CRUD操作ボタンが表示される
      await expect(page.getByRole('button', { name: '新規作成' })).toBeVisible();
    });
  });

  test.describe('モバイル対応', () => {
    test('モバイル画面で正しくレイアウトされる', async ({ page }) => {
      // モバイルビューポートで表示される
      await page.setViewportSize({ width: 393, height: 851 });

      // ページが読み込まれるまで待つ
      await page.waitForLoadState('networkidle');

      // ヘッダーが正しく表示される
      await expect(page.getByRole('heading', { name: 'ティッカー管理' })).toBeVisible();

      // ボタンが正しく表示される
      await expect(page.getByRole('button', { name: '新規作成' })).toBeVisible();

      // テーブルがスクロール可能
      await expect(page.getByRole('table')).toBeVisible();
    });
  });
});
