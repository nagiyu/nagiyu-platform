# E2E Tests for Tools App

このディレクトリには、Toolsアプリケーションのエンドツーエンド（E2E）テストが含まれています。

## テストフレームワーク

- **Playwright**: モダンなブラウザ自動化フレームワーク
- **@axe-core/playwright**: アクセシビリティテスト用ライブラリ（WCAG 2.1 Level AA準拠）

## テスト対象ブラウザ

以下の3つのプロジェクトでテストが実行されます：

1. **chromium-desktop**: Chromiumデスクトップブラウザ
2. **chromium-mobile**: Chromiumモバイルブラウザ（Pixel 5エミュレーション）
3. **safari-mobile**: Safariモバイルブラウザ（iPhone 12エミュレーション）

## テストの実行方法

### 全テストを実行

```bash
npm run test:e2e
```

### UIモードで実行（デバッグに便利）

```bash
npm run test:e2e:ui
```

### ブラウザを表示して実行（headed mode）

```bash
npm run test:e2e:headed
```

### テストレポートを表示

```bash
npm run test:e2e:report
```

### 特定のテストファイルを実行

```bash
npx playwright test e2e/basic.spec.ts
```

### 特定のプロジェクトでテストを実行

```bash
npx playwright test --project=chromium-desktop
```

## ディレクトリ構造

```
e2e/
├── README.md              # このファイル
├── basic.spec.ts          # 基本機能のテスト
└── helpers.ts             # テストヘルパー関数とフィクスチャ
```

## テストの書き方

### 基本的なテスト

```typescript
import { test, expect } from '@playwright/test';

test('should load the page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Tools/);
});
```

### アクセシビリティテスト

```typescript
import { test, expect } from './helpers';

test('should have no accessibility violations', async ({ page, makeAxeBuilder }) => {
  await page.goto('/');
  
  const accessibilityScanResults = await makeAxeBuilder().analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});
```

## CI/CD統合

GitHub Actions PRワークフローで、以下のタイミングで自動実行されます：

- `develop` または `integration/**` ブランチへのPR作成時
- `services/tools/**`, `infra/tools/**`, `.github/workflows/tools-pr.yml` への変更時

テスト結果はGitHub ActionsのArtifactとして保存されます：
- `playwright-report`: HTMLレポート
- `test-results`: JSON形式のテスト結果

## テスト作成のガイドライン

1. **テストの独立性**: 各テストは独立して実行できるようにする
2. **明確なテスト名**: テストの目的が明確にわかる名前をつける
3. **適切なセレクタ**: ロールベースのセレクタを優先（`getByRole`, `getByLabel`など）
4. **待機の適切な使用**: `waitForLoadState`, `waitForSelector`を使用
5. **アクセシビリティ**: 主要なページではアクセシビリティテストを実施

## トラブルシューティング

### テストが失敗する場合

1. **スクリーンショットを確認**: `test-results/` ディレクトリに保存されています
2. **HTMLレポートを確認**: `npx playwright show-report` で詳細を確認
3. **UIモードでデバッグ**: `npm run test:e2e:ui` でステップバイステップ実行

### ブラウザがインストールされていない場合

```bash
npx playwright install --with-deps
```

## 参考リンク

- [Playwright公式ドキュメント](https://playwright.dev/)
- [Playwrightベストプラクティス](https://playwright.dev/docs/best-practices)
- [axe-core/playwrightドキュメント](https://github.com/dequelabs/axe-core-npm/tree/develop/packages/playwright)
