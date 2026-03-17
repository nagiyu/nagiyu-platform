# コード共通化調査 (2026-03-15)

## 概要

リポジトリ全体のコード共通化調査。サービス間・ライブラリ間の重複実装を特定し、
`libs/common`・`libs/browser`・`libs/ui`・`libs/nextjs`・`libs/aws` への切り出し可否を検討する。
依存関係ルール `ui → browser → common` を厳守した構成案を示す。
`@nagiyu/react` および `@nagiyu/nextjs` は `@nagiyu/common` に依存する（`react → common`、`nextjs → common`）。
ライブラリ間の循環依存は禁止。

## 関連情報

- タスクタイプ: プラットフォームタスク
- 調査対象サービス: admin, auth, codec-converter, niconico-mylist-assistant, share-together, stock-tracker, tools
- 調査対象ライブラリ: aws, browser, common, nextjs, react, ui

---

## 1. 重複実装の候補一覧

### 1-A. ThemeRegistry コンポーネント（高優先度）

**重複箇所（7サービス）**

| ファイルパス | 内容 |
|---|---|
| `services/admin/web/src/components/ThemeRegistry.tsx` | ServiceLayout に title/ariaLabel を渡すのみ |
| `services/auth/web/src/components/ThemeRegistry.tsx` | 同上 |
| `services/codec-converter/web/src/components/ThemeRegistry.tsx` | 同上 |
| `services/niconico-mylist-assistant/web/src/components/ThemeRegistry.tsx` | ServiceLayout に title/ariaLabel + headerSlot（Navigation）を渡すのみ |
| `services/share-together/web/src/components/ThemeRegistry.tsx` | ServiceLayout に title/ariaLabel を渡すのみ |
| `services/stock-tracker/web/components/ThemeRegistry.tsx` | SessionProvider + SnackbarProvider + ErrorBoundary でラップ |
| `services/tools/src/components/ThemeRegistry.tsx` | AppRouterCacheProvider + ThemeProvider を直接使用（ServiceLayout 未使用） |

**状況**: admin, auth, codec-converter, share-together, niconico の 5 サービスは `ServiceLayout` への薄いラッパーに過ぎず、
ThemeRegistry 自体を削除して `layout.tsx` から `ServiceLayout` を直接呼び出す形にするとシンプルになる。
`ThemeRegistry` というレイヤーを挟む必要はないため、削除を推奨方針とする。

- **tools**: `ServiceLayout` を使用しておらず、MUI 直接利用のため別途 `ServiceLayout` への移行を検討する（独立した課題）。
- **stock-tracker**: `SessionProvider`・`SnackbarProvider` 等の複数レイヤーを含む複雑な構成のため、`ThemeRegistry` として残しつつ内部を整理する方向とする。

---

### 1-B. ServiceWorkerRegistration コンポーネント（高優先度）

**重複箇所（3サービス）**

| ファイルパス | Push 通知サポート |
|---|---|
| `services/niconico-mylist-assistant/web/src/components/ServiceWorkerRegistration.tsx` | あり（VAPID 取得 + subscribe API 呼び出し） |
| `services/share-together/web/src/components/ServiceWorkerRegistration.tsx` | なし（SW 登録のみ）※将来対応予定 |
| `services/stock-tracker/web/components/ServiceWorkerRegistration.tsx` | あり（VAPID 取得 + refresh API 呼び出し） |

**状況**: niconico と stock-tracker のロジックはほぼ同一。差異はサーバー送信エンドポイントのみ（`/api/push/subscribe` vs `/api/push/refresh`）。
share-together も将来的にプッシュ通知を追加する予定があるため、3 サービスすべてを共通コンポーネントの対象とする。

**共通化方針**: エンドポイントを省略可能なプロパティとして受け取り、
- エンドポイントが指定されている場合 → VAPID 取得 + サブスクリプション登録 + サーバー送信まで実行
- エンドポイントが指定されていない場合 → Service Worker の登録のみ実行（Push サブスクリプションはスキップ）

