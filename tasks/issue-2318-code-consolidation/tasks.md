# コード共通化 - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-2318-code-consolidation/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/issue-2318-code-consolidation/requirements.md — 受け入れ条件・機能要件
    - tasks/issue-2318-code-consolidation/design.md — 技術設計・コンポーネント構成
-->

## Phase 1: libs/common への Web Push クライアント追加

<!-- Web Push 送信ロジックを libs/common に集約する -->

- [x] T001: `libs/common/src/push/types.ts` に `NotificationPayload` 型を追加する（依存: なし）
- [x] T002: `libs/common/src/push/client.ts` を新規作成する（依存: T001）
    - `sendWebPushNotification(subscription, payload, vapidConfig): Promise<boolean>` を実装
    - 410/404 の場合は `warn` ログ + `false` を返す
    - その他失敗は `error` ログ + `false` を返す
    - VAPID 未設定時は例外をスロー
- [x] T003: `libs/common/src/push/index.ts` に `NotificationPayload` と `sendWebPushNotification` をエクスポート追加する（依存: T001, T002）
- [x] T004: `libs/common` の `package.json` に `web-push` 依存を追加する（依存: なし）
- [x] T005: `libs/common` のビルド・テストが通過することを確認する（依存: T001〜T004）

## Phase 2: バッチサービスの Web Push クライアント差し替え

<!-- 各 batch サービスが libs/common の sendWebPushNotification を利用するよう修正する -->

- [ ] T010: `services/stock-tracker/batch/src/lib/web-push-client.ts` を修正する（依存: Phase 1）
    - `sendNotification()` 内部で `sendWebPushNotification()` を呼び出す
    - 環境変数から `VapidConfig` を組み立てて引数で渡す
    - `createAlertNotificationPayload()` はそのまま保持
    - `NotificationPayload` 型は `@nagiyu/common` からインポートに変更
- [ ] T011: `services/niconico-mylist-assistant/batch/src/lib/web-push-client.ts` を修正する（依存: Phase 1）
    - `sendNotification()` 内部で `sendWebPushNotification()` を呼び出す
    - `vapidConfigured` フラグを削除し、VAPID 設定は `libs/common` 側に委譲
    - 環境変数から `VapidConfig` を組み立てて引数で渡す
    - ペイロード生成関数群はそのまま保持
    - `NotificationPayload` 型は `@nagiyu/common` からインポートに変更
- [ ] T012: stock-tracker/batch のビルド・テストが通過することを確認する（依存: T010）
- [ ] T013: niconico-mylist-assistant/batch のビルド・テストが通過することを確認する（依存: T011）

## Phase 3: 汎用 UI コンポーネントの libs/ui 移行

<!-- stock-tracker/web のコンポーネントを libs/ui に移動する -->

- [ ] T020: `libs/ui/src/components/error/` ディレクトリを作成する（依存: なし）
- [ ] T021: `libs/ui/src/components/loading/` ディレクトリを作成する（依存: なし）
- [ ] T022: `libs/ui/src/components/error/ErrorBoundary.tsx` を作成する（依存: T020）
    - `services/stock-tracker/web/components/ErrorBoundary.tsx` の内容をコピー
    - ファイル先頭の `'use client'` ディレクティブを維持
    - `@/` パスエイリアスは使用しない（ライブラリ規約）
- [ ] T023: `libs/ui/src/components/error/ErrorAlert.tsx` を作成する（依存: T020）
    - `services/stock-tracker/web/components/ErrorAlert.tsx` の内容をコピー
    - `'use client'` ディレクティブを維持
- [ ] T024: `libs/ui/src/components/loading/LoadingState.tsx` を作成する（依存: T021）
    - `services/stock-tracker/web/components/LoadingState.tsx` の内容をコピー
    - `'use client'` ディレクティブを維持
- [ ] T025: `libs/ui/src/index.ts` に `ErrorBoundary`, `ErrorAlert`, `LoadingState` のエクスポートを追加する（依存: T022〜T024）
- [ ] T026: `libs/ui` のビルドが通過することを確認する（依存: T025）

## Phase 4: stock-tracker/web のインポート差し替え

<!-- stock-tracker/web のローカルコンポーネントを libs/ui からのインポートに置き換える -->

- [ ] T030: `stock-tracker/web` 内で `ErrorBoundary`, `ErrorAlert`, `LoadingState` を使用しているファイルを確認する（依存: Phase 3）
- [ ] T031: 各ファイルのインポートを `@nagiyu/ui` 経由に変更する（依存: T030）
- [ ] T032: `services/stock-tracker/web/components/ErrorBoundary.tsx` を削除する（依存: T031）
- [ ] T033: `services/stock-tracker/web/components/ErrorAlert.tsx` を削除する（依存: T031）
- [ ] T034: `services/stock-tracker/web/components/LoadingState.tsx` を削除する（依存: T031）
- [ ] T035: stock-tracker/web のビルド・テスト・lint が通過することを確認する（依存: T032〜T034）

---

## 完了チェック

- [ ] `requirements.md` の全機能要件（F-001〜F-004）を満たしている
- [ ] テストカバレッジ 80% 以上（`libs/common` push モジュール）
- [ ] Lint・型チェックがすべて通過している（全 workspace）
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `tasks/issue-2318-code-consolidation/` ディレクトリを削除した
