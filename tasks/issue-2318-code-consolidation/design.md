# コード共通化 - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/development/shared-libraries.md に ADR として抽出し、
    tasks/issue-2318-code-consolidation/ ディレクトリごと削除します。

    入力: tasks/issue-2318-code-consolidation/requirements.md
    次に作成するドキュメント: tasks/issue-2318-code-consolidation/tasks.md
-->

## コンポーネント設計

### パッケージ責務分担

| パッケージ | 追加する責務 |
| --------- | ----------- |
| `libs/common` | Web Push 送信ロジック（`sendWebPushNotification`） |
| `libs/ui` | 汎用 UI コンポーネント（`ErrorBoundary`, `ErrorAlert`, `LoadingState`） |
| `services/stock-tracker/batch` | 既存の `sendNotification` を `libs/common` の関数に差し替え |
| `services/niconico-mylist-assistant/batch` | 既存の `sendNotification` を `libs/common` の関数に差し替え |
| `services/stock-tracker/web` | `ErrorBoundary`, `ErrorAlert`, `LoadingState` を `libs/ui` からインポートに変更 |

---

## F-001: Web Push クライアント共通化

### 現状の重複

| ファイル | 重複内容 |
| -------- | -------- |
| `services/stock-tracker/batch/src/lib/web-push-client.ts` | `configureVapidKeys()`, `sendNotification(Alert, payload)` |
| `services/niconico-mylist-assistant/batch/src/lib/web-push-client.ts` | `configureVapidKeys()`, `sendNotification(PushSubscription, payload)` |

### 設計方針

`libs/common/src/push/` に以下の関数・型を追加する。

既存の `admin/core/WebPushSender`（クラスベース）はコンテキストが異なる（リポジトリ参照・全件送信）ため、今回は変更対象外とする。バッチサービス向けに関数ベースのシンプルなインターフェースを提供する。

#### 追加する型・関数

**型定義**

```
NotificationPayload:
  title: string
  body: string
  icon?: string
  data?: Record<string, unknown>
```

（`sendNotification()` の引数として利用。各サービスはペイロード生成関数で
 `NotificationPayload` を組み立てて渡す）

**関数シグネチャ（概念）**

```
sendWebPushNotification(
  subscription: PushSubscription,
  payload: NotificationPayload,
  vapidConfig: VapidConfig
): Promise<boolean>
```

```
VapidConfig:
  publicKey: string   (生キー or base64url)
  privateKey: string
  subject: string     (mailto: URI)
```

- VAPID キーの正規化は `normalizeVapidKey()` を内部利用
- 送信失敗時（410/404）は `false` を返し、ログに記録
- その他の失敗は `false` を返し、エラーログを記録
- VAPID 未設定（空文字・undefined）は例外をスロー

#### 既存のサービス側の変更

- `stock-tracker/batch`: `sendNotification(alert, payload)` を内部で `libs/common` の関数に委譲
    - `alert.subscription` を `PushSubscription` として渡す
    - 環境変数から `VapidConfig` を組み立てて渡す
    - `createAlertNotificationPayload()` はサービス固有のため保持
- `niconico-mylist-assistant/batch`: 同様に `libs/common` の関数に委譲
    - `vapidConfigured` フラグを削除し、VAPID 設定の検証は `libs/common` の `sendWebPushNotification` 関数に委譲
    - `createBatchCompletionPayload()` / `createTwoFactorAuthRequiredPayload()` はサービス固有のため保持

#### ファイル構成

```
libs/common/src/push/
├── index.ts      (既存 - 追記)
├── types.ts      (既存 - NotificationPayload 型を追加)
├── vapid.ts      (既存 - 変更なし)
└── client.ts     (新規 - sendWebPushNotification 関数)
```

---

## F-002/F-003/F-004: 汎用 UI コンポーネントの libs/ui 移行

### 現状

以下のコンポーネントが `services/stock-tracker/web/components/` にのみ存在し、再利用できない状態。

| コンポーネント | 現在のパス | 移動先 |
| ------------- | --------- | ------ |
| `ErrorBoundary` | `services/stock-tracker/web/components/ErrorBoundary.tsx` | `libs/ui/src/components/error/ErrorBoundary.tsx` |
| `ErrorAlert` | `services/stock-tracker/web/components/ErrorAlert.tsx` | `libs/ui/src/components/error/ErrorAlert.tsx` |
| `LoadingState` | `services/stock-tracker/web/components/LoadingState.tsx` | `libs/ui/src/components/loading/LoadingState.tsx` |

### 設計方針

- コンポーネントのインターフェース（props）・動作は変更しない
- `libs/ui/src/index.ts` にエクスポートを追加する
- `stock-tracker/web` はローカルファイルの代わりに `@nagiyu/ui` からインポートする
- `'use client'` ディレクティブは移行先でも維持する

#### 追加する export（概念）

```
// libs/ui/src/index.ts に追加
export { ErrorBoundary } from './components/error/ErrorBoundary'
export type { ErrorBoundaryProps } from './components/error/ErrorBoundary'
export { default as ErrorAlert } from './components/error/ErrorAlert'
export type { ErrorAlertProps } from './components/error/ErrorAlert'
export { default as LoadingState } from './components/loading/LoadingState'
export type { LoadingStateProps } from './components/loading/LoadingState'
```

---

## 実装上の注意点

### 依存関係・前提条件

- `libs/common` には `web-push` パッケージを追加する（既に batch services が利用しているため問題なし）
- `libs/ui` は MUI（`@mui/material`, `@mui/icons-material`）に依存しており、移行先でも問題なし
- 各 batch サービスは `libs/common` に既に依存しているため、新規依存関係の追加はない
- パスエイリアス（`@/`）はライブラリ内で使用禁止（`docs/development/rules.md` 準拠）

### セキュリティ考慮事項

- VAPID キーは `VapidConfig` として関数引数で受け取り、環境変数の直接参照はサービス側に留める
- `libs/common` は環境変数に直接依存しない設計とする

---

## docs/ への移行メモ

<!-- 開発完了後にここを確認し、docs/ を更新してからこのディレクトリを削除する -->

- [ ] `docs/development/shared-libraries.md` に以下を追記すること：
      - `libs/common/src/push/client.ts` の `sendWebPushNotification` 関数の利用方針
      - `libs/ui` の `ErrorBoundary`, `ErrorAlert`, `LoadingState` 利用ガイド
- [ ] `docs/services/stock-tracker/` の該当記述（エラー表示・ローディング）を更新すること（UI変更があれば）
