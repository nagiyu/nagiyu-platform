# E2E テスト失敗の解消

## 概要

複数サービスで E2E テストが一部のブラウザ・環境で失敗している。
webkit-mobile 固有の失敗、全ブラウザ共通の失敗、断続的な失敗が混在しており、
それぞれ原因が異なると考えられる。まず原因を調査し、対応方針を確立する。

## 関連情報

- Issue: #（E2E の失敗解消）
- タスクタイプ: サービスタスク（複数サービス横断）
- 対象サービス:
    - `services/niconico-mylist-assistant/web`
    - `services/stock-tracker/web`
    - `services/tools`

## 失敗テスト一覧

### 1. Niconico Mylist Assistant

- **テスト:** `[webkit-mobile] › e2e/bulk-import.spec.ts:250:7 › Bulk Import UI › should search videos and add selected video`
- **失敗ブラウザ:** webkit-mobile のみ
- **失敗頻度:** 毎回（安定した失敗）
- **テスト内容:**
    - `/import` ページへ遷移
    - 「動画を検索して追加」ボタンをクリック
    - 検索キーワード「陰陽師」を入力して「検索」ボタンをクリック
    - 検索結果「レッツゴー!陰陽師」が表示されることを確認
    - 「追加」ボタンをクリックし「追加済み」状態になることを確認

### 2. Stock Tracker

- **テスト:** `[chromium-mobile/chromium-desktop/webkit-mobile] › tests/e2e/summary-display.spec.ts:248:7 › サマリー画面スモークテスト › 詳細ダイアログとアラート設定ダイアログでチャートを表示できる`
- **失敗ブラウザ:** 全ブラウザ（chromium-mobile, chromium-desktop, webkit-mobile）
- **失敗頻度:** 毎回（安定した失敗）
- **テスト内容:**
    - `/summaries` ページへ遷移し、テーブル最初の行をクリック
    - 詳細ダイアログで「株価チャート」テキストと `aria-label="AAA の株価チャート"` 要素の可視確認
    - 「買いアラート設定」ボタンをクリックしてアラート設定ダイアログを開く
    - アラート設定ダイアログでも同様のチャート要素の可視確認

### 3. Tools

- **テスト:** `[webkit-mobile] › e2e/accessibility.spec.ts:73:7 › Accessibility Tests - Transit Converter @a11y › should not have accessibility violations after conversion`
- **失敗ブラウザ:** webkit-mobile のみ
- **失敗頻度:** 断続的（毎回ではない）
- **テスト内容:**
    - テキストエリアに乗り換え案内テキストを入力
    - 「乗り換え案内テキストを変換する」ボタンをクリック
    - 「変換が完了しました」メッセージの表示を待機（timeout: 10000ms）
    - `@axe-core/playwright` で WCAG 2.1 Level AA のアクセシビリティ違反チェック

## 要件

### 機能要件

- FR1: 各失敗テストが全対象ブラウザで安定して通過すること
- FR2: テストの修正内容は既存の機能を変更しないこと（テスト側の修正が原則）
- FR3: アプリケーション側の実装変更が必要な場合は最小限に留めること

### 非機能要件

- NFR1: 修正後のテストが CI（Full CI: 全ブラウザ）で継続的に安定すること
- NFR2: テストカバレッジ 80% 以上を維持すること
- NFR3: Playwright の retries 設定（CI では 2 回）に頼らない根本的な安定化

## 調査・仮説

### Stock Tracker チャートテスト（全ブラウザ失敗）

**最も可能性の高い原因:**
- ECharts（`echarts-for-react`）を使用したチャートコンポーネントのレンダリングが非同期であり、Canvas 描画の完了前に `toBeVisible()` チェックが実行されている可能性がある
- チャートコンポーネントには `aria-label={`${symbol} の株価チャート`}` が付与されているが、チャートライブラリの初期化タイミングによっては要素が DOM に存在しても視覚的に表示されていない場合がある
- チャートの `useEffect` でデータフェッチを行っており、モック API の応答後にチャートが描画されるまでの遅延が考えられる

**調査ポイント:**
- `StockChart` コンポーネントのローディング状態管理（`loading` フラグの扱い）
- ECharts の Canvas 要素に `aria-label` が正しく設定されているかの確認
- テスト側で チャートデータ取得完了を待機する仕組みが不足していないか確認

### Niconico Mylist Assistant（webkit-mobile のみ失敗）

**最も可能性の高い原因:**
- webkit-mobile は Chromium と異なるイベント処理モデルを持ち、ダイアログ・モーダルの開閉タイミングが異なる場合がある
- `page.getByRole('button', { name: '動画を検索して追加' }).click()` 後、モーダルが完全に表示される前に次のアクションが実行されている可能性がある
- iPhone 12（viewport: 390x844, deviceScaleFactor: 3）の高 DPI 環境でのレンダリング差異

