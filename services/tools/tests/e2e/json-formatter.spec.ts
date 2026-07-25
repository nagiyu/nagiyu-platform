import { test, expect, suppressMigrationDialog, waitForHydration } from './helpers';
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
 * 実際には Service Worker を一切登録しない（後述の pwa.spec.ts のコメント参照）。
 * したがって本ファイルでの `serviceWorkers: 'block'` は現時点では効果を持たない
 * （将来 SW 実装が入った際の予防的デフォルト、および他サービスとの記法統一のために付与）。
 */
test.use({ serviceWorkers: 'block' });

// テストデータ: 有効な JSON
const VALID_JSON_OBJECT = `{"name":"John","age":30,"city":"Tokyo"}`;
const VALID_JSON_ARRAY = `[1,2,3,4,5]`;
const VALID_JSON_NESTED = `{"user":{"name":"Alice","profile":{"age":25,"country":"Japan"}},"items":[{"id":1,"value":"test"}]}`;

// 無効な JSON データ
const INVALID_JSON_MISSING_QUOTE = `{name:"John"}`;
const INVALID_JSON_TRAILING_COMMA = `{"name":"John",}`;
const INVALID_JSON_SINGLE_QUOTES = `{'name':'John'}`;
const EMPTY_INPUT = '';

test.describe('JSON Formatter - E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // MigrationDialog が表示されない状態を確定させてからページへ移動する
    await suppressMigrationDialog(page);

    // 各テスト前にLocalStorageをクリア
    await page.goto('/json-formatter');
    // hydration 前に fill しても onChange が発火せず、整形ボタン等が disabled のままに
    // なるため、最初の操作の前に読み込み完了を待つ（webkit-mobile で実測）。
    await waitForHydration(page);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test.describe('1. ページアクセステスト', () => {
    test('should load JSON Formatter page successfully', async ({ page }) => {
      await page.goto('/json-formatter');

      // ページタイトルの確認
      const heading = page.locator('h1, h4').filter({ hasText: /JSON 整形/ });
      await expect(heading).toBeVisible();

      // 説明文の確認
      await expect(page.locator('text=JSON の整形・圧縮・検証ができます')).toBeVisible();

      // 主要な要素が存在することを確認
      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await expect(inputField).toBeVisible();

      const outputField = page.locator('text=出力').locator('..').locator('textarea').first();
      await expect(outputField).toBeVisible();

      // ボタンの存在確認
      await expect(page.getByRole('button', { name: 'JSON を整形する' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'JSON を圧縮する' })).toBeVisible();
    });
  });

  test.describe('2. 整形機能テスト', () => {
    test('should format valid JSON object', async ({ page }) => {
      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await expect(inputField).toBeVisible();
      await inputField.fill(VALID_JSON_OBJECT);

      const formatButton = page.getByRole('button', { name: 'JSON を整形する' });
      await expect(formatButton).toBeEnabled();
      await formatButton.click();

      // 成功メッセージのSnackbarが表示されることを確認
      await expect(page.locator('text=整形が完了しました')).toBeVisible({ timeout: 10000 });

      // 出力フィールドに整形された結果が表示されることを確認
      const outputField = page.locator('text=出力').locator('..').locator('textarea').first();
      await expect(outputField).toBeVisible();

      const outputValue = await outputField.inputValue();
      // 整形された JSON は複数行になり、インデントが含まれる
      expect(outputValue).toContain('name');
      expect(outputValue).toContain('John');
      expect(outputValue).toContain('age');
      expect(outputValue).toContain('30');
      // 改行が含まれていることを確認（整形されている証拠）
      expect(outputValue).toContain('\n');
      // インデントが含まれていることを確認
      expect(outputValue).toMatch(/\s{2}"name"/);
    });

    test('should format valid JSON array', async ({ page }) => {
      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await inputField.fill(VALID_JSON_ARRAY);

      const formatButton = page.getByRole('button', { name: 'JSON を整形する' });
      await formatButton.click();

      await expect(page.locator('text=整形が完了しました')).toBeVisible({ timeout: 10000 });

      const outputField = page.locator('text=出力').locator('..').locator('textarea').first();
      const outputValue = await outputField.inputValue();

      // 配列要素が含まれることを確認
      expect(outputValue).toContain('1');
      expect(outputValue).toContain('2');
      expect(outputValue).toContain('3');
      // 改行が含まれていることを確認
      expect(outputValue).toContain('\n');
    });

    test('should format nested JSON structure', async ({ page }) => {
      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await inputField.fill(VALID_JSON_NESTED);

      const formatButton = page.getByRole('button', { name: 'JSON を整形する' });
      await formatButton.click();

      await expect(page.locator('text=整形が完了しました')).toBeVisible({ timeout: 10000 });

      const outputField = page.locator('text=出力').locator('..').locator('textarea').first();
      const outputValue = await outputField.inputValue();

      // ネストされた構造が含まれることを確認
      expect(outputValue).toContain('user');
      expect(outputValue).toContain('profile');
      expect(outputValue).toContain('items');
      expect(outputValue).toContain('Alice');
      // 複数行とインデントが含まれていることを確認
      expect(outputValue).toContain('\n');
      expect(outputValue.split('\n').length).toBeGreaterThan(5);
    });
  });

  test.describe('3. 圧縮機能テスト', () => {
    test('should minify valid JSON to single line', async ({ page }) => {
      // 整形された JSON を入力として使用
      const formattedJson = `{
  "name": "John",
  "age": 30,
  "city": "Tokyo"
}`;

      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await inputField.fill(formattedJson);

      const minifyButton = page.getByRole('button', { name: 'JSON を圧縮する' });
      await expect(minifyButton).toBeEnabled();
      await minifyButton.click();

      // 成功メッセージのSnackbarが表示されることを確認
      await expect(page.locator('text=圧縮が完了しました')).toBeVisible({ timeout: 10000 });

      // 出力フィールドに圧縮された結果が表示されることを確認
      const outputField = page.locator('text=出力').locator('..').locator('textarea').first();
      const outputValue = await outputField.inputValue();

      // 1行に圧縮されていることを確認（改行なし）
      expect(outputValue).not.toContain('\n');
      // 不要なスペースが削除されていることを確認
      expect(outputValue).toBe('{"name":"John","age":30,"city":"Tokyo"}');
    });

    test('should minify nested JSON structure', async ({ page }) => {
      const formattedNestedJson = `{
  "user": {
    "name": "Alice",
    "profile": {
      "age": 25,
      "country": "Japan"
    }
  },
  "items": [
    {
      "id": 1,
      "value": "test"
    }
  ]
}`;

      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await inputField.fill(formattedNestedJson);

      const minifyButton = page.getByRole('button', { name: 'JSON を圧縮する' });
      await minifyButton.click();

      await expect(page.locator('text=圧縮が完了しました')).toBeVisible({ timeout: 10000 });

      const outputField = page.locator('text=出力').locator('..').locator('textarea').first();
      const outputValue = await outputField.inputValue();

      // 1行に圧縮されていることを確認
      expect(outputValue).not.toContain('\n');
      // すべてのキーと値が含まれていることを確認
      expect(outputValue).toContain('user');
      expect(outputValue).toContain('Alice');
      expect(outputValue).toContain('profile');
      expect(outputValue).toContain('items');
    });
  });

  test.describe('4. エラーハンドリングテスト', () => {
    test('should show error for invalid JSON (missing quotes)', async ({ page }) => {
      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await inputField.fill(INVALID_JSON_MISSING_QUOTE);

      const formatButton = page.getByRole('button', { name: 'JSON を整形する' });
      await formatButton.click();

      // エラーメッセージが表示されることを確認する。
      // `lib/parsers/jsonParser.ts` の ERROR_MESSAGES.INVALID_JSON は
      // JSON.parse に失敗した場合に一意に返る文言であり、決定的に assert できる
      // （以前は `[role="alert"]` と汎用テキスト正規表現を `.or()` で束ね、
      // 件数が 1 件以上あることしか見ておらず、何が表示されたかを検証していなかった）。
      await expect(page.getByRole('alert').getByText('JSONとして正しくない形式です。')).toBeVisible(
        { timeout: 10000 }
      );
    });

    test('should show error for invalid JSON (trailing comma)', async ({ page }) => {
      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await inputField.fill(INVALID_JSON_TRAILING_COMMA);

      const formatButton = page.getByRole('button', { name: 'JSON を整形する' });
      await formatButton.click();

      await expect(page.getByRole('alert').getByText('JSONとして正しくない形式です。')).toBeVisible(
        { timeout: 10000 }
      );
    });

    test('should show error for invalid JSON (single quotes)', async ({ page }) => {
      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await inputField.fill(INVALID_JSON_SINGLE_QUOTES);

      const minifyButton = page.getByRole('button', { name: 'JSON を圧縮する' });
      await minifyButton.click();

      await expect(page.getByRole('alert').getByText('JSONとして正しくない形式です。')).toBeVisible(
        { timeout: 10000 }
      );
    });

    test('should disable format and minify buttons for empty input', async ({ page }) => {
      const formatButton = page.getByRole('button', { name: 'JSON を整形する' });
      const minifyButton = page.getByRole('button', { name: 'JSON を圧縮する' });

      // 空入力の場合、ボタンが無効になることを確認
      await expect(formatButton).toBeDisabled();
      await expect(minifyButton).toBeDisabled();
    });
  });

  test.describe('5. クリアボタンテスト', () => {
    test('should clear both input and output', async ({ page }) => {
      // まず入力して整形
      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await inputField.fill(VALID_JSON_OBJECT);

      const formatButton = page.getByRole('button', { name: 'JSON を整形する' });
      await formatButton.click();

      await expect(page.locator('text=整形が完了しました')).toBeVisible({ timeout: 10000 });

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

    test('should enable clear button when input exists', async ({ page }) => {
      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await inputField.fill(VALID_JSON_OBJECT);

      const clearButton = page.getByRole('button', { name: '入力と出力をクリアする' });
      await expect(clearButton).toBeEnabled();
    });
  });

  test.describe('6. クリップボードテスト', () => {
    test('should read JSON from clipboard', async ({ page, context, browserName }) => {
      // クリップボード権限の付与（context.grantPermissions(['clipboard-read', 'clipboard-write'])）は
      // Chromium 系ブラウザしかサポートしておらず、Playwright は非対応ブラウザに対してこの呼び出し自体を
      // エラーにする。これはブラウザが機能を持たない静的な制約であり、
      // docs/development/testing.md の「E2Eテストにおけるブラウザ固有の制約」節が許容するパターンに該当する
      // ため、browserName による静的スキップとして残す。
      test.skip(
        browserName !== 'chromium',
        'clipboard-read/write の grantPermissions は Chromium のみ対応'
      );

      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.waitForLoadState('networkidle');

      // クリップボードに JSON を書き込み
      await page.evaluate((json) => {
        return navigator.clipboard.writeText(json);
      }, VALID_JSON_OBJECT);

      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await expect(inputField).toHaveValue('');

      const readButton = page.getByRole('button', { name: /クリップボードから JSON を読み取る/ });
      await readButton.click();

      // 入力フィールドにクリップボードの内容が挿入されることを確認
      await expect(page.locator('text=クリップボードから読み取りました')).toBeVisible({
        timeout: 10000,
      });
      await expect(inputField).toHaveValue(VALID_JSON_OBJECT);
    });

    test('should copy formatted JSON to clipboard', async ({ page, context, browserName }) => {
      // クリップボード権限の付与（context.grantPermissions(['clipboard-read', 'clipboard-write'])）は
      // Chromium 系ブラウザしかサポートしておらず、Playwright は非対応ブラウザに対してこの呼び出し自体を
      // エラーにする。これはブラウザが機能を持たない静的な制約であり、
      // docs/development/testing.md の「E2Eテストにおけるブラウザ固有の制約」節が許容するパターンに該当する
      // ため、browserName による静的スキップとして残す。
      test.skip(
        browserName !== 'chromium',
        'clipboard-read/write の grantPermissions は Chromium のみ対応'
      );

      await context.grantPermissions(['clipboard-read', 'clipboard-write']);

      // JSON を入力して整形
      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await inputField.fill(VALID_JSON_OBJECT);

      const formatButton = page.getByRole('button', { name: 'JSON を整形する' });
      await formatButton.click();

      await expect(page.locator('text=整形が完了しました')).toBeVisible({ timeout: 10000 });

      // コピーボタンをクリック
      const copyButton = page.getByRole('button', { name: '結果をクリップボードにコピーする' });
      await expect(copyButton).toBeEnabled();
      await copyButton.click();

      // コピー成功のSnackbarが表示されることを確認
      await expect(page.locator('text=クリップボードにコピーしました')).toBeVisible({
        timeout: 10000,
      });

      // クリップボードの内容を確認
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipboardText).toContain('name');
      expect(clipboardText).toContain('John');
      // 整形された JSON なので改行が含まれる
      expect(clipboardText).toContain('\n');
    });

    test('should copy minified JSON to clipboard', async ({ page, context, browserName }) => {
      // クリップボード権限の付与（context.grantPermissions(['clipboard-read', 'clipboard-write'])）は
      // Chromium 系ブラウザしかサポートしておらず、Playwright は非対応ブラウザに対してこの呼び出し自体を
      // エラーにする。これはブラウザが機能を持たない静的な制約であり、
      // docs/development/testing.md の「E2Eテストにおけるブラウザ固有の制約」節が許容するパターンに該当する
      // ため、browserName による静的スキップとして残す。
      test.skip(
        browserName !== 'chromium',
        'clipboard-read/write の grantPermissions は Chromium のみ対応'
      );

      await context.grantPermissions(['clipboard-read', 'clipboard-write']);

      // 整形された JSON を入力として使用
      const formattedJson = `{
  "name": "John",
  "age": 30
}`;
      const inputField = page.locator('text=入力').locator('..').locator('textarea').first();
      await inputField.fill(formattedJson);

      const minifyButton = page.getByRole('button', { name: 'JSON を圧縮する' });
      await minifyButton.click();

      await expect(page.locator('text=圧縮が完了しました')).toBeVisible({ timeout: 10000 });

      // コピーボタンをクリック
      const copyButton = page.getByRole('button', { name: '結果をクリップボードにコピーする' });
      await copyButton.click();

      await expect(page.locator('text=クリップボードにコピーしました')).toBeVisible({
        timeout: 10000,
      });

      // クリップボードの内容を確認
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
      // 圧縮された JSON なので改行が含まれない
      expect(clipboardText).not.toContain('\n');
      expect(clipboardText).toBe('{"name":"John","age":30}');
    });
  });

  test.describe('7. アクセシビリティテスト', () => {
    test('should have proper ARIA labels', async ({ page }) => {
      await page.goto('/json-formatter');

      // 重要なボタンにARIAラベルが設定されていることを確認（値も検証）
      await expect(
        page.getByRole('button', { name: 'クリップボードから JSON を読み取る' })
      ).toHaveAttribute('aria-label', 'クリップボードから JSON を読み取る');
      await expect(page.getByRole('button', { name: 'JSON を整形する' })).toHaveAttribute(
        'aria-label',
        'JSON を整形する'
      );
      await expect(page.getByRole('button', { name: 'JSON を圧縮する' })).toHaveAttribute(
        'aria-label',
        'JSON を圧縮する'
      );
      await expect(
        page.getByRole('button', { name: '結果をクリップボードにコピーする' })
      ).toHaveAttribute('aria-label', '結果をクリップボードにコピーする');
      await expect(page.getByRole('button', { name: '入力と出力をクリアする' })).toHaveAttribute(
        'aria-label',
        '入力と出力をクリアする'
      );
    });

    test('should pass basic accessibility checks', async ({ page, makeAxeBuilder }) => {
      await page.goto('/json-formatter');

      // 基本的なアクセシビリティテスト
      // フッター/ヘッダーは共通コンポーネントなので除外
      const accessibilityScanResults = await makeAxeBuilder()
        .exclude('footer')
        .exclude('header')
        .analyze();

      // クリティカル・シリアスな問題がないことを確認
      const seriousViolations = accessibilityScanResults.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious'
      );
      expect(seriousViolations).toEqual([]);
    });
  });
});
