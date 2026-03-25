<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に docs/services/{service}/requirements.md に統合して削除します。
-->

# コード共通化 - 要件定義書

## 1. ビジネス要件

### 1.1 背景・目的

Issue #2318「[Refactoring] コード共通化調査 (2026-03-18)」の調査結果に基づく。

複数のサービス間で同一・類似ロジックの重複実装が確認された。特に以下の領域で重複が顕著であり、保守コスト増大とバグの温床になりうる。

- **Web Push 送信クライアント**: `stock-tracker/batch` と `niconico-mylist-assistant/batch` がほぼ同一の実装を持つ
- **汎用 UI コンポーネント**: `stock-tracker/web` に存在する `ErrorBoundary`, `ErrorAlert`, `LoadingState` が他サービスでも再利用可能

これらを `libs/` 配下に切り出すことで、コードの一貫性を高め、修正を一箇所に集約する。

### 1.2 対象ユーザー

- 開発者（本プラットフォームを開発・保守する）

### 1.3 ビジネスゴール

- 重複実装を削減し、保守コストを下げる
- ライブラリ依存の一方向性（`ui → browser → common`）を守りながら共通化する
- 既存サービスの動作を変えずにリファクタリングを完了する

---

## 2. 機能要件

### 2.1 機能一覧

| 機能ID | 機能名 | 説明 | 優先度 |
| ------ | ------ | ---- | ------ |
| F-001 | Web Push クライアント共通化 | `sendNotification()` / `configureVapidKeys()` を `libs/common/src/push/` に切り出す | 高 |
| F-002 | ErrorBoundary の libs/ui 移行 | stock-tracker/web の ErrorBoundary を `libs/ui/src/components/error/` に移動する | 中 |
| F-003 | ErrorAlert の libs/ui 移行 | stock-tracker/web の ErrorAlert を `libs/ui/src/components/error/` に移動する | 中 |
| F-004 | LoadingState の libs/ui 移行 | stock-tracker/web の LoadingState を `libs/ui/src/components/loading/` に移動する | 中 |

### 2.2 スコープ外の変更

以下は今回対象外とする（適切に整備済み、または別タスクで対応）：

- セッション管理（各サービスが `createSessionGetter` を正しく利用しており共通化済み）
- エラーメッセージ定義（各サービスが `COMMON_ERROR_MESSAGES` を正しく拡張しており共通化済み）
- ドメイン固有のバリデーション（サービス固有のビジネスロジックを含むため分離が適切）
- `NotificationPermissionButton`（各サービスで要件が異なるため、今回は対象外）

---

## 3. 非機能要件

### 3.1 保守性・拡張性要件

- 既存サービスの動作（振る舞い）を変えてはならない（NFR-001）
- `libs/common` は外部依存を最小化し、フレームワーク非依存を維持すること（NFR-002）
- `libs/ui` は Next.js + Material-UI 依存であり、`libs/common` に依存してよい（NFR-003）
- ライブラリ依存の一方向性（`ui → browser → common`）を遵守すること（NFR-004）
- 移行後の全サービスでビルド・テストが通過すること（NFR-005）
- テストカバレッジ 80% 以上を維持すること（NFR-006）

---

## 4. ドメインオブジェクト

| エンティティ | 説明 |
| ----------- | ---- |
| `PushSubscription` | Web Push サブスクリプション情報（endpoint, keys）。`libs/common` 定義済み |
| `NotificationPayload` | Web Push 通知のペイロード（title, body, icon, data）|
| `ErrorBoundary` | React エラーキャッチ用クラスコンポーネント |
| `ErrorAlert` | MUI Alert ラッパー。アクセシビリティ対応済みのエラー表示 |
| `LoadingState` | MUI CircularProgress ラッパー。ローディング表示 |

---

## 5. スコープ外

- ❌ 新機能の追加・動作変更
- ❌ テストコードの実装方針変更
- ❌ セッション管理の共通化（既に `libs/nextjs` に整備済み）
- ❌ エラーメッセージ定義の変更（`COMMON_ERROR_MESSAGES` 拡張パターンは適切）
- ❌ admin/core の `WebPushSender` クラスの変更（クラスベース実装で独立性が高い）