**調査ポイント:**
- 「動画を検索して追加」ボタンクリック後のモーダル表示完了を待機しているか
- webkit-mobile 特有のアニメーション・トランジション処理の影響

### Tools アクセシビリティテスト（webkit-mobile, 断続的）

**最も可能性の高い原因:**
- 断続的な失敗は、テキスト変換処理の完了タイミングが不安定なことを示唆
- `await expect(page.locator('text=変換が完了しました')).toBeVisible({ timeout: 10000 })` の 10 秒タイムアウトが webkit-mobile で不十分な場合がある
- あるいは、変換完了後のトースト/メッセージが短時間で非表示になり、アクセシビリティスキャン実行前に消えてしまう可能性
- webkit が axe-core の実行タイミングで特定の要素に違反を検出しているが、それが変換処理中の一時的な状態に起因する可能性

**調査ポイント:**
- 変換完了メッセージの表示時間（自動的に消えるトーストか）
- アクセシビリティスキャン実行前の状態が安定しているか
- webkit-mobile で実際にどのアクセシビリティ違反が検出されているかの確認

## 実装のヒント

### Stock Tracker チャートテスト対応方針

- ECharts のチャートが描画完了したことを確認するため、ローディングインジケータの消失または特定の DOM 要素の安定を待機する処理をテストに追加
- `aria-label` が Canvas 要素ではなく Div コンテナに付与されているか確認し、必要に応じてコンポーネント修正
- `await expect(summaryDialog.getByLabel('AAA の株価チャート')).toBeVisible()` の前に、ローディング完了を待機するステップを追加

### webkit-mobile テスト安定化

- webkit-mobile 固有の問題はアニメーション・トランジションが完了してからアクションを行う必要がある
- Playwright の `waitForSelector` や特定要素の状態安定を待機するアプローチを検討
- モーダル/ダイアログのオープン完了を確認してから操作する（例: ダイアログ内の要素が `visible` になるまで待機）

### Tools アクセシビリティテスト安定化

- 断続的失敗には `waitFor` を使った状態安定化が有効
- 変換完了後、アクセシビリティスキャン実行前に DOM の安定を確認するステップを追加
- タイムアウト値の見直し（webkit-mobile は他ブラウザより処理が遅い場合がある）

## タスク

### Phase 1: 原因調査

- [ ] T001: Stock Tracker `StockChart` コンポーネントの `aria-label` 付与箇所とローディング状態の確認（`services/stock-tracker/web/src`）
- [ ] T002: 最新 CI ログの確認（失敗時のスクリーンショット・エラーメッセージ取得）
- [ ] T003: Tools のアクセシビリティ違反の具体的な内容を特定（何の違反か確認）
- [ ] T004: Niconico のモーダル表示フローの確認（webkit-mobile での動作差異を特定）

### Phase 2: Stock Tracker チャートテスト修正

- [ ] T005: `StockChart` コンポーネントの DOM 構造確認（aria-label の付与位置）
- [ ] T006: テスト側でチャート描画完了を待機する処理を追加（`services/stock-tracker/web/tests/e2e/summary-display.spec.ts`）
- [ ] T007: 必要に応じてコンポーネント側の `aria-label` 設定を修正

### Phase 3: Niconico webkit-mobile テスト修正

- [ ] T008: モーダル表示完了の待機処理を追加（`services/niconico-mylist-assistant/web/e2e/bulk-import.spec.ts`）
- [ ] T009: webkit-mobile 特有の問題がある場合はブラウザ固有の対応を検討

### Phase 4: Tools アクセシビリティテスト安定化

- [ ] T010: 変換完了後の状態安定を確認する処理追加（`services/tools/e2e/accessibility.spec.ts`）
- [ ] T011: タイムアウト値や待機条件の見直し

### Phase 5: 検証

- [ ] T012: 修正後のテストをローカルで webkit-mobile シミュレートして確認
- [ ] T013: CI 実行により全ブラウザでの通過を確認

## 参考ドキュメント

- [コーディング規約](../docs/development/rules.md) - E2E テスト要件（4.5 章）
- [テスト戦略](../docs/development/testing.md)
- Playwright 公式ドキュメント - [webkit 特有の考慮点](https://playwright.dev/docs/browsers)
- ECharts for React - チャートのライフサイクルイベント

## 備考・未決定事項

- Stock Tracker の全ブラウザ失敗は、テストコードまたはコンポーネント実装のどちらを修正すべきか、CI ログ確認後に判断する
- Tools の断続的失敗は webkit-mobile 環境の速度差に起因する可能性が高く、タイムアウト調整で解決できるかもしれない
- webkit-mobile 固有の失敗（Niconico, Tools）が同じ根本原因（webkit のレンダリング速度）である可能性も検討する
- 調査の結果、アプリケーション側の実装修正が必要と判断した場合は、別タスクとして切り出す