このインターフェースにより、share-together の現行実装と、niconico/stock-tracker の完全実装を単一コンポーネントで表現できる。

---

### 1-C. web-push-client.ts（高優先度）

**重複箇所（2サービス）**

| ファイルパス |
|---|
| `services/niconico-mylist-assistant/batch/src/lib/web-push-client.ts` |
| `services/stock-tracker/batch/src/lib/web-push-client.ts` |

**状況**: VAPID キー設定・`sendNotification` 関数の骨格・エラーハンドリング（410/404 判定）が**完全に同一**。
差異は `sendNotification` の第一引数（niconico: 独自 `PushSubscription` 型、stock-tracker: `Alert` エンティティ）と
ログ出力フィールドのみ。

**共通化方針**:

- `@nagiyu/common` に `PushSubscription` 型（`{ endpoint, keys: { p256dh, auth } }`）を定義する
- stock-tracker の `Alert` エンティティ側を見直し、`SubscriptionEndpoint`・`SubscriptionKeysP256dh`・`SubscriptionKeysAuth` をフラットなフィールドで持つ現状から、**`subscription: PushSubscription` 型のプロパティを直接持つ形**に変更する
    - これにより `alert.SubscriptionEndpoint` のような参照が不要になり、`alert.subscription` で直接渡せるようになる
    - DynamoDB スキーマの変更を伴う場合は既存データのマイグレーション計画も立案する
- `sendWebPushNotification` 関数の共通化（`@nagiyu/common` への `web-push` 追加）は今回見送り。各バッチサービスの独自実装を維持する

---

### 1-D. Repository Factory パターン（中優先度）

**重複箇所（4箇所）**

| ファイルパス |
|---|
| `services/niconico-mylist-assistant/core/src/repositories/factory.ts` |
| `services/share-together/core/src/repositories/factory.ts` |
| `services/share-together/web/src/lib/repositories.ts` |
| `services/stock-tracker/web/lib/repository-factory.ts` |

**状況（確度: 高）**: 全ファイルで以下の 3 パターンが完全に共通している。

1. `USE_IN_MEMORY_DB` 環境変数フラグによる DynamoDB / InMemory リポジトリ切り替え
2. シングルトンインスタンス管理（`null` チェックで初回のみ生成）
3. リセット関数（`clearMemoryStore` / `resetInMemoryRepositories`）によるテスト用クリーンアップ

各ファイルのリポジトリ数・変数名は異なるが、制御フローはほぼ同一である。
`@nagiyu/aws` にジェネリックなファクトリーヘルパー（`createRepositoryFactory<T>`）を追加すれば、
各サービスの factory.ts はリポジトリの生成ロジックのみに集約できる。

---

### 1-E. push/subscribe API ハンドラー（中優先度）

**重複箇所（2サービス）**

| ファイルパス |
|---|
| `services/niconico-mylist-assistant/web/src/app/api/push/subscribe/route.ts` |
| `services/stock-tracker/web/app/api/push/subscribe/route.ts` |

**状況**: リクエストボディのバリデーション・エラーレスポンスのパターン・`validatePushSubscription`/`createSubscriptionId`
の呼び出しフローが**ほぼ同一**。差異は `getAuthError` の権限引数のみ。
`@nagiyu/nextjs` の `createPushSubscribeRoute(getSession, requiredPermission?)` として共通化できる。

---

### 1-F. push.ts ユーティリティの再エクスポート（低優先度）

**重複箇所**

| ファイルパス | 内容 |
|---|---|
| `services/niconico-mylist-assistant/web/src/lib/utils/push.ts` | `@nagiyu/browser` の `urlBase64ToUint8Array` を再エクスポートするだけ |

**状況**: このファイルはラッパーを作る意味がなく、インポート元を直接 `@nagiyu/browser` に変更すれば削除できる。

