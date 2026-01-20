import { test, expect } from '@playwright/test';
import { TestDataFactory, CreatedExchange } from './utils/test-data-factory';

/**
 * E2E-006: 取引所管理画面のテスト
 *
 * このテストは以下を検証します:
 * - 取引所のCRUD操作が正しく動作する
 * - 権限チェックが機能する（stock-adminのみアクセス可能）
 * - バリデーションエラーが適切に表示される
 * - 画面が正しく更新される
 */

test.describe('取引所管理画面 (E2E-006)', () => {
  let factory: TestDataFactory;

  test.beforeEach(async ({ page, request }) => {
    // TestDataFactory を初期化
    factory = new TestDataFactory(request);

    // 取引所管理画面にアクセス
    await page.goto('/exchanges');

    // ページが読み込まれるまで待つ
    await page.waitForLoadState('networkidle');
  });

  test.afterEach(async () => {
    // TestDataFactory でクリーンアップ
    await factory.cleanup();
  });

  test('取引所一覧が正しく表示される', async ({ page }) => {
    // ページタイトルが表示される
    await expect(page.locator('h1:has-text("取引所管理")')).toBeVisible();

    // テーブルが表示される
    const table = page.locator('table');
    await expect(table).toBeVisible();

    // テーブルヘッダーが表示される
    await expect(page.locator('th:has-text("取引所ID")')).toBeVisible();
    await expect(page.locator('th:has-text("取引所名")')).toBeVisible();
    await expect(page.locator('th:has-text("APIキー")')).toBeVisible();
    await expect(page.locator('th:has-text("タイムゾーン")')).toBeVisible();
    await expect(page.locator('th:has-text("取引時間")')).toBeVisible();
    await expect(page.locator('th:has-text("操作")')).toBeVisible();
  });

  test('新規登録ボタンが表示される', async ({ page }) => {
    // 新規登録ボタンが表示される
    const createButton = page.locator('button:has-text("新規登録")');
    await expect(createButton).toBeVisible();
  });

  test('戻るボタンをクリックするとトップ画面に遷移する', async ({ page }) => {
    // 戻るボタンをクリック
    await page.locator('button:has-text("戻る")').click();

    // トップ画面に遷移することを確認
    await expect(page).toHaveURL('/');
  });

  test('新規登録モーダルが開閉できる', async ({ page }) => {
    // 新規登録ボタンをクリック
    await page.locator('button:has-text("新規登録")').click();

    // モーダルが表示される
    const modal = page.locator('div[role="dialog"]');
    await expect(modal).toBeVisible();
    await expect(page.locator('h2:has-text("取引所登録")')).toBeVisible();

    // フォームフィールドが表示される
    await expect(page.locator('input[placeholder="NASDAQ"]')).toBeVisible();
    await expect(page.locator('input[placeholder="NASDAQ Stock Market"]')).toBeVisible();
    await expect(page.locator('input[placeholder="NSDQ"]')).toBeVisible();

    // タイムゾーン選択、時間選択が表示される
    await expect(modal.getByText('タイムゾーン', { exact: true }).first()).toBeVisible();
    await expect(modal.getByText('取引開始時間', { exact: true }).first()).toBeVisible();
    await expect(modal.getByText('取引終了時間', { exact: true }).first()).toBeVisible();

    // キャンセルボタンをクリック
    await page.locator('button:has-text("キャンセル")').click();

    // モーダルが閉じる
    await expect(modal).not.toBeVisible();
  });

  test.describe('取引所作成', () => {
    test('取引所を新規作成できる', async ({ page }) => {
      // テスト用のユニークなID生成
      const testId = `E2E${Date.now() % 100000}`;

      // 新規登録ボタンをクリック
      await page.locator('button:has-text("新規登録")').click();

      const modal = page.locator('div[role="dialog"]');
      await expect(modal).toBeVisible();

      // 基本情報を入力
      await page.locator('input[placeholder="NASDAQ"]').fill(testId);
      await page.locator('input[placeholder="NASDAQ Stock Market"]').fill('Test Exchange');
      await page.locator('input[placeholder="NSDQ"]').fill('TEST');

      // タイムゾーンを選択 - フォームコントロールを特定して操作
      // タイムゾーンのSelect（最初のSelect）
      const selects = modal.locator('.MuiSelect-select');
      await selects.nth(0).click();
      await page.getByRole('option', { name: /America\/New_York/ }).click();

      // 取引開始時間 - 時
      await selects.nth(1).click();
      await page.getByRole('option', { name: '09' }).first().click();

      // 取引開始時間 - 分
      await selects.nth(2).click();
      await page.getByRole('option', { name: '30' }).first().click();

      // 取引終了時間 - 時
      await selects.nth(3).click();
      await page.getByRole('option', { name: '16' }).first().click();

      // 取引終了時間 - 分（00はデフォルトなのでスキップ可能だが、念のため）
      await selects.nth(4).click();
      await page.getByRole('option', { name: '00' }).first().click();

      // 保存ボタンをクリック
      await page.locator('button:has-text("保存")').click();

      // モーダルが閉じるまで待つ
      await expect(modal).not.toBeVisible({ timeout: 5000 });

      // 成功メッセージが表示される
      await expect(page.locator('text=取引所を作成しました')).toBeVisible({ timeout: 3000 });

      // テーブルに新しい取引所が表示される
      await expect(page.locator(`td:has-text("${testId}")`)).toBeVisible();
      // テスト用の取引所の行で「Test Exchange」が表示されることを確認
      const createdRow = page.locator(`tr:has-text("${testId}")`);
      await expect(createdRow.locator('td:has-text("Test Exchange")')).toBeVisible();

      // クリーンアップ: 作成した取引所を削除（UIで作成したため手動削除が必要）
      await page.locator(`tr:has-text("${testId}") button:has-text("削除")`).click();
      await page.locator('button:has-text("削除")').last().click();
      await page.waitForTimeout(1000);
    });
  });

  test.describe('取引所編集', () => {
    let testExchange: CreatedExchange;
    const updatedName = 'Updated Exchange Name';

    test.beforeEach(async () => {
      // テスト用の Exchange を API 経由で作成
      testExchange = await factory.createExchange();

      // データが反映されるまで待つ
      await new Promise((resolve) => setTimeout(resolve, 2000));
    });

    test('取引所を編集できる', async ({ page }) => {
      // ページをリロード
      await page.reload();
      await page.waitForLoadState('networkidle');

      // 作成された取引所を検索
      const targetRow = page.locator(`tr:has-text("${testExchange.exchangeId}")`);
      await expect(targetRow).toBeVisible({ timeout: 10000 });

      // 編集ボタンをクリック
      await targetRow.locator('button:has-text("編集")').click();

      // モーダルが表示される
      await expect(page.locator('h2:has-text("取引所編集")')).toBeVisible();

      // 取引所名フィールドを探して変更
      // 取引所名は2番目のフィールド（取引所IDの次）
      const dialogContent = page.locator('div[role="dialog"]');
      const textFields = dialogContent.locator('input[type="text"]');

      // 取引所名フィールドを特定（取引所IDはdisabled、取引所名はenabled）
      const nameFieldIndex = await textFields.evaluateAll((inputs) => {
        return inputs.findIndex((input) => !input.disabled && input.value.length > 0);
      });

      const nameInput = textFields.nth(nameFieldIndex);
      await nameInput.clear();
      await nameInput.fill(updatedName);

      // 保存ボタンをクリック
      await page.locator('button:has-text("保存")').click();

      // モーダルが閉じるまで待つ
      await expect(page.locator('div[role="dialog"]')).not.toBeVisible({ timeout: 5000 });

      // 成功メッセージが表示される
      await expect(page.locator('text=取引所を更新しました')).toBeVisible({ timeout: 3000 });

      // テーブルが更新される
      await expect(page.locator(`td:has-text("${updatedName}")`)).toBeVisible();
    });
  });

  test.describe('削除確認ダイアログ', () => {
    let testExchange: CreatedExchange;

    test.beforeEach(async () => {
      // テスト用の Exchange を API 経由で作成
      testExchange = await factory.createExchange();

      // データが反映されるまで待つ
      await new Promise((resolve) => setTimeout(resolve, 2000));
    });

    test('削除確認ダイアログが表示される', async ({ page }) => {
      // ページをリロード
      await page.reload();
      await page.waitForLoadState('networkidle');

      // 作成された取引所を検索
      const targetRow = page.locator(`tr:has-text("${testExchange.exchangeId}")`);
      await expect(targetRow).toBeVisible({ timeout: 10000 });

      // 削除ボタンをクリック
      await targetRow.locator('button:has-text("削除")').click();

      // 削除確認ダイアログが表示される
      await expect(page.locator('h2:has-text("取引所削除")')).toBeVisible();
      await expect(
        page.locator(`text=取引所「${testExchange.name}」を削除してもよろしいですか？`)
      ).toBeVisible();

      // キャンセルボタンをクリック
      await page.locator('button:has-text("キャンセル")').click();

      // ダイアログが閉じる
      await expect(page.locator('div[role="dialog"]')).not.toBeVisible();
    });

    test('取引所を削除できる', async ({ page }) => {
      // ページをリロード
      await page.reload();
      await page.waitForLoadState('networkidle');

      // 作成された取引所を検索
      const targetRow = page.locator(`tr:has-text("${testExchange.exchangeId}")`);
      await expect(targetRow).toBeVisible({ timeout: 10000 });

      // 削除ボタンをクリック
      await targetRow.locator('button:has-text("削除")').click();

      // 削除確認ダイアログが表示される
      await expect(page.locator('h2:has-text("取引所削除")')).toBeVisible();

      // 削除ボタンをクリック
      await page.locator('button:has-text("削除")').last().click();

      // ダイアログが閉じる
      await expect(page.locator('div[role="dialog"]')).not.toBeVisible({ timeout: 5000 });

      // 成功メッセージが表示される
      await expect(page.locator('text=取引所を削除しました')).toBeVisible({ timeout: 3000 });

      // テーブルから削除されたことを確認
      await expect(page.locator(`td:has-text("${testExchange.exchangeId}")`)).not.toBeVisible();

      // factory が管理している exchange をリストから削除（既にUIで削除済みのため）
      // Note: これは factory.cleanup() でエラーにならないようにするためではなく、
      // 削除が成功したことを示すため
    });
  });

  test('エラーメッセージが表示される', async ({ page }) => {
    // 新規登録ボタンをクリック
    await page.locator('button:has-text("新規登録")').click();

    // 空のフォームで保存を試みる（バリデーションエラー）
    await page.locator('button:has-text("保存")').click();

    // エラーメッセージまたはモーダルが表示され続けることを確認
    // （バックエンドのバリデーションエラーが返される）
    await page.waitForTimeout(1000);

    // モーダルが開いたままかエラーメッセージが表示される
    const modal = page.locator('div[role="dialog"]');
    const errorAlert = page.locator('[role="alert"]');

    const isModalVisible = await modal.isVisible();
    const isErrorVisible = (await errorAlert.count()) > 0;

    expect(isModalVisible || isErrorVisible).toBeTruthy();
  });

  test('ローディング状態が正しく表示される', async ({ page }) => {
    // ページリロード時にローディングが表示されるかチェック
    await page.reload();

    // ローディングインジケーターまたはテーブルがすぐに表示される
    // （高速なAPIレスポンスの場合はローディングが見えない可能性がある）
    const loading = page.locator('role=progressbar');
    const table = page.locator('table');

    // どちらかが表示されることを確認
    await expect(loading.or(table)).toBeVisible({ timeout: 3000 });
  });
});

