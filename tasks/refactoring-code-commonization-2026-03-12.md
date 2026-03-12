# コード共通化調査・実装計画 (2026-03-12)

## 概要

本ドキュメントは、`services/` および `libs/` 配下のコードを横断的に調査し、重複・類似実装を特定した結果と、共通化に向けた実装計画をまとめたものである。

保守性の向上・コード重複削減・依存関係ルール（`ui → browser → common`）の徹底を目的として、複数サービスにわたる実装パターンの一元化方針を策定する。

## 関連情報

- タスクタイプ: プラットフォームタスク（複数サービス横断）
- 参考ドキュメント: `docs/development/rules.md`, `docs/development/architecture.md`
- 依存関係ルール: `ui → browser → common`（循環禁止）

---

## 重複実装の候補

### [DUP-1] Logger の重複実装

**優先度: 高**

`@nagiyu/common` に本格的な Logger 実装が存在するにもかかわらず、`services/stock-tracker/batch` が独自 Logger を持っている。

| ファイル | 実装の特徴 |
|---|---|
| `libs/common/src/logger/logger.ts` | `LOG_LEVEL` 環境変数によるフィルタリング、stderr/stdout の使い分け、ファクトリ関数パターン |
| `services/stock-tracker/batch/src/lib/logger.ts` | クラスベース、レベルフィルタなし、常に stdout |

- **影響範囲**: `services/stock-tracker/batch/src/lib/logger.ts` で定義・使用
- **統合先**: `@nagiyu/common` の `logger` をそのまま利用
- **独自実装の参照箇所**: `services/stock-tracker/batch/src/lib/retry.ts`、`services/stock-tracker/batch/src/lib/web-push-client.ts`、`services/stock-tracker/batch/src/lib/openai-client.ts`

---

### [DUP-2] Retry ロジックの重複実装

**優先度: 高**

指数バックオフ付きリトライが複数箇所で独自実装されている。

| ファイル | 特徴 |
|---|---|
| `services/stock-tracker/batch/src/lib/retry.ts` | `withRetry<T>()` 関数、指数バックオフ、`shouldRetry` フック付き |
| `services/niconico-mylist-assistant/batch/src/utils.ts` | `retry<T>()` 関数、固定間隔リトライ |
| `libs/common/src/api/client.ts` | フロントエンド向け `apiRequest` 内にリトライ実装済み（ジッター付き） |

- **影響範囲**: 上記 2 ファイルおよびそれらを呼び出すバッチ処理全体
- **統合案**: `libs/common` にバックエンド向け `withRetry<T>()` を追加し、両バッチから利用
    - `ui → browser → common` ルールに抵触しない（`common` は依存先のため）
    - `services/niconico-mylist-assistant/batch/src/utils.ts` の `sleep()` も同様に共通化対象

---

### [DUP-3] `urlBase64ToUint8Array` の重複実装

**優先度: 中**

Web Push 用の Base64 URL デコードユーティリティが複数箇所に存在する。

| ファイル | 状況 |
|---|---|
| `services/niconico-mylist-assistant/web/src/lib/utils/push.ts` | ユーティリティとして分離済み |
| `services/stock-tracker/web/components/ServiceWorkerRegistration.tsx` | インライン実装（ローカル関数） |
| `services/stock-tracker/web/components/AlertSettingsModal.tsx` | インライン実装（ローカルアロー関数）—同一サービス内での重複 |

- **影響範囲**: 上記 3 箇所
- **統合先**: `libs/browser` に `urlBase64ToUint8Array()` を追加する
    - `libs/browser` はブラウザ API ユーティリティの置き場として適切
    - 依存関係ルール上も問題なし（`ui → browser → common`）

---

### [DUP-4] Web Push クライアントの重複実装

**優先度: 中**

`web-push` ライブラリを使った通知送信処理が 2 つのバッチに独立して実装されている。

| ファイル | 差異 |
|---|---|
| `services/stock-tracker/batch/src/lib/web-push-client.ts` | `Alert` 型に依存、毎回 VAPID 再設定 |
| `services/niconico-mylist-assistant/batch/src/lib/web-push-client.ts` | 汎用 `PushSubscription` 型、VAPID 設定のキャッシュあり、`normalizeVapidKey()` による柔軟な入力サポート |