---

### 1-G. getAuthError / checkPermission の重複（中優先度）

**重複箇所（2箇所）**

| ファイルパス |
|---|
| `services/stock-tracker/core/src/services/auth.ts` |
| `libs/nextjs/src/auth.ts`（`getAuthError` が既に定義済み） |

**状況**: stock-tracker は独自の `getAuthError` を `@nagiyu/stock-tracker-core` 経由で参照している。
`@nagiyu/nextjs` に同等の関数が既に存在するため、stock-tracker の実装を削除して
`@nagiyu/nextjs` から直接インポートするよう統合できる。

---

### 1-H. DynamoDB クライアントラッパー（低優先度）

**重複箇所（2サービス）**

| ファイルパス |
|---|
| `services/auth/core/src/db/dynamodb-client.ts` |
| `services/niconico-mylist-assistant/core/src/db/client.ts` |

**状況**: 両ファイルとも `@nagiyu/aws` の `getDynamoDBDocumentClient` と `getTableName` を
ラップしているだけ。`@nagiyu/aws` を直接使うことで削除できる。

- **niconico-mylist-assistant/core/src/db/client.ts**: シンプルなラッパーで `@nagiyu/aws` を直接使うことで削除可能。
- **auth/core/src/db/dynamodb-client.ts**: `getUsersTableName()` は `getTableName('nagiyu-auth-users-dev')` を呼び出しており、
  `DynamoDBUserRepository` コンストラクタから実際に呼ばれるパスが存在する。
  デフォルト値 `'nagiyu-auth-users-dev'` は開発環境向けフォールバックであり、本番では `DYNAMODB_TABLE_NAME` 環境変数で上書きされる。
  ラッパーを削除して `DynamoDBUserRepository` 側で直接 `getTableName('nagiyu-auth-users-dev')` を呼び出す形にすれば、
  動作を変えずに削除できる。

---

## 2. 共通ライブラリへの切り出し可否と構成案

依存関係ルール: `ui → browser → common`（libs 間の循環禁止）
`@nagiyu/react` および `@nagiyu/nextjs` は `@nagiyu/common` に依存する（それぞれ `react → common`、`nextjs → common`）。

### 2-A. `@nagiyu/common` への追加候補

| 機能 | 追加ファイル案 | 根拠 |
|---|---|---|
| `PushSubscription` 共通型 | `src/push/types.ts` | niconico・stock-tracker batch が独自定義している型を共通化 |
| `isValidPrice` / `isValidQuantity` の一般化 | `src/validation/helpers.ts`（既存ファイルに追加） | stock-tracker 固有の関数名は廃止し、汎用名（`isValidPositiveDecimal(value, min, max)` など）で `isValidNumber` のラッパーとして実装。stock-tracker 側からはエイリアスまたは直接 `isValidNumber` を呼び出す形に変更 |

---

### 2-B. `@nagiyu/browser` への追加候補

| 機能 | 追加ファイル案 | 根拠 |
|---|---|---|
| ServiceWorkerRegistration ロジック | `src/service-worker.ts` | `urlBase64ToUint8Array` は既存。SW 登録・Push サブスクリプション管理はブラウザ専用ロジック |

依存方向: `browser` は `common` に依存可（`ui → browser → common` ルール準拠）。

---

### 2-C. `@nagiyu/ui` への追加候補

| 機能 | 追加ファイル案 | 根拠 |
|---|---|---|
| ServiceWorkerRegistration コンポーネント | `src/components/ServiceWorkerRegistration.tsx` | React コンポーネントとして `@nagiyu/browser` のロジックをラップ。`subscribeEndpoint?` プロパティで Push 通知の有無を切り替え |

依存方向: `ui → browser → common` に準拠。`@nagiyu/ui` は `@nagiyu/browser` に依存可。

---

### 2-D. `@nagiyu/nextjs` への追加候補

