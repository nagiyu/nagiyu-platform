import { test, expect, suppressMigrationDialog } from './helpers';

/**
 * chromium-mobile プロジェクトは playwright.config.base.ts 側で `serviceWorkers: 'block'` を
 * 設定済みだが、chromium-desktop / webkit-mobile は未設定という非対称がある。
 * stock-tracker / niconico-mylist-assistant では実際に Service Worker
 *（`@nagiyu/ui` の ServiceWorkerRegistration 経由で `/sw.js` を登録）を使っており、
 * webkit 環境で SW が `page.route` のモックを迂回して非決定性を生むことが実測されている
 * ため、一律に block している。
 *
 * tools サービスは manifest.json で PWA 対応を謳っているが、`layout.tsx` は
 * ServiceWorkerRegistration を組み込んでおらず `public/sw.js` も存在しないため、
 * 実際には Service Worker を一切登録しない（pwa.spec.ts のコメント参照）。
 * したがって本ファイルでの `serviceWorkers: 'block'` は現時点では効果を持たない
 * （将来 SW 実装が入った際の予防的デフォルト、および他サービスとの記法統一のために付与）。
 */
test.use({ serviceWorkers: 'block' });

// テストデータ: 実際の乗り換え案内フォーマット
const VALID_TRANSIT_TEXT = `渋谷 ⇒ 新宿
2025年1月15日(月)
09:00 ⇒ 09:15
------------------------------
所要時間 15分
運賃[IC優先] 200円
乗換 0回
距離 5.2 km
------------------------------

■渋谷
↓ 09:00〜09:15
↓ JR山手線 池袋行
↓ 3番線発 → 15番線着
■新宿`;

const VALID_TRANSIT_TEXT_WITH_TRANSFER = `東京 ⇒ 横浜
2025年1月15日(月)
10:00 ⇒ 10:45
------------------------------
所要時間 45分
運賃[IC優先] 500円
乗換 1回
距離 30.5 km
------------------------------

■東京
↓ 10:00〜10:20
↓ JR東海道線 熱海行
↓ 1番線発 → 2番線着
■品川
↓ 10:25〜10:45
↓ JR京浜東北線 横浜方面
↓ 3番線発 → 4番線着
■横浜`;

// 無効な入力データ
const INVALID_TRANSIT_TEXT = `これは乗り換え案内ではありません
ただのテキストです`;