- **共通部分**: VAPID キー取得・設定、`sendNotification()` の基本構造、エラーコード（410/404）の判定ロジック
- **統合案**: 共通化は難易度が高い（型依存の違いが大きい）ため、まず `normalizeVapidKey()` を stock-tracker へ移植する対応が優先。ペイロード生成関数はサービス固有のため共通化しない
- **依存関係**: `libs/common` または `libs/aws`（Push は AWS 外のため `libs/common` が適切）

---

### [DUP-5] `ThemeRegistry` コンポーネントの重複実装

**優先度: 中**

全 Next.js サービスが `ThemeRegistry.tsx` を独自に持つが、構造がほぼ同一。

| ファイル | 差異点 |
|---|---|
| `services/admin/web/src/components/ThemeRegistry.tsx` | `@nagiyu/ui` の `Header`/`Footer` を利用、`v16-appRouter` |
| `services/auth/web/src/components/ThemeRegistry.tsx` | `@nagiyu/ui` の `Header`/`Footer` を利用、`v15-appRouter` |
| `services/codec-converter/web/src/components/ThemeRegistry.tsx` | `@nagiyu/ui` の `Header`/`Footer` を利用、`v16-appRouter` |
| `services/niconico-mylist-assistant/web/src/components/ThemeRegistry.tsx` | カスタム `Navigation` コンポーネント、`v16-appRouter` |
| `services/share-together/web/src/components/ThemeRegistry.tsx` | `@nagiyu/ui` を使わず独自テーマを `createTheme` で定義 |
| `services/stock-tracker/web/components/ThemeRegistry.tsx` | `SessionProvider` + 権限ベースナビゲーション付き複合実装、`v15-appRouter` |
| `services/tools/src/components/ThemeRegistry.tsx` | `@nagiyu/ui` の theme のみ利用 |

- **共通パターン**: `AppRouterCacheProvider > ThemeProvider > CssBaseline > children` の入れ子構造
- **統合先**: `libs/ui` に `AppLayout`（または `AppThemeProvider`）コンポーネントを追加し、`title` や `navigationItems` などを props で受け取る形を検討
    - share-together の独自テーマは `@nagiyu/ui` の theme に統一するか検討が必要
    - stock-tracker の複合実装はサービス固有の責務が大きく、全面共通化は困難。基本レイアウト部分のみ切り出し可能
- **副次的問題**: `@mui/material-nextjs` のバージョンが `v15-appRouter` と `v16-appRouter` で混在している（後述の [TYPE-3] 参照）

---

### [DUP-6] `ServiceWorkerRegistration` コンポーネントの類似実装

**優先度: 低**

SW 登録と Push 通知サブスクリプション管理を行うコンポーネントが 3 サービスに存在する。

| ファイル | 差異 |
|---|---|
| `services/stock-tracker/web/components/ServiceWorkerRegistration.tsx` | SW 登録 + VAPID 取得 + サブスクライブ + サーバー側全アラート更新 |
| `services/niconico-mylist-assistant/web/src/components/ServiceWorkerRegistration.tsx` | SW 登録 + VAPID 取得 + サブスクライブ + サーバー側 subscribe エンドポイント呼び出し |
| `services/share-together/web/src/components/ServiceWorkerRegistration.tsx` | SW 登録のみ（Push 通知サブスクリプション処理なし） |

- **共通部分**: `navigator.serviceWorker.register('/sw.js')` + `registration.update()` の基本パターン
- **統合案**: share-together の簡易版のみ `libs/ui` にコンポーネントとして切り出し可能。Push 通知を含む版はサービス固有エンドポイントへの依存があるため共通化しない

---

### [DUP-7] `auth.ts` の定型パターン重複

**優先度: 低（現状は許容範囲）**

JWT 検証専用サービス（Auth 以外）の `auth.ts` がほぼ同一パターン。

| ファイル | 差異 |
|---|---|
| `services/admin/web/src/auth.ts` | `createAuthConfig()` のみ |
| `services/niconico-mylist-assistant/web/src/auth.ts` | `createAuthConfig({ includeSubAsUserIdFallback: true })` |
| `services/share-together/web/auth.ts` | `createAuthConfig({ includeSubAsUserIdFallback: true })` |
| `services/stock-tracker/web/auth.ts` | `createAuthConfig()` のみ（`secret` 追加あり） |