| 機能 | 追加ファイル案 | 根拠 |
|---|---|---|
| Push Subscribe ルートファクトリ | `src/push-subscribe.ts` | niconico/stock-tracker の `/api/push/subscribe` が同一パターン。`createPushSubscribeRoute(getSession, permission?)` として提供 |

既存の `createVapidPublicKeyRoute`・`createHealthRoute`・`createAuthMiddleware`・`createSessionGetter`・`handleApiError`・`parsePagination` と同様のパターン。

---

### 2-E. `@nagiyu/aws` への追加候補

| 機能 | 追加ファイル案 | 根拠 |
|---|---|---|
| ジェネリックなリポジトリファクトリーヘルパー | `src/dynamodb/repository-factory.ts` | factory.ts の「環境変数フラグによる切り替え + シングルトン管理」パターンを汎用化 |

---

## 3. 既存ライブラリで代替可能な独自実装の統合案

### 3-A. `services/stock-tracker/core/src/services/auth.ts` → `@nagiyu/nextjs`

**現状**: stock-tracker は `getAuthError` / `checkPermission` を独自実装し、`@nagiyu/stock-tracker-core` 経由で参照。
**代替**: `@nagiyu/nextjs` に同等の `getAuthError(session, permission?)` が既に存在。

**対応ファイル**:
- `services/stock-tracker/core/src/services/auth.ts` ─ 削除候補
- `services/stock-tracker/web/app/api/push/subscribe/route.ts` ─ import 先を `@nagiyu/nextjs` に変更
- `services/stock-tracker/web/app/api/*/route.ts`（各ルート）─ 同様に import 変更

---

### 3-B. `services/niconico-mylist-assistant/web/src/lib/utils/push.ts` → `@nagiyu/browser`

**現状**: `urlBase64ToUint8Array` の再エクスポートのみのファイル。
**代替**: `@nagiyu/browser` を直接 import することでファイル自体が不要になる。

**対応ファイル**:
- `services/niconico-mylist-assistant/web/src/lib/utils/push.ts` ─ 削除
- `services/niconico-mylist-assistant/web/src/components/ServiceWorkerRegistration.tsx` ─ import 先を `@nagiyu/browser` に変更（stock-tracker と同じ状態）

---

### 3-C. `services/auth/core/src/db/dynamodb-client.ts` → `@nagiyu/aws`

**現状**: `getDynamoDBDocumentClient` と `getTableName` を単純ラップしている。
`getUsersTableName()` は `getTableName('nagiyu-auth-users-dev')` を呼び出しており、
`DynamoDBUserRepository` コンストラクタから実際に呼ばれるパスが確認済み。
デフォルト値 `'nagiyu-auth-users-dev'` は開発環境向けフォールバック（本番では `DYNAMODB_TABLE_NAME` 環境変数で上書きされる）。

**代替**: `@nagiyu/aws` を直接使用。ラッパー削除後は `DynamoDBUserRepository` 側で直接 `getTableName('nagiyu-auth-users-dev')` を呼び出す。

**対応ファイル**:
- `services/auth/core/src/db/dynamodb-client.ts` ─ 削除
- `services/auth/core/src/db/repositories/dynamodb-user-repository.ts` ─ `@nagiyu/aws` を直接 import し、デフォルト値を明示的に指定

---

### 3-D. `services/share-together/web/src/lib/repositories.ts` の重複解消

**現状**: `services/share-together/core/src/repositories/factory.ts` と `services/share-together/web/src/lib/repositories.ts` が
同一のリポジトリファクトリーロジックを二重管理している。
**代替**: core 側の factory をそのまま使うか、web 側から core の factory 関数を直接 re-export する形に統一する。

**対応ファイル**:
- `services/share-together/web/src/lib/repositories.ts` ─ core の factory.ts を直接呼び出す形に変更
- `services/share-together/core/src/repositories/factory.ts` ─ `resetInMemoryRepositories` など必要な関数を追加エクスポート

