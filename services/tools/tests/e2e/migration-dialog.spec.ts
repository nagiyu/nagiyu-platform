import { test, expect } from '@playwright/test';

// LocalStorage key for migration dialog flag
const MIGRATION_DIALOG_STORAGE_KEY = 'tools-migration-dialog-shown';

test.describe('MigrationDialog', () => {
  // LocalStorageをクリアして初期状態にする
  test.beforeEach(async ({ page, context }) => {
    // ContextのstorageStateをクリアして完全にリセット
    await context.clearCookies();

    // まずページに移動してからLocalStorageをクリア
    await page.goto('/');

    // LocalStorageをクリア
    await page.evaluate(() => {
      localStorage.clear();
    });

    // リロードしてMigrationDialogを再初期化
    await page.reload();

    // ダイアログが実際に表示されるまで待つ
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {
      // ダイアログが表示されない場合もあるのでエラーを無視
    });
  });

  test.describe('基本動作', () => {
    test('初回訪問時にダイアログが表示される', async ({ page }) => {
      // beforeEachでページに移動済み

      // ダイアログが表示されることを確認（useEffectの実行を待つ）
      const dialog = page.getByRole('dialog', { name: 'Toolsアプリが新しくなりました' });
      await expect(dialog).toBeVisible({ timeout: 10000 });

      // タイトルが正しく表示される
      await expect(
        page.getByRole('heading', { name: 'Toolsアプリが新しくなりました' })
      ).toBeVisible();

      // 本文が表示される
      await expect(
        page.getByText('このアプリは以前のバージョンから大幅にアップデートされました。')
      ).toBeVisible();
      await expect(page.getByText('以前のバージョンをインストールされている方は')).toBeVisible();

      // 手順が表示される
      await expect(page.getByText('旧バージョンのアプリをアンインストール')).toBeVisible();
      await expect(page.getByText('このページから新バージョンを再インストール')).toBeVisible();

      // プライバシー情報が表示される
      await expect(
        page.getByText('データはすべて端末内に保存されており、外部に送信されることはありません')
      ).toBeVisible();
    });

    test('「今後表示しない」がデフォルトでチェックされている', async ({ page }) => {
      // beforeEachでページに移動済み

      // チェックボックスを取得
      const checkbox = page.getByRole('checkbox', { name: '今後表示しない' });

      // デフォルトでチェックされていることを確認
      await expect(checkbox).toBeChecked();
    });

    test('チェックONで「閉じる」→次回表示されない', async ({ page }) => {
      // beforeEachでページに移動済み

      // ダイアログが表示されることを確認
      const dialog = page.getByRole('dialog', { name: 'Toolsアプリが新しくなりました' });
      await expect(dialog).toBeVisible();

      // チェックボックスがONであることを確認
      const checkbox = page.getByRole('checkbox', { name: '今後表示しない' });
      await expect(checkbox).toBeChecked();

      // 「閉じる」ボタンをクリック
      await page.getByRole('button', { name: '閉じる' }).click();

      // ダイアログが閉じることを確認
      await expect(dialog).not.toBeVisible();

      // ページをリロード
      await page.reload();

      // ダイアログが表示されないことを確認
      await expect(dialog).not.toBeVisible();

      // LocalStorageにフラグが保存されていることを確認
      const storageValue = await page.evaluate(
        (key) => localStorage.getItem(key),
        MIGRATION_DIALOG_STORAGE_KEY
      );
      expect(storageValue).toBe('true');
    });

    test('チェックOFFで「閉じる」→次回も表示される', async ({ page }) => {
      // beforeEachでページに移動済み

      // ダイアログが表示されることを確認
      const dialog = page.getByRole('dialog', { name: 'Toolsアプリが新しくなりました' });
      await expect(dialog).toBeVisible();

      // チェックボックスをOFFにする
      const checkbox = page.getByRole('checkbox', { name: '今後表示しない' });
      await checkbox.uncheck();
      await expect(checkbox).not.toBeChecked();

      // 「閉じる」ボタンをクリック
      await page.getByRole('button', { name: '閉じる' }).click();

      // ダイアログが閉じることを確認
      await expect(dialog).not.toBeVisible();

      // ページをリロード
      await page.reload();

      // ダイアログが再度表示されることを確認
      await expect(dialog).toBeVisible();

      // LocalStorageにフラグが保存されていないことを確認
      const storageValue = await page.evaluate(
        (key) => localStorage.getItem(key),
        MIGRATION_DIALOG_STORAGE_KEY
      );
      expect(storageValue).toBeNull();
    });

    test('背景クリックでは閉じない', async ({ page }) => {
      // beforeEachでページに移動済み

      // ダイアログが表示されることを確認
      const dialog = page.getByRole('dialog', { name: 'Toolsアプリが新しくなりました' });
      await expect(dialog).toBeVisible();

      // ダイアログの外側（背景）をクリックしようと試みる
      // MUIのDialogは背景をクリックするとonCloseが呼ばれるが、
      // 実装では背景クリックを無効化しているので閉じない
      // 可視状態の backdrop のみをターゲットにする
      await page
        .locator('[role="presentation"]')
        .locator('visible=true')
        .first()
        .click({ position: { x: 1, y: 1 } });

      // ダイアログがまだ表示されていることを確認
      await expect(dialog).toBeVisible();
    });

    test('ESCキーでは閉じない', async ({ page }) => {
      // beforeEachでページに移動済み

      // ダイアログが表示されることを確認
      const dialog = page.getByRole('dialog', { name: 'Toolsアプリが新しくなりました' });
      await expect(dialog).toBeVisible();

      // ESCキーを押す
      await page.keyboard.press('Escape');

      // ダイアログがまだ表示されていることを確認
      await expect(dialog).toBeVisible();
    });
  });

  test.describe('LocalStorage 動作', () => {
    test('LocalStorage を手動削除すると再度表示される', async ({ page }) => {
      // beforeEachでページに移動済み

      // 初回ダイアログを閉じる
      const dialog = page.getByRole('dialog', { name: 'Toolsアプリが新しくなりました' });
      await expect(dialog).toBeVisible();
      await page.getByRole('button', { name: '閉じる' }).click();
      await expect(dialog).not.toBeVisible();

      // ページをリロード - ダイアログは表示されない
      await page.reload();
      await expect(dialog).not.toBeVisible();

      // LocalStorageを手動削除
      await page.evaluate((key) => {
        localStorage.removeItem(key);
      }, MIGRATION_DIALOG_STORAGE_KEY);

      // ページをリロード
      await page.reload();

      // ダイアログが再度表示されることを確認
      await expect(dialog).toBeVisible();
    });

    test('LocalStorage全削除後も再度表示される', async ({ page }) => {
      // beforeEachでページに移動済み

      // 初回ダイアログを閉じる
      const dialog = page.getByRole('dialog', { name: 'Toolsアプリが新しくなりました' });
      await page.getByRole('button', { name: '閉じる' }).click();

      // LocalStorageを全削除
      await page.evaluate(() => localStorage.clear());

      // ページをリロード
      await page.reload();

      // ダイアログが再度表示されることを確認
      await expect(dialog).toBeVisible();
    });
  });

  test.describe('UI/UX', () => {
    test('タイトルが正しく表示される', async ({ page }) => {
      // beforeEachでページに移動済み

      const title = page.getByRole('heading', { name: 'Toolsアプリが新しくなりました' });
      await expect(title).toBeVisible();
      await expect(title).toHaveText('Toolsアプリが新しくなりました');
    });

    test('本文が正しく表示される（改行、箇条書き含む）', async ({ page }) => {
      // beforeEachでページに移動済み

      // 各段落が表示されることを確認
      await expect(
        page.getByText('このアプリは以前のバージョンから大幅にアップデートされました。')
      ).toBeVisible();
      await expect(page.getByText('以前のバージョンをインストールされている方は')).toBeVisible();

      // 箇条書きリストが表示されることを確認
      const listItems = page.locator('ol li');
      await expect(listItems).toHaveCount(2);
      await expect(listItems.nth(0)).toContainText('旧バージョンのアプリをアンインストール');
      await expect(listItems.nth(1)).toContainText('このページから新バージョンを再インストール');

      // プライバシー情報が表示されることを確認
      await expect(page.getByText('データはすべて端末内に保存されており')).toBeVisible();
    });

    test('チェックボックスとラベルが正しく表示される', async ({ page }) => {
      // beforeEachでページに移動済み

      const checkbox = page.getByRole('checkbox', { name: '今後表示しない' });
      await expect(checkbox).toBeVisible();

      // ラベルも表示されることを確認
      await expect(page.getByText('今後表示しない')).toBeVisible();
    });

    test('「閉じる」ボタンが正しく表示される', async ({ page }) => {
      // beforeEachでページに移動済み

      const closeButton = page.getByRole('button', { name: '閉じる' });
      await expect(closeButton).toBeVisible();
      await expect(closeButton).toHaveText('閉じる');
      await expect(closeButton).toBeEnabled();
    });

    test('ボタンクリック時の反応が適切', async ({ page }) => {
      // beforeEachでページに移動済み

      const closeButton = page.getByRole('button', { name: '閉じる' });

      // ボタンがクリック可能であることを確認
      await expect(closeButton).toBeEnabled();

      // クリックしてダイアログが閉じることを確認
      await closeButton.click();

      const dialog = page.getByRole('dialog', { name: 'Toolsアプリが新しくなりました' });
      await expect(dialog).not.toBeVisible();
    });

    test('チェックボックスのトグル動作', async ({ page }) => {
      // beforeEachでページに移動済み

      const checkbox = page.getByRole('checkbox', { name: '今後表示しない' });

      // デフォルトでチェック済み
      await expect(checkbox).toBeChecked();

      // クリックしてOFFにする
      await checkbox.click();
      await expect(checkbox).not.toBeChecked();

      // 再度クリックしてONにする
      await checkbox.click();
      await expect(checkbox).toBeChecked();
    });
  });

  test.describe('レスポンシブ確認', () => {
    test('モバイル表示（375px）', async ({ page }) => {
      // ビューポートをモバイルサイズに設定
      await page.setViewportSize({ width: 375, height: 667 });
      // beforeEachでページに移動済み

      // ダイアログが表示されることを確認
      const dialog = page.getByRole('dialog', { name: 'Toolsアプリが新しくなりました' });
      await expect(dialog).toBeVisible();

      // ダイアログがビューポート内に収まっているか確認
      const dialogBox = await dialog.boundingBox();
      expect(dialogBox).not.toBeNull();
      if (dialogBox) {
        expect(dialogBox.width).toBeLessThanOrEqual(375);
        expect(dialogBox.height).toBeLessThanOrEqual(667);
      }

      // 要素が正しく表示される
      await expect(
        page.getByRole('heading', { name: 'Toolsアプリが新しくなりました' })
      ).toBeVisible();
      await expect(page.getByRole('checkbox', { name: '今後表示しない' })).toBeVisible();
      await expect(page.getByRole('button', { name: '閉じる' })).toBeVisible();
    });

    test('タブレット表示（768px）', async ({ page }) => {
      // ビューポートをタブレットサイズに設定
      await page.setViewportSize({ width: 768, height: 1024 });
      // beforeEachでページに移動済み

      // ダイアログが表示されることを確認
      const dialog = page.getByRole('dialog', { name: 'Toolsアプリが新しくなりました' });
      await expect(dialog).toBeVisible();

      // レイアウトが崩れていないことを確認
      await expect(
        page.getByRole('heading', { name: 'Toolsアプリが新しくなりました' })
      ).toBeVisible();
      await expect(page.getByRole('checkbox', { name: '今後表示しない' })).toBeVisible();
      await expect(page.getByRole('button', { name: '閉じる' })).toBeVisible();
    });

    test('デスクトップ表示（1920px）', async ({ page }) => {
      // ビューポートをデスクトップサイズに設定
      await page.setViewportSize({ width: 1920, height: 1080 });
      // beforeEachでページに移動済み

      // ダイアログが表示されることを確認
      const dialog = page.getByRole('dialog', { name: 'Toolsアプリが新しくなりました' });
      await expect(dialog).toBeVisible();

      // ダイアログが適切なサイズで中央に表示されることを確認
      const dialogBox = await dialog.boundingBox();
      expect(dialogBox).not.toBeNull();
      if (dialogBox) {
        // ダイアログが広すぎないことを確認（最大幅を持つべき）
        expect(dialogBox.width).toBeLessThan(800);

        // 中央寄せされていることを確認（大まかに）
        const centerX = dialogBox.x + dialogBox.width / 2;
        expect(centerX).toBeGreaterThan(1920 / 2 - 100);
        expect(centerX).toBeLessThan(1920 / 2 + 100);
      }

      // レイアウトが崩れていないことを確認
      await expect(
        page.getByRole('heading', { name: 'Toolsアプリが新しくなりました' })
      ).toBeVisible();
      await expect(page.getByRole('checkbox', { name: '今後表示しない' })).toBeVisible();
      await expect(page.getByRole('button', { name: '閉じる' })).toBeVisible();
    });
  });

  test.describe('異なるページでの動作', () => {
    test('トップページで表示される', async ({ page }) => {
      // beforeEachでページに移動済み

      const dialog = page.getByRole('dialog', { name: 'Toolsアプリが新しくなりました' });
      await expect(dialog).toBeVisible();
    });

    test('乗り換え変換ツールページで表示される', async ({ page }) => {
      // 乗り換え変換ツールページに移動
      await page.goto('/transit-converter');
      await page.waitForTimeout(500);

      const dialog = page.getByRole('dialog', { name: 'Toolsアプリが新しくなりました' });
      await expect(dialog).toBeVisible();
    });

    test('ページ遷移してもダイアログ状態が維持される', async ({ page }) => {
      // トップページでダイアログを閉じる
      const dialog = page.getByRole('dialog', { name: 'Toolsアプリが新しくなりました' });
      await page.getByRole('button', { name: '閉じる' }).click();

      // 別ページに遷移
      await page.goto('/transit-converter');
      await page.waitForTimeout(500);

      // ダイアログが表示されないことを確認
      await expect(dialog).not.toBeVisible();
    });
  });
});
