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
| `services/niconico-mylist-assistant/web/src/components/ThemeRegistry.tsx` | headerSlot にカスタム Navigation を渡す |
| `services/share-together/web/src/components/ThemeRegistry.tsx` | ServiceLayout に title/ariaLabel を渡すのみ |
| `services/stock-tracker/web/components/ThemeRegistry.tsx` | SessionProvider + SnackbarProvider + ErrorBoundary でラップ |
| `services/tools/src/components/ThemeRegistry.tsx` | AppRouterCacheProvider + ThemeProvider を直接使用（ServiceLayout 未使用） |

**状況**: admin, auth, codec-converter, share-together の 4 サービスは構造が完全に同一（title/ariaLabel の文字列のみ異なる）。
niconico, stock-tracker はサービス固有の機能（カスタムナビ、SessionProvider）を含むため、一部パターンのみ共通化可能。
tools は MUI の直接利用で他と乖離しており、ServiceLayout への移行が必要。

---

### 1-B. ServiceWorkerRegistration コンポーネント（高優先度）

**重複箇所（3サービス）**

| ファイルパス | Push 通知サポート |
|---|---|
| `services/niconico-mylist-assistant/web/src/components/ServiceWorkerRegistration.tsx` | あり（VAPID 取得 + subscribe API 呼び出し） |
| `services/share-together/web/src/components/ServiceWorkerRegistration.tsx` | なし（SW 登録のみ） |
| `services/stock-tracker/web/components/ServiceWorkerRegistration.tsx` | あり（VAPID 取得 + subscribe API 呼び出し） |

**状況**: niconico と stock-tracker のファイルはロジックが**ほぼ同一**。相違点は
サーバーへの送信先エンドポイント（`/api/push/subscribe` vs `/api/push/refresh`）のみ。
エンドポイントをプロパティとして受け取れる共通コンポーネントとして `@nagiyu/browser` または `@nagiyu/ui` に切り出せる。

---

### 1-C. web-push-client.ts（高優先度）

**重複箇所（2サービス）**

| ファイルパス |
|---|
| `services/niconico-mylist-assistant/batch/src/lib/web-push-client.ts` |
| `services/stock-tracker/batch/src/lib/web-push-client.ts` |

**状況**: VAPID キー設定・`sendNotification` 関数の骨格・エラーハンドリング（410/404 判定）が**完全に同一**。
差異は `sendNotification` の第一引数（niconico: 独自 `PushSubscription` 型、stock-tracker: `Alert` エンティティ）と
ログ出力フィールドのみ。共通の `sendWebPushNotification(endpoint, keys, payload)` 関数として `@nagiyu/common` に切り出せる。

---

### 1-D. Repository Factory パターン（中優先度）

**重複箇所（3箇所）**

| ファイルパス |
|---|
| `services/niconico-mylist-assistant/core/src/repositories/factory.ts` |
| `services/share-together/core/src/repositories/factory.ts` |
| `services/share-together/web/src/lib/repositories.ts` |
| `services/stock-tracker/web/lib/repository-factory.ts` |

**状況**: 全ファイルで「`USE_IN_MEMORY_DB` フラグによる DynamoDB / InMemory 切り替え」「シングルトンインスタンス管理」「引数バリデーション」という
3 パターンが繰り返されている。`@nagiyu/aws` にジェネリックなファクトリーヘルパー（`createRepositoryFactory`）として切り出せる可能性がある。

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

### 1-H. LoadingState / EmptyState / ErrorAlert / ErrorBoundary（低優先度）

**重複箇所（stock-tracker のみ）**

| ファイルパス |
|---|
| `services/stock-tracker/web/components/EmptyState.tsx` |
| `services/stock-tracker/web/components/LoadingState.tsx` |
| `services/stock-tracker/web/components/ErrorAlert.tsx` |
| `services/stock-tracker/web/components/ErrorDisplay.tsx` |
| `services/stock-tracker/web/components/ErrorBoundary.tsx` |

**状況**: 現時点では stock-tracker のみに存在するが、MUI を使った汎用 UI コンポーネントであり
他サービスでも必要になる可能性がある。`@nagiyu/ui` への移行候補。

---

### 1-I. DynamoDB クライアントラッパー（低優先度）

**重複箇所（2サービス）**

| ファイルパス |
|---|
| `services/auth/core/src/db/dynamodb-client.ts` |
| `services/niconico-mylist-assistant/core/src/db/client.ts` |