---

## 4. 型定義の重複と共通化案

### 4-A. ErrorResponse 型の重複

**重複箇所**

| ファイルパス | 定義内容 |
|---|---|
| `services/niconico-mylist-assistant/core/src/types/index.ts` | `interface ErrorResponse { error: { code: string; message: string; details?: unknown } }` |
| `libs/common/src/api/types.ts` | `type ErrorResponse = APIErrorResponse` として定義済み |

**対応**: `@nagiyu/common` の `ErrorResponse` を import して使用する。
niconico の `ErrorResponse` は `{ error: { code: string; message: string; details?: unknown } }` 形式で、
common の `APIErrorResponse` は `{ error: string; message: string; details?: string[] }` 形式と構造が異なる。

**推奨統一方針**: `@nagiyu/common` の `APIErrorResponse` に `code` フィールドをオプションで追加する形に拡張し、
全サービスで同一型を使用する。

```
interface APIErrorResponse {
    error: string;        // エラーコード文字列
    message: string;
    code?: string;        // 追加（後方互換を保つためオプション）
    details?: string[];
}
```

これにより既存サービスへの影響を最小化しつつ、niconico の型と互換性を持たせられる。

---

### 4-B. PushSubscription 型の重複

**重複箇所**

| ファイルパス | 定義内容 |
|---|---|
| `services/niconico-mylist-assistant/batch/src/lib/web-push-client.ts` | `interface PushSubscription { endpoint: string; keys: { p256dh: string; auth: string } }` |
| `libs/nextjs/src/push.ts` | `interface PushSubscriptionData { endpoint: string; keys: { p256dh: string; auth: string } }` |

**対応**: `@nagiyu/common/src/push/types.ts` に `PushSubscription` 型を定義し、
`@nagiyu/nextjs` の `PushSubscriptionData` および niconico batch の独自定義をこの共通型に統一する。

さらに、stock-tracker の `Alert` エンティティが現在フラットフィールド（`SubscriptionEndpoint`・`SubscriptionKeysP256dh`・`SubscriptionKeysAuth`）で
Push サブスクリプション情報を保持している構造を見直し、`subscription: PushSubscription` プロパティを直接持つ形に変更することで
エンティティ設計の一貫性と保守性が向上する。

---

### 4-C. next-auth.d.ts 宣言ファイル

**現状（既に統一済み）**

| ファイルパス | 内容 |
|---|---|
| `services/admin/web/src/types/next-auth.d.ts` | `import '@nagiyu/nextjs/types/next-auth'` のみ |
| `services/auth/core/src/types/next-auth.d.ts` | 同上 |
| `services/niconico-mylist-assistant/web/src/types/next-auth.d.ts` | 同上 |
| `services/stock-tracker/web/types/next-auth.d.ts` | 同上 |

**評価**: ✅ 既に `@nagiyu/nextjs` の型宣言への単一参照として統一済み。追加対応不要。

---

### 4-D. AuthSession 型の重複（中優先度）

**重複箇所（3サービス）**

| ファイルパス |
|---|
| `services/admin/web/src/lib/auth/session.ts` |
| `services/auth/web/src/lib/auth/session.ts` |
| `services/share-together/web/src/lib/auth/session.ts` |

```
type AuthSession = {
    user?: Session['user'] & { id?: string; roles?: string[] };
    expires?: string;
}
```

**対応**: `@nagiyu/nextjs` の `createSessionGetter` が既にジェネリック対応しているため、
`AuthSession` ローカル型は削除し、`@nagiyu/common` の `Session` 型をそのまま使用する方向で統一できる。

---

## 5. 既に適切に共通化されている実装（対応不要）

以下は既に共通ライブラリに切り出され、全サービスで統一的に利用されている。