test.describe('Transit Converter - E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // MigrationDialog が表示されない状態を確定させてからページへ移動する
    await suppressMigrationDialog(page);

    // 各テスト前にLocalStorageをクリア
    await page.goto('/transit-converter');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test.describe('1. 基本フロー（入力→変換→コピー）', () => {
    test('should convert transit text and copy to clipboard', async ({
      page,
      context,
      browserName,
    }) => {
      // クリップボード権限の付与 (Safari/WebKitは clipboard-write をサポートしていないためスキップ)
      if (browserName === 'chromium') {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      }

      // ページの全textareaを取得し、最初の空のものが入力フィールド
      // Material UIでは、label配下にtextareaがあるので、「入力」セクションの下のtextareaを探す
      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await expect(inputField).toBeVisible();
      await inputField.fill(VALID_TRANSIT_TEXT);

      // 変換ボタンをクリック
      const convertButton = page.getByRole('button', { name: '乗り換え案内テキストを変換する' });
      await expect(convertButton).toBeEnabled();
      await convertButton.click();

      // 成功メッセージのSnackbarが表示されることを確認
      await expect(page.locator('text=変換が完了しました')).toBeVisible({ timeout: 10000 });

      // 出力フィールド - 「出力」セクションの下のtextarea
      const outputField = page.locator('text=出力').locator('..').locator('textarea').first();
      await expect(outputField).toBeVisible();

      // 出力フィールドに値が入っていることを確認
      const outputValue = await outputField.inputValue();
      expect(outputValue).toContain('渋谷');
      expect(outputValue).toContain('新宿');
      expect(outputValue).toContain('09:00');

      // コピーボタンをクリック
      const copyButton = page.getByRole('button', { name: '変換結果をクリップボードにコピーする' });
      await expect(copyButton).toBeEnabled();
      await copyButton.click();

      // コピー成功のSnackbarが表示されることを確認
      await expect(page.locator('text=クリップボードにコピーしました')).toBeVisible({
        timeout: 10000,
      });

      // クリップボードの内容を確認 (Chromiumのみ)
      if (browserName === 'chromium') {
        const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
        expect(clipboardText).toContain('渋谷');
        expect(clipboardText).toContain('新宿');
      }
    });

    test('should handle transit text with transfers', async ({ page, context, browserName }) => {
      if (browserName === 'chromium') {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      }

      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await inputField.fill(VALID_TRANSIT_TEXT_WITH_TRANSFER);

      const convertButton = page.getByRole('button', { name: '乗り換え案内テキストを変換する' });
      await convertButton.click();

      await expect(page.locator('text=変換が完了しました')).toBeVisible({ timeout: 10000 });

      const outputField = page.locator('text=出力').locator('..').locator('textarea').first();
      const outputValue = await outputField.inputValue();

      // 乗り換え情報が含まれていることを確認
      expect(outputValue).toContain('東京');
      expect(outputValue).toContain('横浜');
      expect(outputValue).toContain('品川'); // 乗り換え駅
      expect(outputValue).toContain('1回'); // 乗換回数
    });
  });

  test.describe('2. クリップボード読み取り機能', () => {
    /**
     * 以前は「CI環境のクリップボード制約」を理由に無条件 test.skip されていたが、
     * 実際の原因はロケータのバグだった: `getByRole('button', { name: /クリップボードから読み取り/ })`
     * は、ボタンの アクセシブルネーム（aria-label="クリップボードから乗り換え案内テキストを読み取る"）
     * ではなく可視テキスト（「クリップボードから読み取り」）にマッチさせようとしていたが、
     * 可視テキストは aria-label に上書きされるため一致せず、要素が見つからずタイムアウトしていた。
     * aria-label をそのまま指定するよう修正したところ、json-formatter.spec.ts と同じ手法
     * （Chromium のみ context.grantPermissions を使う）で決定的に動作することを確認できたため復活させる。
     */
    test('should read text from clipboard', async ({ page, context, browserName }) => {
      test.skip(
        browserName !== 'chromium',
        'clipboard-read/write の grantPermissions は Chromium のみ対応'
      );

      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.waitForLoadState('networkidle');

      await page.evaluate((text) => {
        return navigator.clipboard.writeText(text);
      }, VALID_TRANSIT_TEXT);

      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await expect(inputField).toHaveValue('');

      const readButton = page.getByRole('button', {
        name: 'クリップボードから乗り換え案内テキストを読み取る',
      });
      await readButton.click();

      await expect(inputField).toHaveValue(VALID_TRANSIT_TEXT, { timeout: 15000 });
    });

    /**
     * grantPermissions を呼ばない場合、Chromium では navigator.clipboard.readText() が
     * 権限エラーで失敗し、`@nagiyu/browser` の readFromClipboard が固定文言
     * 「クリップボードの読み取りに失敗しました。手動で貼り付けてください。」に正規化して
     * 例外を投げることを実測で確認した。この文言を Snackbar で assert することで、
     * 「権限エラー時にアプリがクラッシュせず適切なエラー表示をする」ことを決定的に検証できる。
     */
    test('should handle clipboard permission error gracefully', async ({ page, browserName }) => {
      test.skip(
        browserName !== 'chromium',
        'clipboard 権限拒否時の挙動は Chromium でのみ決定的に再現する'
      );

      await page.waitForLoadState('networkidle');

      const readButton = page.getByRole('button', {
        name: 'クリップボードから乗り換え案内テキストを読み取る',
      });
      await expect(readButton).toBeVisible();
      await readButton.click();

      await expect(
        page.locator('text=クリップボードの読み取りに失敗しました。手動で貼り付けてください。')
      ).toBeVisible({ timeout: 10000 });

      // エラー後もページが機能し続けることを確認
      const heading = page.locator('h1, h4').filter({ hasText: /乗り換え変換/ });
      await expect(heading).toBeVisible();

      const convertButton = page.getByRole('button', { name: '乗り換え案内テキストを変換する' });
      await expect(convertButton).toBeVisible();
    });
  });

  test.describe('3. Web Share Target機能（URLパラメータ経由）', () => {
    test('should auto-fill from ?url parameter', async ({ page }) => {
      const encodedUrl = encodeURIComponent('https://example.com/transit?data=test');
      await page.goto(`/transit-converter?url=${encodedUrl}`);

      // 入力欄に自動挿入されることを確認（固定 waitForTimeout ではなく、値が入るまで
      // 自動リトライする toHaveValue で待つ）
      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await expect(inputField).toHaveValue('https://example.com/transit?data=test');

      // 通知が表示されることを確認
      await expect(page.locator('text=共有されたデータを読み込みました')).toBeVisible({
        timeout: 10000,
      });

      // URLパラメータがクリーンアップされることを確認
      await expect.poll(() => page.url()).not.toContain('?url=');
      expect(page.url()).toContain('/transit-converter');
    });

    test('should auto-fill from ?text parameter', async ({ page }) => {
      const testText = '渋谷 ⇒ 新宿';
      const encodedText = encodeURIComponent(testText);
      await page.goto(`/transit-converter?text=${encodedText}`);

      // 入力欄に自動挿入されることを確認
      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await expect(inputField).toHaveValue(testText);

      // 通知が表示されることを確認
      await expect(page.locator('text=共有されたデータを読み込みました')).toBeVisible({
        timeout: 10000,
      });

      // URLパラメータがクリーンアップされることを確認
      await expect.poll(() => page.url()).not.toContain('?text=');
      expect(page.url()).toContain('/transit-converter');
    });

    test('should prioritize ?url over ?text', async ({ page }) => {
      const testUrl = 'https://example.com/transit';
      const testText = '渋谷 ⇒ 新宿';
      await page.goto(
        `/transit-converter?url=${encodeURIComponent(testUrl)}&text=${encodeURIComponent(testText)}`
      );

      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();

      // URLが優先されることを確認
      await expect(inputField).toHaveValue(testUrl);
    });
  });

  test.describe('4. 表示設定の永続化（LocalStorage）', () => {
    test('should save and restore display settings', async ({ page, context, browserName }) => {
      if (browserName === 'chromium') {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      }

      // まず変換を実行して出力を生成
      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await inputField.fill(VALID_TRANSIT_TEXT_WITH_TRANSFER);

      const convertButton = page.getByRole('button', { name: '乗り換え案内テキストを変換する' });
      await convertButton.click();

      await expect(page.locator('text=変換が完了しました')).toBeVisible({ timeout: 10000 });

      // 初期状態の出力を取得
      const outputField = page.locator('text=出力').locator('..').locator('textarea').first();
      const initialOutput = await outputField.inputValue();
      expect(initialOutput).toBeTruthy();

      // 表示設定セクションを開く
      const settingsButton = page.getByRole('button', { name: /表示設定/ });
      await settingsButton.click();

      // 「日付を表示」チェックボックスの状態を切り替える。
      // DisplaySettingsSection.tsx は常に11個のチェックボックスを固定でレンダリングするため
      // （`input[type="checkbox"]` の有無を実行時に判定する必要はない）、
      // 名前付きロケータで一意に指定できる。
      const dateCheckbox = page.getByRole('checkbox', { name: '日付を表示' });
      await expect(dateCheckbox).toBeVisible();
      const wasChecked = await dateCheckbox.isChecked();
      await dateCheckbox.click();
      await expect(dateCheckbox).toBeChecked({ checked: !wasChecked });

      // ページをリロード
      await page.reload();
      await page.waitForLoadState('networkidle');

      // LocalStorageから設定が復元されることを確認
      const storedSettings = await page.evaluate(() => {
        const data = localStorage.getItem('transit-converter-display-settings');
        return data ? JSON.parse(data) : null;
      });

      expect(storedSettings).toBeTruthy();
      expect(storedSettings.showDate).toBe(!wasChecked);

      // リロード後もUI上のチェック状態が復元されていることを確認
      const settingsButtonAfterReload = page.getByRole('button', { name: /表示設定/ });
      await settingsButtonAfterReload.click();
      const dateCheckboxAfterReload = page.getByRole('checkbox', { name: '日付を表示' });
      await expect(dateCheckboxAfterReload).toBeChecked({ checked: !wasChecked });
    });

    test('should work in private mode (localStorage unavailable)', async ({ page }) => {
      // LocalStorageを無効化
      await page.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', {
          value: {
            getItem: () => {
              throw new Error('localStorage is disabled');
            },
            setItem: () => {
              throw new Error('localStorage is disabled');
            },
            removeItem: () => {
              throw new Error('localStorage is disabled');
            },
            clear: () => {
              throw new Error('localStorage is disabled');
            },
            key: () => null,
            length: 0,
          },
          writable: false,
        });
      });

      await page.goto('/transit-converter');

      // localStorage.getItem が例外を投げるため、MigrationDialog の useEffect は
      // catch 節で setOpen(true) を呼び、ダイアログは必ず表示される
      // （安全側に倒す実装。src/components/dialogs/MigrationDialog.tsx 参照）。
      // このシナリオでは suppressMigrationDialog も同じ localStorage 経由のため無効であり、
      // 「必ず表示される」という単一の結末を明示的に待って閉じる。
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible({ timeout: 10000 });
      await page.getByRole('button', { name: '閉じる' }).click();
      await expect(dialog).not.toBeVisible();

      // ページが正常にロードされることを確認（エラーが発生しない）
      const heading = page.locator('h1, h4').filter({ hasText: /乗り換え変換/ });
      await expect(heading).toBeVisible();

      // 基本機能が動作することを確認
      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await inputField.fill(VALID_TRANSIT_TEXT);

      const convertButton = page.getByRole('button', { name: '乗り換え案内テキストを変換する' });
      await convertButton.click();

      // 変換が成功することを確認
      await expect(page.locator('text=変換が完了しました')).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('5. エラーハンドリング', () => {
    test('should show error for invalid input format', async ({ page }) => {
      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await inputField.fill(INVALID_TRANSIT_TEXT);

      const convertButton = page.getByRole('button', { name: '乗り換え案内テキストを変換する' });
      await convertButton.click();

      // `lib/parsers/transitParser.ts` の ERROR_MESSAGES.INVALID_FORMAT は、入力に「⇒」が
      // 含まれない場合に一意に返る文言であり、決定的に assert できる
      // （以前は `[role="alert"]` と汎用テキスト正規表現を `.or()` で束ね、件数が1件以上あることしか
      // 見ておらず、何が表示されたかを検証していなかった）。
      await expect(
        page.getByRole('alert').getByText('乗り換え案内のテキストを正しく解析できませんでした。')
      ).toBeVisible({ timeout: 10000 });
    });

    test('should show error for empty input', async ({ page }) => {
      const convertButton = page.getByRole('button', { name: '乗り換え案内テキストを変換する' });

      // 空入力の場合、変換ボタンが無効になることを確認
      await expect(convertButton).toBeDisabled();
    });

    test('should show error when parsing fails', async ({ page }) => {
      // ⇒は含むが、他のフォーマットが不正なテキスト
      const partiallyValidText = '渋谷 ⇒ 新宿\n不正なフォーマット';

      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await inputField.fill(partiallyValidText);

      const convertButton = page.getByRole('button', { name: '乗り換え案内テキストを変換する' });
      await convertButton.click();

      // `app/transit-converter/page.tsx` の handleConvert は、parseTransitText が null を
      // 返した場合に固定文言「テキストを解析できませんでした。乗り換え案内のテキストを確認してください。」
      // を表示する。この文言を決定的に assert する。
      await expect(
        page
          .getByRole('alert')
          .getByText('テキストを解析できませんでした。乗り換え案内のテキストを確認してください。')
      ).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('6. クリア機能', () => {
    test('should clear both input and output', async ({ page, context, browserName }) => {
      if (browserName === 'chromium') {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      }

      // まず入力して変換
      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await inputField.fill(VALID_TRANSIT_TEXT);

      const convertButton = page.getByRole('button', { name: '乗り換え案内テキストを変換する' });
      await convertButton.click();

      await expect(page.locator('text=変換が完了しました')).toBeVisible({ timeout: 10000 });

      // 出力が生成されることを確認
      const outputField = page.locator('text=出力').locator('..').locator('textarea').first();
      const outputBefore = await outputField.inputValue();
      expect(outputBefore).toBeTruthy();

      // クリアボタンをクリック
      const clearButton = page.getByRole('button', { name: '入力と出力をクリアする' });
      await clearButton.click();

      // 入力と出力が空になることを確認
      const inputAfter = await inputField.inputValue();
      const outputAfter = await outputField.inputValue();
      expect(inputAfter).toBe('');
      expect(outputAfter).toBe('');
    });

    test('should disable clear button when no input or output', async ({ page }) => {
      const clearButton = page.getByRole('button', { name: '入力と出力をクリアする' });

      // 初期状態ではクリアボタンが無効
      await expect(clearButton).toBeDisabled();
    });
  });

  test.describe('7. アクセシビリティ', () => {
    /**
     * 【人の判断で skip 継続が決定済み】既知の未修正バグ（共有コンポーネントの
     * コントラスト違反）を封印している skip であり、削除も復活もしない。
     *
     * ただし本対応中に axe-core（wcag2a/wcag2aa/wcag21a/wcag21aa、および
     * デフォルトルールセット全体）で footer/header を含めて実際にスキャンしたところ、
     * chromium-desktop・chromium-mobile のいずれでも contrast 系を含め違反は
     * 0件だった（is initial state, footer/header除外なし）。つまりこの skip が
     * 前提としている「共有コンポーネントのコントラスト違反」は、現在のこの環境・
     * バージョンの @nagiyu/ui では再現しない。コメントに残っていた古い理由を
     * そのまま引き継ぐのではなく実態を明記し、再現しない事実は報告に切り出す
     * （このテスト自体は human 判断により skip のまま維持する）。
     */
    test.skip('should pass accessibility tests', async ({ page, makeAxeBuilder }) => {
      await page.goto('/transit-converter');

      const accessibilityScanResults = await makeAxeBuilder()
        .exclude('footer')
        .exclude('header')
        .analyze();

      const seriousViolations = accessibilityScanResults.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious'
      );
      expect(seriousViolations).toEqual([]);
    });

    test('should have proper ARIA labels', async ({ page }) => {
      await page.goto('/transit-converter');

      // 重要なボタンにARIAラベルが設定されていることを確認
      // 正確なテキストで指定してstrict mode violationを回避
      await expect(
        page.getByRole('button', { name: 'クリップボードから乗り換え案内テキストを読み取る' })
      ).toHaveAttribute('aria-label');
      await expect(
        page.getByRole('button', { name: '乗り換え案内テキストを変換する' })
      ).toHaveAttribute('aria-label');
      await expect(
        page.getByRole('button', { name: '変換結果をクリップボードにコピーする' })
      ).toHaveAttribute('aria-label');
      await expect(page.getByRole('button', { name: '入力と出力をクリアする' })).toHaveAttribute(
        'aria-label'
      );
    });
  });
});