**状況**: 両ファイルとも `@nagiyu/aws` の `getDynamoDBDocumentClient` と `getTableName` を
そのままラップしているだけ。`@nagiyu/aws` を直接使うことで削除できる（auth/core は独自テーブル名ロジックを持つため要注意）。

---

## 2. 共通ライブラリへの切り出し可否と構成案

依存関係ルール: `ui → browser → common`（libs 間の循環禁止）
`@nagiyu/react` および `@nagiyu/nextjs` は `@nagiyu/common` に依存する（それぞれ `react → common`、`nextjs → common`）。

### 2-A. `@nagiyu/common` への追加候補

| 機能 | 追加ファイル案 | 根拠 |
|---|---|---|
| Web Push 通知送信ユーティリティ | `src/push/web-push.ts` | ブラウザ非依存のサーバーサイド Node.js コード。`normalizeVapidKey` は既存。`sendWebPushNotification` を追加 |
| `PushSubscription` 共通型 | `src/push/types.ts` | niconico・stock-tracker batch が独自定義している型を共通化 |
| `isValidPrice` / `isValidQuantity` の一般化 | `src/validation/helpers.ts`（既存ファイルに追加） | stock-tracker 固有の関数名は廃止し、汎用名（`isValidPositiveDecimal(value, min, max)` など）で `isValidNumber` のラッパーとして実装。stock-tracker 側からはエイリアスまたは直接 `isValidNumber` を呼び出す形に変更 |

**注意**: `@nagiyu/common` はブラウザ・Node.js 両環境で動作する必要がある。
`web-push` パッケージは Node.js 専用のため、`src/push/web-push.ts` は Node.js 専用サブエントリポイントとして分離する。
`package.json` の `exports` フィールドで条件付きエクスポートを設定し、ブラウザ環境からの誤ったインポートを防ぐ。

```json
"exports": {
    "./push/web-push": {
        "node": "./dist/push/web-push.js"
    }
}
```

これにより Web Push 機能（AWS 非依存）が `@nagiyu/aws` に混入することを防ぎ、単一責任原則を保つ。

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
| ServiceWorkerRegistration コンポーネント | `src/components/ServiceWorkerRegistration.tsx` | React コンポーネントとして `@nagiyu/browser` のロジックをラップ |
| EmptyState コンポーネント | `src/components/feedback/EmptyState.tsx` | MUI ベースの汎用 UI |
| LoadingState コンポーネント | `src/components/feedback/LoadingState.tsx` | MUI ベースの汎用 UI |
| ErrorAlert コンポーネント | `src/components/feedback/ErrorAlert.tsx` | MUI ベースの汎用 UI |
| ErrorBoundary コンポーネント | `src/components/ErrorBoundary.tsx` | React ErrorBoundary の共通実装 |

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
**代替**: `@nagiyu/aws` を直接使用。ただし `getUsersTableName()` は auth サービス固有のデフォルトテーブル名を持つため、
環境変数のデフォルト値をサービス側で明示的に管理する形に変更する必要がある。

**対応ファイル**:
- `services/auth/core/src/db/dynamodb-client.ts` ─ 削除候補（段階的対応推奨）
- `services/auth/core/src/db/repositories/dynamodb-user-repository.ts` ─ import 先を `@nagiyu/aws` に変更

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

**対応**: `@nagiyu/common/src/push/types.ts` に `PushSubscriptionKeys` を追加し、
`@nagiyu/nextjs` はそれを参照する形にする。
niconico batch は `@nagiyu/common` の型を使用することで統一できる。

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

- [ ] T001: `services/niconico-mylist-assistant/web/src/lib/utils/push.ts` を削除し、import 先を `@nagiyu/browser` に直接変更
    - 影響ファイル: `services/niconico-mylist-assistant/web/src/components/ServiceWorkerRegistration.tsx`
- [ ] T002: `services/share-together/web/src/lib/repositories.ts` を `core/repositories/factory.ts` の関数を直接使う形にリファクタリング
    - 影響ファイル: `services/share-together/web/src/app/api/*/route.ts` など
- [ ] T003: stock-tracker の `getAuthError` import を `@nagiyu/stock-tracker-core` から `@nagiyu/nextjs` に変更
    - 影響ファイル: `services/stock-tracker/web/app/api/push/subscribe/route.ts` など各 API ルート
    - 移行前後の動作検証として、認証・認可フローに関する統合テストを実施すること
