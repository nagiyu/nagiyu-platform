# E2Eテスト失敗修正: WebKit デバウンス競合状態

## 概要

Niconico Mylist Assistant の Full Verification CI において、E2E Tests (All Devices) が
webkit-mobile で失敗している。原因は `VideoList` コンポーネントのデバウンス処理と
ページナビゲーションの競合状態（Race Condition）。

## 関連情報

-   Issue: #1365
-   タスクタイプ: サービスタスク（niconico-mylist-assistant-web）
-   失敗CI: [Run #22307553334](https://github.com/nagiyu/nagiyu-platform/actions/runs/22307553334)
-   失敗テスト: `e2e/video-list.spec.ts` - `should apply search and favorite filters as AND condition`

## 根本原因の分析

### 競合状態の発生シナリオ

1. `page.goto('/mylist?search=63070988')` で1回目のナビゲーション
2. コンポーネントマウント時に URL sync effect が実行:
    - `searchKeyword = "63070988"`, `debouncedSearchKeyword = "63070988"` をセット
3. `searchKeyword` が変わったため、デバウンス effect が **500ms タイムアウト** をセット
4. `fetchVideos` が実行され、「動画が見つかりませんでした」が表示される
5. テストが "動画が見つかりませんでした" を確認後、即座に `page.goto('/mylist?search=63070987')` を呼ぶ
6. 2回目のナビゲーション開始（Next.js App Router はソフトナビゲーション）
7. URL sync が `searchKeyword = "63070987"`, `debouncedSearchKeyword = "63070987"` をセット
8. **ここで、step 3 の 500ms タイムアウトが発火** → `setDebouncedSearchKeyword("63070988")` が呼ばれる
9. `debouncedSearchKeyword` effect:
    - `debouncedSearchKeyword = "63070988"` ≠ `currentSearchKeyword = "63070987"` → 条件不一致
    - `updateURL(...)` → `router.push('/mylist?search=63070988')` が呼ばれる
10. これが「別のナビゲーション」として2回目のナビゲーションを中断する

### なぜ webkit-mobile のみで発生するか

webkit は Chromium と比べてタイムアウトや effect のタイミングが異なり、
ナビゲーション中に旧コンポーネントの cleanup が実行される前にタイムアウトが発火しやすい。

## 要件

### 機能要件

-   FR1: `VideoList` コンポーネントのデバウンス処理において、
    URL同期後に古いデバウンス値による `router.push` が発生しないこと
-   FR2: ユーザーが検索フィールドに入力する通常のデバウンス動作は維持されること
-   FR3: ブラウザの前後ナビゲーションは引き続き正常に動作すること

### 非機能要件

-   NFR1: webkit-mobile を含む全デバイスで E2E テストが通過すること
-   NFR2: 既存のユニットテストやカバレッジが維持されること（変更なし）

## 実装方針

### 修正対象ファイル

`services/niconico-mylist-assistant/web/src/components/VideoList.tsx`

### 修正内容

`debouncedSearchKeyword` effect（現在 lines 160-169）に guard 条件を追加する。

**変更前の問題**:
`debouncedSearchKeyword` の値がURLの `currentSearchKeyword` と異なれば無条件に `updateURL` を呼ぶ設計のため、
古いデバウンスタイムアウトからの stale な値でも `router.push` が発火してしまう。

**変更後の設計**:
`debouncedSearchKeyword !== searchKeyword` の場合（デバウンス値が現在の `searchKeyword` と不一致）
は処理をスキップする。

根拠:
-   正常なデバウンス動作: タイムアウト発火時は `debouncedSearchKeyword === searchKeyword` になる（最新値）
-   競合状態の stale timeout: 古いURLの値で `debouncedSearchKeyword` がセットされるため
    `debouncedSearchKeyword !== searchKeyword` が true になり、URL更新をスキップできる

`searchKeyword` を effect の依存配列に追加する必要がある。

## タスク

-   [ ] T001: `VideoList.tsx` の `debouncedSearchKeyword` effect に stale guard 条件を追加
-   [ ] T002: 依存配列に `searchKeyword` を追加
-   [ ] T003: ローカルで E2E テストを実行して確認（または CI で確認）

## 参考ドキュメント

-   `services/niconico-mylist-assistant/web/src/components/VideoList.tsx`
-   `services/niconico-mylist-assistant/web/e2e/video-list.spec.ts`
-   `docs/development/rules.md`

## 備考・未決定事項

-   E2E テストのローカル実行が難しい場合、CI で確認すること
-   webkit-mobile 特有のタイミング問題のため、修正後も念のため複数回 CI を実行することを推奨
