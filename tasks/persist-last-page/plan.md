# Share Together: 最終訪問ページの復元

## 目的

PWA として起動された Share Together で、前回最後に閲覧していたページから再開できるようにする。

## 採用方式

**LocalStorage 方式**。クライアント側で遷移ごとに最終パスを保存し、ルート (`/`) アクセス時に保存値があればクライアントサイドリダイレクトする。

検討した代替案と却下理由:

- Cookie + Middleware: 毎リクエストに Cookie が乗るオーバーヘッド。SSR 段階で確定する必要がない用途なので過剰。
- サーバー側永続化: 要件はクロスデバイス同期を含まないため過剰。

## 実装方針

### 1. 共通ユーティリティ `src/lib/lastVisitedPath.ts`

- `LAST_VISITED_PATH_STORAGE_KEY`: LocalStorage キー（`share-together:last-visited-path`）
- `isPersistablePath(path)`: 保存対象か判定。`/` は除外（自分自身に戻ると無限ループするため）。
- `saveLastVisitedPath(path)` / `loadLastVisitedPath()` / `clearLastVisitedPath()`: `@nagiyu/browser` の LocalStorage ラッパー経由で操作。

### 2. ナビゲーション監視 `src/components/LastVisitedPathTracker.tsx`

- Client Component。`usePathname()` を `useEffect` で監視し、変化時に保存。
- クエリ文字列は復元対象に含めない（シンプル化のため、初版では pathname のみ）。
- `layout.tsx` の `<body>` 直下に挿入し全ルート共通で動かす。

### 3. ルート `/` での復元 `src/app/page.tsx`

- 既存の Client Component に `useEffect` を追加。
- マウント時に `loadLastVisitedPath()` を読む。
  - 値があり `isPersistablePath` を満たすなら `router.replace(value)` で遷移。
  - 値がなければ通常の UI を描画。
- 復元判定中はチラつき防止のため `null` を返す（最初の 1 フレームのみ）。

### 4. テスト

`services/share-together/web/tests/unit/` 配下に追加:

- `lib/lastVisitedPath.test.ts`: ユーティリティの単体テスト
  - `isPersistablePath`: `/`, `/lists`, `/groups` の判定
  - 保存→読込→クリアのラウンドトリップ
- `LastVisitedPathTracker.test.tsx`:
  - pathname が `/lists` で保存される
  - pathname が `/` では保存されない
- `app/HomePage.test.tsx`（または既存の page テスト）:
  - LocalStorage に保存値があれば `router.replace` が呼ばれる
  - 保存値がなければ通常 UI が表示される

## ファイル一覧（追加・変更）

新規:

- `services/share-together/web/src/lib/lastVisitedPath.ts`
- `services/share-together/web/src/components/LastVisitedPathTracker.tsx`
- `services/share-together/web/tests/unit/lib/lastVisitedPath.test.ts`
- `services/share-together/web/tests/unit/LastVisitedPathTracker.test.tsx`
- `services/share-together/web/tests/unit/app/HomePage.test.tsx`

変更:

- `services/share-together/web/src/app/layout.tsx`（Tracker を挿入）
- `services/share-together/web/src/app/page.tsx`（復元ロジック追加）

## 完了条件

- 単体テストが追加され、すべてパスする
- カバレッジ閾値（80%）を維持する
- lint / format が通る