- [ ] T004: `services/auth/core/src/db/dynamodb-client.ts` を段階的に廃止し、`@nagiyu/aws` の直接呼び出しに移行
    - auth サービスの中核機能への影響が大きいため、移行前後の E2E テスト（ユーザー CRUD 操作）を追加してから実施すること
    - `services/auth/core/src/db/repositories/dynamodb-user-repository.ts` の全操作が正常動作することを確認

### フェーズ 2: 共通コンポーネント化（`@nagiyu/ui`）

- [ ] T005: `ServiceWorkerRegistration` コンポーネントを `libs/ui/src/components/ServiceWorkerRegistration.tsx` に共通化
    - エンドポイント（subscribe/refresh）をプロパティで受け取る設計
    - `@nagiyu/browser` の `urlBase64ToUint8Array` を使用
    - 対象: niconico, share-together, stock-tracker の各 `ServiceWorkerRegistration.tsx`
- [ ] T006: `EmptyState` / `LoadingState` / `ErrorAlert` コンポーネントを `libs/ui` に移動
    - 対象: `services/stock-tracker/web/components/` 配下の各コンポーネント
- [ ] T007: `ErrorBoundary` コンポーネントを `libs/ui` に移動
    - 対象: `services/stock-tracker/web/components/ErrorBoundary.tsx`

### フェーズ 3: 共通ロジック化（`@nagiyu/common` / `@nagiyu/nextjs`）

- [ ] T008: `PushSubscription` 型を `@nagiyu/common/src/push/types.ts` に追加
    - 対象型: `services/niconico-mylist-assistant/batch/src/lib/web-push-client.ts` の `PushSubscription`
    - `@nagiyu/nextjs/src/push.ts` の `PushSubscriptionData` もこの型に統一
- [ ] T009: Web Push 通知送信の共通関数を `@nagiyu/common/src/push/web-push.ts` に切り出し
    - 関数: `sendWebPushNotification(endpoint, keys, payload, vapidConfig)`
    - 対象: `services/niconico-mylist-assistant/batch/src/lib/web-push-client.ts`・`services/stock-tracker/batch/src/lib/web-push-client.ts` の共通部分
- [ ] T010: `@nagiyu/nextjs` に `createPushSubscribeRoute(options)` を追加
    - 対象: `services/niconico-mylist-assistant/web/src/app/api/push/subscribe/route.ts`・`services/stock-tracker/web/app/api/push/subscribe/route.ts`

### フェーズ 4: ThemeRegistry 統一（`@nagiyu/ui`）

- [ ] T011: admin, auth, codec-converter, share-together の `ThemeRegistry.tsx` を単一の設定渡しパターンに統一
    - 各サービスの `ThemeRegistry` は title/ariaLabel のみ異なるため、`ServiceLayout` への props 渡しを layout.tsx から直接行う形に変更することで削除可能
- [ ] T012: `services/tools/src/components/ThemeRegistry.tsx` を `ServiceLayout` ベースに移行
    - tools のみ MUI 直接利用で他と乖離。`@nagiyu/ui` の `ServiceLayout` を使う形に統一

---

## 備考・未決定事項

1. **tools の ThemeRegistry**: tools は PWA 対応・サイトマップ生成など独自機能が多く、
   `ServiceLayout` 移行時に既存の `MigrationDialog` をどう扱うか要検討。

2. **stock-tracker の ThemeRegistry**: `SessionProvider` と `SnackbarProvider` を含む複雑な構成のため、
   フェーズ 4 の対象から外し、stock-tracker 固有のままにする方が現実的な可能性がある。

3. **web-push-client の切り出し方針**: `sendWebPushNotification` は AWS サービスに依存しない汎用機能のため、
   `@nagiyu/aws` への配置は不適切。`@nagiyu/common/push/web-push` の Node.js 専用サブエントリポイントとして分離する方針を採用する（セクション 2-A 参照）。
   `web-push` npm パッケージへの依存は common に入るが、Node.js 専用エクスポートとして明示的に分離することで
   ブラウザバンドルへの混入を防げる。

4. **`services/auth/core`**: `@nagiyu/auth-core` としてパッケージ化されているが、
   `dynamodb-client.ts` のラッパー削除は auth サービスのリグレッションリスクが高いため、慎重なテストが必要。

5. **niconico の `ServiceWorkerRegistration`**: Push 通知の登録後にサーバーへ送信する処理が
   stock-tracker と異なるエンドポイント（`/api/push/subscribe`）を使用しており、
   共通コンポーネント化の際はエンドポイントをプロパティで受け取る設計が必要。
