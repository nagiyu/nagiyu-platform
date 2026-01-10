# E2Eテスト更新ガイドライン

## 目的

Material-UI導入に伴うE2Eテストの更新方針を定義します。

## 影響を受けるテストファイル

- `services/codec-converter/web/tests/integration/scenario-1-happy-path.spec.ts`
- `services/codec-converter/web/tests/integration/scenario-2-file-size-validation.spec.ts`
- `services/codec-converter/web/tests/integration/scenario-3-error-handling.spec.ts`

## セレクタ更新戦略

### 優先順位

1. **Role-based queries** (最優先)
2. **data-testid 属性**
3. **Text content**

### 避けるべきアプローチ

- CSSクラス名 (`.MuiButton-root` など)
- 構造依存セレクタ

### 実装例

```typescript
// ✅ 推奨
page.getByRole('button', { name: '変換開始' })
page.getByTestId('submit-button')
page.getByText('選択されたファイル')

// ❌ 避ける
page.locator('.MuiButton-root')
page.locator('div > div > button')
```

## 新規テストの追加

### common-components.spec.ts (新規作成)

**ファイル**: `services/codec-converter/web/tests/integration/common-components.spec.ts`

**テスト内容**:
- Header が全ページで表示されること
- Footer が全ページで表示されること
- Header のタイトルクリックでトップページに戻ること
- Footer のバージョン情報が表示されること

**参考**: `services/tools/e2e/homepage.spec.ts` (L132-L193)

## 既存テストの更新ポイント

### ボタンセレクタ

Material-UI の Button コンポーネントも `role="button"` を持つため、既存のセレクタは多くの場合そのまま動作します。

```typescript
// 既存コード（変更不要の場合が多い）
page.getByRole('button', { name: '変換開始' })
```

### エラーメッセージ

Material-UI の Alert コンポーネントは `role="alert"` を持ちます。

```typescript
// 既存コード
page.getByRole('alert')

// Material-UI対応後も動作する可能性が高い
```

### data-testid の追加（必要に応じて）

セレクタが不安定な場合、コンポーネントに `data-testid` を追加:

```typescript
// コンポーネント
<Button data-testid="submit-button">変換開始</Button>

// テスト
page.getByTestId('submit-button')
```

## テスト実行

### ローカル環境

```bash
npm run test:e2e --workspace=codec-converter-web
```

### CI環境

- Fast verification: chromium-mobile のみ
- Full verification: chromium-desktop, chromium-mobile, webkit-mobile

## 参考リソース

- Playwright ドキュメント: https://playwright.dev/
- Testing Library queries: https://testing-library.com/docs/queries/about/
- 他サービスのE2Eテスト:
    - `services/tools/e2e/homepage.spec.ts`
    - `services/auth/web/e2e/auth.spec.ts`

## 更新チェックリスト

- [ ] 全ての既存テストが動作することを確認
- [ ] Material-UI固有のセレクタ問題を修正
- [ ] common-components.spec.ts を作成
- [ ] ローカルで全テストが通ることを確認
- [ ] CI で全テストが通ることを確認