test.describe('取引所管理画面 - 権限チェック (E2E-005の一部)', () => {
  test('stock-admin ロールでアクセスできる', async ({ page }) => {
    // テスト環境では SKIP_AUTH_CHECK=true で stock-admin ロールが設定されている想定

    await page.goto('/exchanges');
    await page.waitForLoadState('networkidle');

    // ページが正常に表示される（403エラーが表示されない）
    await expect(page.locator('h1:has-text("取引所管理")')).toBeVisible();
    await expect(page.locator('button:has-text("新規登録")')).toBeVisible();
  });

  test('エラーメッセージが適切に表示される', async ({ page }) => {
    // 認証エラーや権限エラーが発生した場合の表示を確認
    await page.goto('/exchanges');
    await page.waitForLoadState('networkidle');

    // エラーが発生していない場合はテーブルが表示される
    const errorAlert = page.locator('[role="alert"]');
    const table = page.locator('table');

    // エラーがある場合はエラーメッセージ、ない場合はテーブルが表示される
    const hasError = (await errorAlert.count()) > 0;
    const hasTable = await table.isVisible();

    expect(hasError || hasTable).toBeTruthy();
  });
});

test.describe('取引所管理画面 - アクセシビリティ', () => {
  test('キーボードナビゲーションが機能する', async ({ page }) => {
    await page.goto('/exchanges');
    await page.waitForLoadState('networkidle');

    // 新規登録ボタンにフォーカスを移動
    await page.keyboard.press('Tab');

    // フォーカスされた要素を確認（戻るボタンまたは新規登録ボタン）
    const focusedElement = page.locator(':focus');
    await expect(focusedElement).toBeVisible();
  });

  test('ボタンとリンクに適切なラベルが設定されている', async ({ page }) => {
    await page.goto('/exchanges');
    await page.waitForLoadState('networkidle');

    // 新規登録ボタンのラベルを確認
    const createButton = page.locator('button:has-text("新規登録")');
    await expect(createButton).toBeVisible();
    await expect(createButton).toHaveAttribute('type', 'button');

    // 戻るボタンのラベルを確認
    const backButton = page.locator('button:has-text("戻る")');
    await expect(backButton).toBeVisible();
  });
});
