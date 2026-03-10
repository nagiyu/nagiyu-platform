# E2E テスト失敗の解消

## 概要

複数サービスで E2E テストが一部のブラウザ・環境で失敗している。
コードおよび CI ログの調査を行い、各失敗の根本原因と具体的な修正方針を特定した。

## 関連情報

- Issue: #（E2E の失敗解消）
- タスクタイプ: サービスタスク（複数サービス横断）
- 対象サービス:
    - `services/niconico-mylist-assistant/web`
    - `services/stock-tracker/web`
    - `services/tools`

## 失敗テスト一覧と調査結果

### 1. Stock Tracker（全ブラウザ失敗・根本原因確定）

- **テスト:** `[chromium-mobile/chromium-desktop/webkit-mobile] › tests/e2e/summary-display.spec.ts:248:7 › サマリー画面スモークテスト › 詳細ダイアログとアラート設定ダイアログでチャートを表示できる`
- **失敗ブラウザ:** 全ブラウザ（chromium-mobile, chromium-desktop, webkit-mobile）
- **失敗頻度:** 毎回（安定した失敗・2 回リトライしても全回同じ箇所で失敗）

#### CI ログ（実際のエラー）

```
Error: expect(locator).toBeVisible() failed
Locator: getByRole('dialog', { name: 'アラート設定 (買いアラート)' }).getByLabel('表示本数')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

  323 |     await expect(alertDialog.getByText('株価チャート')).toBeVisible();
  324 |     await expect(alertDialog.getByLabel('時間枠')).toBeVisible();
> 325 |     await expect(alertDialog.getByLabel('表示本数')).toBeVisible();
```

#### 根本原因（確定）

テストコードの誤りによる。具体的には以下の通り。

- テスト（`summary-display.spec.ts:325`）は `alertDialog.getByLabel('表示本数')` をチェックしているが、`AlertSettingsModal.tsx` コンポーネントに `表示本数` の UI コントロールは**存在しない**
- `AlertSettingsModal` 内の `StockChart` は `count={50}` の固定値で呼ばれており、ユーザーが本数を変更できる UI は用意されていない
- ユニットテスト（`tests/unit/components/alert-settings-modal-mode.test.ts:133`）にも `expect(html).not.toContain('表示本数')` と明示的に「表示本数は存在しない」という確認が入っており、設計上意図的に省かれている
- `表示本数` コントロールはトップページの `HomePageClient.tsx` にのみ存在する

#### 調査済みファイル

- `components/AlertSettingsModal.tsx` → `count={50}` でハードコード、`表示本数` UI なし
- `tests/unit/components/alert-settings-modal-mode.test.ts:133` → `not.toContain('表示本数')` を確認
- `components/HomePageClient.tsx:243` → `<InputLabel id="barcount-select-label">表示本数</InputLabel>` がトップページに存在

#### 対応方針

テストの `await expect(alertDialog.getByLabel('表示本数')).toBeVisible()` を削除する。  
（アラート設定ダイアログに `表示本数` コントロールを追加する設計変更は、別途要件定義が必要なため本タスクのスコープ外とする）

---

### 2. Niconico Mylist Assistant（webkit-mobile のみ失敗・根本原因推定）

- **テスト:** `[webkit-mobile] › e2e/bulk-import.spec.ts:250:7 › Bulk Import UI › should search videos and add selected video`
- **失敗ブラウザ:** webkit-mobile のみ
- **失敗頻度:** 毎回（安定した失敗）

#### テストフロー

```typescript
await page.goto('/import');
await page.getByRole('button', { name: '動画を検索して追加' }).click();
await page.getByLabel('検索キーワード').fill('陰陽師');       // ← ここが問題の可能性
await page.getByRole('button', { name: '検索' }).click();
await expect(page.getByText('レッツゴー!陰陽師')).toBeVisible();
await page.getByRole('button', { name: '追加' }).click();
await expect(page.getByRole('button', { name: '追加済み' })).toBeVisible();
```

#### 根本原因（推定）

Material-UI `Dialog` コンポーネントのデフォルト Fade アニメーション（`TransitionProps` 未設定）が webkit-mobile で問題を引き起こしている。

- `VideoSearchModal.tsx` の `<Dialog open={open}>` は `TransitionProps` や `disablePortal` の設定がなく、デフォルト Fade アニメーションが適用される
- webkit（Safari エンジン）は Chromium に比べて JavaScript アニメーション処理が遅く、Dialog の Fade-In アニメーション完了前に `page.getByLabel('検索キーワード').fill()` が実行される
- `fill()` は要素が DOM に存在すれば実行できてしまうため、アニメーション中の半透明状態でも処理が進み、実際の操作が反映されない可能性がある

#### 調査済みファイル

- `src/components/VideoSearchModal.tsx:81` → `<Dialog open={open} onClose={onClose} fullWidth maxWidth="md">` - TransitionProps 未設定
- `src/components/VideoSearchModal.tsx:85-93` → `<TextField label="検索キーワード">` - 通常の TextField

#### 対応方針

テスト側で `page.getByLabel('検索キーワード')` が visible かつ操作可能になるまで明示的に待機する。

```
// ボタンクリック後、Dialog 内の入力欄が操作可能になるまで待機
await page.getByLabel('検索キーワード').waitFor({ state: 'visible' });
await page.getByLabel('検索キーワード').fill('陰陽師');
```