| パターン | 共通化先 | 利用サービス |
|---|---|---|
| Health チェックルート | `@nagiyu/nextjs` の `createHealthRoute` | 全 7 サービス |
| VAPID 公開鍵ルート | `@nagiyu/nextjs` の `createVapidPublicKeyRoute` | niconico, stock-tracker |
| 認証ミドルウェア | `@nagiyu/nextjs/middleware` の `createAuthMiddleware` | admin, auth, niconico, share-together, stock-tracker |
| セッション取得 | `@nagiyu/nextjs/session` の `createSessionGetter` | admin, auth, niconico, share-together, stock-tracker |
| NextAuth 設定 | `@nagiyu/nextjs` の `createServiceAuthConfig` | admin, niconico, share-together, stock-tracker |
| ページネーション | `@nagiyu/nextjs` の `parsePagination`/`createPaginatedResponse` | stock-tracker |
| API エラーハンドリング | `@nagiyu/nextjs` の `handleApiError` | 複数サービス |
| Push サブスクリプション検証 | `@nagiyu/nextjs` の `validatePushSubscription`/`createSubscriptionId` | niconico, stock-tracker |
| DynamoDB 抽象リポジトリ | `@nagiyu/aws` の `AbstractDynamoDBRepository` | niconico, stock-tracker |
| InMemory ストア | `@nagiyu/aws` の `InMemorySingleTableStore` | niconico, stock-tracker |
| VAPID キー正規化 | `@nagiyu/common` の `normalizeVapidKey` | niconico batch, stock-tracker batch |
| ロガー | `@nagiyu/common` の `logger` | 複数サービス |
| エラーコード / メッセージ定数 | `@nagiyu/common` の `COMMON_ERROR_MESSAGES`/`ERROR_CODES` | niconico, share-together, stock-tracker |
| 権限チェック | `@nagiyu/common` の `hasPermission` | stock-tracker, libs/nextjs |
| URL Base64 変換 | `@nagiyu/browser` の `urlBase64ToUint8Array` | stock-tracker, niconico（再エクスポート） |
| API リクエスト / フック | `@nagiyu/react` の `ApiClient`/`useAPIRequest` | （未使用サービスは今後の採用候補） |
| ServiceLayout / Header / Footer | `@nagiyu/ui` | 全 6 サービス（tools 除く） |

---

## 6. 実装タスク

優先度順に整理する。

### フェーズ 1: 削除・単純置換（影響が小さい・即座に対応可能）

- [x] T001: `services/niconico-mylist-assistant/web/src/lib/utils/push.ts` を削除し、import 先を `@nagiyu/browser` に直接変更
    - 影響ファイル: `services/niconico-mylist-assistant/web/src/components/ServiceWorkerRegistration.tsx`
- [x] T002: `services/share-together/web/src/lib/repositories.ts` を `core/repositories/factory.ts` の関数を直接使う形にリファクタリング
    - 影響ファイル: `services/share-together/web/src/app/api/*/route.ts` など
- [x] T003: stock-tracker の `getAuthError` import を `@nagiyu/stock-tracker-core` から `@nagiyu/nextjs` に変更
    - 影響ファイル: `services/stock-tracker/web/app/api/push/subscribe/route.ts` など各 API ルート
    - 移行前後の動作検証として、認証・認可フローに関する統合テストを実施すること
- [x] T004: `services/auth/core/src/db/dynamodb-client.ts` を廃止し、`@nagiyu/aws` の直接呼び出しに移行
    - `services/auth/core/src/db/repositories/dynamodb-user-repository.ts` で直接 `getTableName('nagiyu-auth-users-dev')` を呼び出す形に変更
    - `services/niconico-mylist-assistant/core/src/db/client.ts` も同様に削除

### フェーズ 2: 共通コンポーネント化（`@nagiyu/ui`）