- **統合案**: 現状は各サービスが `@nagiyu/nextjs` の `createAuthConfig()` を呼び出す薄いラッパーであり、1〜10 行程度。重複のコストが低いため即時対応の優先度は低い。将来的に `@nagiyu/nextjs` に `createServiceAuthConfig()` を追加することで統合可能

---

### [DUP-8] `aws-clients.ts` の類似実装

**優先度: 低（既に @nagiyu/aws を使用済み）**

`@nagiyu/aws` を使ったクライアントラッパーが複数サービスに存在するが、既に共通ライブラリへの委譲で統一されている。

| ファイル | 取得するクライアント |
|---|---|
| `services/codec-converter/web/src/lib/aws-clients.ts` | DynamoDB + S3 + Batch（全て `@nagiyu/aws` 経由） |
| `services/niconico-mylist-assistant/web/src/lib/aws-clients.ts` | DynamoDB（`@nagiyu/aws`） + BatchClient（独自キャッシュ） |
| `services/share-together/web/src/lib/aws-clients.ts` | DynamoDB のみ（`@nagiyu/aws` 経由） |

- **問題点**: niconico の `BatchClient` が `@nagiyu/aws` の `BatchClient` を使わず独自実装している
- **統合案**: niconico の BatchClient を `@nagiyu/aws` の `getBatchClient()` で置き換える

---

## 既存ライブラリで代替可能な独自実装

### [LIB-1] `stock-tracker/batch` の Logger → `@nagiyu/common`

- **現状**: `services/stock-tracker/batch/src/lib/logger.ts` に独自実装
- **代替**: `import { logger } from '@nagiyu/common'`
- **対応**: `logger.ts` を削除し、import を差し替えるだけ

### [LIB-2] `share-together` の `getSessionOrUnauthorized()` → `@nagiyu/nextjs` の `withAuth()`

- **現状**: `services/share-together/web/src/lib/auth/session.ts` に `createUnauthorizedResponse()` と `getSessionOrUnauthorized()` を独自定義し、全 API route で使用
- **代替**: `@nagiyu/nextjs` の `withAuth()` ラッパーを使うことで、`getSessionOrUnauthorized()` の呼び出しパターンを削減できる
- **注意点**: share-together の route.ts は Union 型（`Session | NextResponse`）を返すパターンを多用しており、`withAuth()` への移行は大規模な書き換えを要する。中長期的な対応として位置づける

### [LIB-3] `niconico-mylist-assistant/web` の独自 Session 型 → `@nagiyu/common`

- **現状**: `services/niconico-mylist-assistant/web/src/types/auth.ts` に独自 `Session` 型を定義
- **代替**: `@nagiyu/common` の `Session` 型で代替可能（`user.id` vs `user.userId` の差異あり）
- **差異点**: 既存の `Session.user.id` を `Session.user.userId` に合わせる必要があるため、セッション参照箇所の修正が伴う

### [LIB-4] `niconico-mylist-assistant/batch` の BatchClient → `@nagiyu/aws`

- **現状**: `services/niconico-mylist-assistant/web/src/lib/aws-clients.ts` で `BatchClient` を独自キャッシュ管理
- **代替**: `@nagiyu/aws` の `getBatchClient(region)` を使用
- **確認事項**: `@nagiyu/aws` の BatchClient キャッシュ機能を確認してから置き換える（`libs/aws/src/batch/index.ts` 参照）

---

## 型定義の重複

### [TYPE-1] `Session` 型の重複

| 場所 | 型定義 |
|---|---|
| `libs/common/src/auth/types.ts` | `Session { user: User; expires: string }`（`User.userId` ベース） |
| `services/niconico-mylist-assistant/web/src/types/auth.ts` | `Session { user: { id, email, name, image?, roles[] } }` |

- **共通化案**: niconico の型を `@nagiyu/common` の `Session` に統一。`user.id` を `user.userId` に変更する

### [TYPE-2] `RetryConfig` 型の重複