---

### 3. Tools アクセシビリティテスト（webkit-mobile, 断続的失敗・根本原因推定）

- **テスト:** `[webkit-mobile] › e2e/accessibility.spec.ts:73:7 › Accessibility Tests - Transit Converter @a11y › should not have accessibility violations after conversion`
- **失敗ブラウザ:** webkit-mobile のみ
- **失敗頻度:** 断続的（毎回ではない）

#### テストフロー

```typescript
await inputField.fill(validInput);
await convertButton.click();
await expect(page.locator('text=変換が完了しました')).toBeVisible({ timeout: 10000 });
// ↑ Snackbar の表示を待機
const accessibilityScanResults = await makeAxeBuilder().analyze();
expect(accessibilityScanResults.violations).toEqual([]);
```

#### 根本原因（推定）

`handleConvert()` 処理中の一時的な DOM 状態が axe-core スキャンで検出される可能性がある。

- `handleConvert()` は同期処理だが、`setIsProcessing(true)` 直後に React が再レンダリングすると変換ボタン内に `<CircularProgress aria-label="変換処理中" />` が表示される
- `finally` ブロックで `setIsProcessing(false)` が呼ばれるまでの間、このインジケータが DOM に残る
- `page.locator('text=変換が完了しました').toBeVisible()` で Snackbar 表示を確認した後に axe-core スキャンが実行されるが、React の state バッチ処理タイミングによっては `isProcessing=true` のレンダリング状態が残っている場合がある
- また、`Snackbar` の `autoHideDuration={4000}` により 4 秒後に消えるため、axe-core スキャン中に DOM が変化し、特定の ARIA 属性が変わる可能性もある
- webkit-mobile は JavaScript エンジンの処理速度が遅く、こうした競合状態が発生しやすい

#### 調査済みファイル

- `src/app/transit-converter/page.tsx:108,121,136,161` → `setIsProcessing(true/false)` の各呼び出し箇所
- `src/app/transit-converter/page.tsx:368` → `isProcessing ? <CircularProgress aria-label="変換処理中" /> : <SyncIcon />`
- `src/app/transit-converter/page.tsx:427` → `autoHideDuration={4000}` で 4 秒後に Snackbar が自動消去
- `e2e/accessibility.spec.ts:106` → `toBeVisible({ timeout: 10000 })` で変換完了待機

#### 対応方針

`変換が完了しました` の表示確認後、DOM が安定するまで追加待機を挟む。または `isProcessing` が `false` の状態を明示的に待機する（変換ボタンが再び `enabled` になることを確認）。

```
await convertButton.click();
await expect(page.locator('text=変換が完了しました')).toBeVisible({ timeout: 10000 });
// 変換ボタンが再び有効になる（isProcessing=false）まで待機して DOM を安定させる
await expect(convertButton).toBeEnabled();
const accessibilityScanResults = await makeAxeBuilder().analyze();
```

---

## 要件

### 機能要件

- FR1: 各失敗テストが全対象ブラウザで安定して通過すること
- FR2: テストの修正内容は既存の機能を変更しないこと（テスト側の修正が原則）
- FR3: アプリケーション側の実装変更が必要な場合は最小限に留めること

### 非機能要件

- NFR1: 修正後のテストが CI（Full CI: 全ブラウザ）で継続的に安定すること
- NFR2: テストカバレッジ 80% 以上を維持すること
- NFR3: Playwright の retries 設定（CI では 2 回）に頼らない根本的な安定化

## タスク

### Phase 1: Stock Tracker - テスト修正（根本原因確定済み）

- [ ] T001: `services/stock-tracker/web/tests/e2e/summary-display.spec.ts:325` の `await expect(alertDialog.getByLabel('表示本数')).toBeVisible()` を削除

### Phase 2: Niconico - webkit-mobile テスト修正

- [ ] T002: `services/niconico-mylist-assistant/web/e2e/bulk-import.spec.ts` で「動画を検索して追加」ボタンクリック後に `getByLabel('検索キーワード').waitFor({ state: 'visible' })` を追加

### Phase 3: Tools - アクセシビリティテスト安定化

- [ ] T003: `services/tools/e2e/accessibility.spec.ts` の変換完了後・axe スキャン前に変換ボタンが再び enabled になることを待機するステップを追加

### Phase 4: 検証

- [ ] T004: Stock Tracker テストを chromium-mobile でローカル実行して通過確認
- [ ] T005: Niconico テストを webkit-mobile でローカル実行して通過確認
- [ ] T006: Tools テストを webkit-mobile でローカル実行して通過確認（複数回実行で安定性確認）
- [ ] T007: CI 実行（Full CI: 全ブラウザ）で全テスト通過を確認

## 参考ドキュメント

- [コーディング規約](../docs/development/rules.md) - E2E テスト要件（4.5 章）
- [テスト戦略](../docs/development/testing.md)
- CI ログ: `GitHub Actions run 22887716694 job 66404584155`（Stock Tracker 失敗ログ確認済み）

## 備考

- Stock Tracker の失敗は 2 回リトライ後も同じ箇所で失敗しており、テストコードの誤りが確定的
- Niconico・Tools の webkit-mobile 問題はコードから推定した仮説であるため、修正後の動作確認（Phase 4）が重要
- もし T002・T003 の修正後も失敗が続く場合は、実際の失敗エラーメッセージを CI で確認して詳細調査を行う
