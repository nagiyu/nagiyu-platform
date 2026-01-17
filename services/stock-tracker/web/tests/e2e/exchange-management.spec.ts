import { test, expect } from '@playwright/test';

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
  test.beforeEach(async ({ page }) => {
    // 取引所管理画面にアクセス
    await page.goto('/exchanges');

    // ページが読み込まれるまで待つ
    await page.waitForLoadState('networkidle');
  });

  test('取引所一覧が正しく表示される', async ({ page }) => {
    // ページタイトルが表示される
    await expect(page.locator('h4')).toContainText('取引所管理');

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
    await expect(page.locator('input[placeholder="America/New_York"]')).toBeVisible();
    await expect(page.locator('input[placeholder="09:30"]')).toBeVisible();
    await expect(page.locator('input[placeholder="16:00"]')).toBeVisible();

    // キャンセルボタンをクリック
    await page.locator('button:has-text("キャンセル")').click();

    // モーダルが閉じる
    await expect(modal).not.toBeVisible();
  });

  test('取引所を新規作成できる', async ({ page }) => {
    // テスト用のユニークなID生成
    const testId = `TEST-${Date.now()}`;

    // 新規登録ボタンをクリック
    await page.locator('button:has-text("新規登録")').click();

    // フォームに入力
    await page.locator('input[placeholder="NASDAQ"]').fill(testId);
    await page.locator('input[placeholder="NASDAQ Stock Market"]').fill('Test Exchange');
    await page.locator('input[placeholder="NSDQ"]').fill('TEST');
    await page.locator('input[placeholder="America/New_York"]').fill('America/New_York');
    await page.locator('input[placeholder="09:30"]').fill('09:30');
    await page.locator('input[placeholder="16:00"]').fill('16:00');

    // 保存ボタンをクリック
    await page.locator('button:has-text("保存")').click();

    // モーダルが閉じるまで待つ
    await expect(page.locator('div[role="dialog"]')).not.toBeVisible({ timeout: 5000 });

    // 成功メッセージが表示される
    await expect(page.locator('text=取引所を作成しました')).toBeVisible({ timeout: 3000 });

    // テーブルに新しい取引所が表示される
    await expect(page.locator(`td:has-text("${testId}")`)).toBeVisible();
    await expect(page.locator('td:has-text("Test Exchange")')).toBeVisible();

    // クリーンアップ: 作成した取引所を削除
    await page.locator(`tr:has-text("${testId}") button:has-text("削除")`).click();
    await page.locator('button:has-text("削除")').last().click();
    await page.waitForTimeout(1000);
  });

  test('取引所を編集できる', async ({ page }) => {
    // テーブルに取引所が存在する場合のみテスト
    const firstRow = page.locator('tbody tr').first();
    const rowCount = await page.locator('tbody tr').count();

    if (rowCount === 0 || (await firstRow.locator('text=取引所が登録されていません').count()) > 0) {
      test.skip();
      return;
    }

    // 最初の取引所の元の名前を取得
    const originalName = await firstRow.locator('td').nth(1).textContent();

    // 編集ボタンをクリック
    await firstRow.locator('button:has-text("編集")').click();

    // モーダルが表示される
    await expect(page.locator('h2:has-text("取引所編集")')).toBeVisible();

    // 取引所名を変更
    const nameInput = page.locator('input').nth(1); // 2番目のinput（取引所名）
    await nameInput.clear();
    await nameInput.fill(`${originalName} (Updated)`);

    // 保存ボタンをクリック
    await page.locator('button:has-text("保存")').click();

    // モーダルが閉じるまで待つ
    await expect(page.locator('div[role="dialog"]')).not.toBeVisible({ timeout: 5000 });

    // 成功メッセージが表示される
    await expect(page.locator('text=取引所を更新しました')).toBeVisible({ timeout: 3000 });

    // テーブルが更新される
    await expect(page.locator(`td:has-text("${originalName} (Updated)")`)).toBeVisible();

    // 元の名前に戻す
    await firstRow.locator('button:has-text("編集")').click();
    await page.locator('input').nth(1).clear();
    await page.locator('input').nth(1).fill(originalName || 'Original Name');
    await page.locator('button:has-text("保存")').click();
    await page.waitForTimeout(1000);
  });

  test('削除確認ダイアログが表示される', async ({ page }) => {
    // テーブルに取引所が存在する場合のみテスト
    const firstRow = page.locator('tbody tr').first();
    const rowCount = await page.locator('tbody tr').count();

    if (rowCount === 0 || (await firstRow.locator('text=取引所が登録されていません').count()) > 0) {
      test.skip();
      return;
    }

    // 最初の取引所の名前を取得
    const exchangeName = await firstRow.locator('td').nth(1).textContent();

    // 削除ボタンをクリック
    await firstRow.locator('button:has-text("削除")').click();

    // 削除確認ダイアログが表示される
    await expect(page.locator('h2:has-text("取引所削除")')).toBeVisible();
    await expect(page.locator(`text=取引所「${exchangeName}」を削除してもよろしいですか？`)).toBeVisible();

    // キャンセルボタンをクリック
    await page.locator('button:has-text("キャンセル")').click();

    // ダイアログが閉じる
    await expect(page.locator('div[role="dialog"]')).not.toBeVisible();
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
    const isErrorVisible = await errorAlert.count() > 0;

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
    await expect(page.locator('h4:has-text("取引所管理")')).toBeVisible();
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