| 場所 | 定義 |
|---|---|
| `libs/common/src/api/types.ts` | `RetryConfig { maxRetries, initialDelay, maxDelay, backoffMultiplier }` |
| `services/niconico-mylist-assistant/batch/src/types.ts` | `RetryConfig { maxRetries, retryDelay }` |
| `services/stock-tracker/batch/src/lib/retry.ts` | `RetryOptions { maxRetries, initialDelayMs, backoffMultiplier, shouldRetry? }` |

- **共通化案**: `libs/common` にバックエンド向けの `RetryOptions` を定義し、各バッチサービスの独自型を廃止

### [TYPE-3] `@mui/material-nextjs` バージョンの不統一

- `v15-appRouter` を使用: `services/auth/web`, `services/stock-tracker/web`
- `v16-appRouter` を使用: `services/admin/web`, `services/codec-converter/web`, `services/niconico-mylist-assistant/web`, `services/share-together/web`

- **統合案**: 全サービスを同一バージョンに揃える（MUI バージョン確認後に `v16-appRouter` へ統一）

---

## libs/ への切り出し可否判断

### 切り出し可能（依存関係ルール維持可能）

| 対象 | 切り出し先 | 理由 |
|---|---|---|
| `urlBase64ToUint8Array()` | `libs/browser` | ブラウザ API ラッパーとして適切。`browser → common` のルール内 |
| バックエンド向け `withRetry<T>()` | `libs/common` | フレームワーク非依存、副作用なし。最下位ライブラリとして適切 |
| 基本 SW 登録コンポーネント（share-together 版） | `libs/ui` | UI コンポーネントとして適切。`ui → browser → common` ルール内 |

### 切り出し困難（サービス固有の依存が強い）

| 対象 | 理由 |
|---|---|
| `web-push-client.ts` の `sendNotification()` | stock-tracker の `Alert` 型など、サービス固有型に依存 |
| stock-tracker の `ThemeRegistry` | `SessionProvider` + 権限付きナビゲーションがサービス固有ロジックを含む |
| `ServiceWorkerRegistration`（Push 込み） | サービス固有のエンドポイント（`/api/push/refresh`, `/api/push/subscribe`）に依存 |
| share-together の独自テーマ（`createTheme`） | `@nagiyu/ui` の theme と競合する可能性あり |

---

## 実装タスクリスト

優先度順（高→低）で整理する。

### 優先度: 高

- [ ] **T001**: `services/stock-tracker/batch/src/lib/logger.ts` を削除し、`@nagiyu/common` の `logger` に差し替える
    - 変更ファイル: `services/stock-tracker/batch/src/lib/logger.ts`（削除）、`retry.ts`、`web-push-client.ts`、`openai-client.ts`（import 変更）
    - 作業量: 小（import の差し替えのみ）

- [ ] **T002**: `libs/common` にバックエンド向け汎用 `withRetry<T>()` を追加する
    - 既存の `services/stock-tracker/batch/src/lib/retry.ts` をベースに汎用化
    - `shouldRetry` フック、指数バックオフ、ロガー注入（インタフェース経由）をサポート
    - 変更ファイル: `libs/common/src/index.ts`（エクスポート追加）
    - 作業量: 中

- [ ] **T003**: `services/stock-tracker/batch/src/lib/retry.ts` を削除し、`@nagiyu/common` の `withRetry` に差し替える（T002 完了後）
    - 変更ファイル: `services/stock-tracker/batch/src/lib/retry.ts`（削除）、呼び出し元

- [ ] **T004**: `services/niconico-mylist-assistant/batch/src/utils.ts` の `retry()` と `sleep()` を `@nagiyu/common` の `withRetry` / `sleep` に差し替える（T002 完了後）
    - 変更ファイル: `services/niconico-mylist-assistant/batch/src/utils.ts`（`retry`/`sleep` の削除）

### 優先度: 中

- [ ] **T005**: `libs/browser` に `urlBase64ToUint8Array()` を追加する
    - 変更ファイル: `libs/browser/src/index.ts`、新規ファイル `libs/browser/src/push.ts`（またはユーティリティファイル）
    - 作業量: 小