- [x] T005: `ServiceWorkerRegistration` コンポーネントを `libs/ui/src/components/ServiceWorkerRegistration.tsx` に共通化
    - `subscribeEndpoint?: string` をプロパティで受け取る設計
    - プロパティあり → VAPID 取得 + サブスクリプション登録 + サーバー送信まで実行
    - プロパティなし → Service Worker 登録のみ（share-together 現行相当）
    - `@nagiyu/browser` の `urlBase64ToUint8Array` を使用
    - 対象: niconico, share-together, stock-tracker の各 `ServiceWorkerRegistration.tsx`

### フェーズ 3: 共通ロジック化（`@nagiyu/common` / `@nagiyu/nextjs`）

- [x] T006: `PushSubscription` 型を `@nagiyu/common/src/push/types.ts` に追加
    - 対象型: `services/niconico-mylist-assistant/batch/src/lib/web-push-client.ts` の `PushSubscription`
    - `@nagiyu/nextjs/src/push.ts` の `PushSubscriptionData` もこの型に統一
- [x] T007: stock-tracker の `Alert` エンティティを `PushSubscription` 型プロパティを持つ形に変更
    - `SubscriptionEndpoint`・`SubscriptionKeysP256dh`・`SubscriptionKeysAuth` をフラットなフィールドで持つ現状から
      `subscription: PushSubscription` プロパティを直接持つ形に変更
    - DynamoDB スキーマ変更を伴う場合は既存データのマイグレーション計画も策定する
- [x] T008: `@nagiyu/nextjs` に `createPushSubscribeRoute(options)` を追加
    - 対象: `services/niconico-mylist-assistant/web/src/app/api/push/subscribe/route.ts`・`services/stock-tracker/web/app/api/push/subscribe/route.ts`

### フェーズ 4: ThemeRegistry 削除（`layout.tsx` で ServiceLayout を直接使用）

- [ ] T009: admin, auth, codec-converter, share-together, niconico の `ThemeRegistry.tsx` を削除し、各 `layout.tsx` から `ServiceLayout` を直接呼び出す形に変更
    - 対象ファイルの削除: 各サービスの `ThemeRegistry.tsx`
    - 各 `layout.tsx` で `ServiceLayout` に title/ariaLabel/headerSlot を直接渡す
- [ ] T010: `services/tools/src/components/ThemeRegistry.tsx` を `ServiceLayout` ベースに移行（独立した課題として対応）

### フェーズ 5: Repository Factory 共通化（`@nagiyu/aws`）

- [ ] T011: `@nagiyu/aws` にジェネリックなファクトリーヘルパー `createRepositoryFactory<T>` を追加
    - 環境変数フラグによる DynamoDB / InMemory 切り替え・シングルトン管理・リセット機構を提供
    - 対象: niconico-mylist-assistant, share-together, stock-tracker の各 factory.ts

---

## 備考・未決定事項

1. **tools の ThemeRegistry**: tools は PWA 対応・サイトマップ生成など独自機能が多く、
   `ServiceLayout` 移行時に既存の `MigrationDialog` をどう扱うか要検討。

2. **stock-tracker の ThemeRegistry**: `SessionProvider` と `SnackbarProvider` を含む複雑な構成のため、
   ThemeRegistry として残しつつ内部を整理する方向とする。

3. **Alert サブスクリプションの DynamoDB マイグレーション計画（Phase 3）**:
   - 既存データは `SubscriptionEndpoint` / `SubscriptionKeysP256dh` / `SubscriptionKeysAuth` を保持しているため、
     段階的移行期間は mapper 側で旧形式の読み取りを許容する。
   - 新規作成・更新は `subscription` フィールドで保存する。
   - 旧形式データの一括変換（バックフィル）は別タスクで実施し、完了後に旧フィールド互換ロジックを削除する。

3. **stock-tracker Alert エンティティの変更**: `SubscriptionEndpoint` 等フラットフィールドから `subscription: PushSubscription` への移行は
   DynamoDB スキーマ変更を伴う可能性があるため、既存データのマイグレーション計画を事前に策定すること。