- [ ] **T006**: `services/stock-tracker/web/components/ServiceWorkerRegistration.tsx` と `AlertSettingsModal.tsx` のインライン実装を `@nagiyu/browser` 利用に変更する（T005 完了後）
    - 変更ファイル: 上記 2 ファイル

- [ ] **T007**: `services/niconico-mylist-assistant/web/src/lib/utils/push.ts` を `@nagiyu/browser` 利用に変更する（T005 完了後）
    - 変更ファイル: `services/niconico-mylist-assistant/web/src/lib/utils/push.ts`

- [ ] **T008**: `services/niconico-mylist-assistant/web/src/lib/aws-clients.ts` の `BatchClient` 独自キャッシュを `@nagiyu/aws` の `getBatchClient()` で置き換える
    - 変更ファイル: `services/niconico-mylist-assistant/web/src/lib/aws-clients.ts`
    - 事前確認: `libs/aws/src/batch/index.ts` の `getBatchClient` のキャッシュ実装を確認

- [ ] **T009**: `services/niconico-mylist-assistant/batch/src/lib/web-push-client.ts` の `normalizeVapidKey()` を `services/stock-tracker/batch/src/lib/web-push-client.ts` にも適用する
    - 変更ファイル: `services/stock-tracker/batch/src/lib/web-push-client.ts`
    - 注意: VAPID キー設定のキャッシュ（`vapidConfigured` フラグ）も stock-tracker 側に追加推奨

- [ ] **T010**: `@mui/material-nextjs` のバージョンを全サービスで統一する（`v16-appRouter` に揃える）
    - 事前確認: 各サービスの `package.json` で使用中の `@mui/material` メジャーバージョンを確認し、`v16-appRouter` との互換性を検証する（MUI v6 系が `v16-appRouter` に対応）
    - 変更ファイル: `services/auth/web/src/components/ThemeRegistry.tsx`、`services/stock-tracker/web/components/ThemeRegistry.tsx`、各サービスの `package.json`

### 優先度: 低

- [ ] **T011**: `services/niconico-mylist-assistant/web/src/types/auth.ts` の独自 `Session` 型を `@nagiyu/common` の `Session` 型に統一する
    - 事前確認: `user.id`（niconico）vs `user.userId`（common）の差異を確認し、影響範囲を調査
    - 変更ファイル: `services/niconico-mylist-assistant/web/src/types/auth.ts`（削除）、参照箇所

- [ ] **T012**: `libs/ui` に基本レイアウト用の汎用 `AppLayout` コンポーネントを追加し、`ThemeRegistry` の共通部分（`AppRouterCacheProvider + ThemeProvider + CssBaseline`）を統一する
    - 対象サービス: admin, auth, codec-converter, niconico（share-together と stock-tracker は独自要件が大きいため別途検討）
    - 作業量: 中

- [ ] **T013**: share-together の `getSessionOrUnauthorized()` パターンを `@nagiyu/nextjs` の `withAuth()` に段階的に移行する
    - 影響範囲: `services/share-together/web/src/app/api/` 配下の全 route.ts（10 ファイル以上）
    - 作業量: 大（各 route の書き換えが必要）

- [ ] **T014**: `libs/common` の `RetryOptions` 型を整備し、各バッチの独自 `RetryConfig`/`RetryOptions` 型を廃止する（T002〜T004 完了後）

---

## 備考・未決定事項

- **share-together の独自テーマ**: `createTheme({ palette: { primary: '#1565c0' } })` を `@nagiyu/ui` の共通 theme に統一すべきか、デザイン観点からの判断が必要
- **`libs/common` へのバックエンド向け機能追加の方針**: `libs/common` は現状フロントエンド・バックエンド共用として設計されているが、Node.js 専用 API（`fs`, `crypto` 等）を依存させないよう注意が必要
- **VAPID 共通ライブラリ化の検討**: Web Push クライアント全体（`web-push` ライブラリ）を `libs/` に切り出すか検討。ただし Push 通知はサービス固有の業務ロジックと密結合しており、現時点では共通化よりコードレビューによる品質統一が優先
- **`RetryConfig` 統一の副作用**: niconico と stock-tracker のリトライ設定がパラメータ名（`retryDelay` vs `initialDelayMs`）で異なるため、マイグレーション時に挙動を確認すること
