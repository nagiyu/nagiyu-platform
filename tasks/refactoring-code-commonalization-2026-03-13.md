# コード共通化調査 (2026-03-13)

## 概要

日次リファクタリングとして、全サービス・ライブラリを対象にコード重複を調査し、
共通化の方針と具体的な実装計画を策定する。

## 関連情報

- タスクタイプ: プラットフォームタスク（コード共通化調査）
- 調査日: 2026-03-13
- 依存関係ルール: `ui → browser → common`（循環禁止）

## 調査対象

| 対象 | パス |
|------|------|
| services/admin | `services/admin/web/` |
| services/auth | `services/auth/core/`, `services/auth/web/` |
| services/codec-converter | `services/codec-converter/batch/`, `services/codec-converter/core/`, `services/codec-converter/web/` |
| services/niconico-mylist-assistant | `services/niconico-mylist-assistant/batch/`, `services/niconico-mylist-assistant/core/`, `services/niconico-mylist-assistant/web/` |
| services/share-together | `services/share-together/core/`, `services/share-together/web/` |
| services/stock-tracker | `services/stock-tracker/batch/`, `services/stock-tracker/core/`, `services/stock-tracker/web/` |
| services/tools | `services/tools/` |
| libs/aws | `libs/aws/` |
| libs/browser | `libs/browser/` |
| libs/common | `libs/common/` |
| libs/nextjs | `libs/nextjs/` |
| libs/react | `libs/react/` |
| libs/ui | `libs/ui/` |

---

## 調査結果

### 1. 重複実装の候補

#### 1-1. VAPID公開鍵取得APIルートの完全重複

**重複度**: ほぼ完全一致（コードレベルで同一）

| サービス | ファイルパス |
|---------|------------|
| stock-tracker | `services/stock-tracker/web/app/api/push/vapid-public-key/route.ts` |
| niconico-mylist-assistant | `services/niconico-mylist-assistant/web/src/app/api/push/vapid-public-key/route.ts` |

**重複内容**: `GET /api/push/vapid-public-key` の実装。環境変数 `VAPID_PUBLIC_KEY` を読み取り JSON で返す処理が一字一句同一。エラーメッセージ定数も重複している。

---

#### 1-2. Pushサブスクリプション登録APIルートの大部分重複

**重複度**: 高（ロジックの大部分が同一）

| サービス | ファイルパス |
|---------|------------|
| stock-tracker | `services/stock-tracker/web/app/api/push/subscribe/route.ts` |
| niconico-mylist-assistant | `services/niconico-mylist-assistant/web/src/app/api/push/subscribe/route.ts` |

**重複内容**:
- `validateSubscription()` 関数（URL検証含む全体がほぼ同一）
- `SubscribeRequest` / `SubscribeResponse` / `ErrorResponse` 型定義
- subscriptionID生成ロジック（SHA-256ハッシュによる32文字生成）
- エラーメッセージ定数（INVALID_REQUEST_BODY, MISSING_SUBSCRIPTION 等）
- リクエストボディのパース処理

**差異**: stock-tracker は認証チェック（`getAuthError`）が追加されている。

---

#### 1-3. `normalizeVapidKey` 関数の完全重複

**重複度**: 完全一致（実装内容が同一）

| サービス | ファイルパス |
|---------|------------|
| stock-tracker | `services/stock-tracker/batch/src/lib/web-push-client.ts` |
| niconico-mylist-assistant | `services/niconico-mylist-assistant/batch/src/lib/web-push-client.ts` |

**重複内容**: `normalizeVapidKey(rawKey, keyName)` 関数。引用符除去・JSON解析による VAPID キー正規化ロジックが同一。

**差異**: stock-tracker 版は `logger.warn()` を使用、niconico 版は `console.warn()` を使用。

---

#### 1-4. ServiceWorkerRegistration コンポーネントの類似重複

**重複度**: 中（コア処理が類似）

| サービス | ファイルパス |
|---------|------------|
| stock-tracker | `services/stock-tracker/web/components/ServiceWorkerRegistration.tsx` |
| niconico-mylist-assistant | `services/niconico-mylist-assistant/web/src/components/ServiceWorkerRegistration.tsx` |
| share-together | `services/share-together/web/src/components/ServiceWorkerRegistration.tsx` |

**重複内容**:
- Service Worker 登録処理（`navigator.serviceWorker.register('/sw.js')`）
- VAPID 公開鍵取得→Push サブスクリプション作成の流れ（stock-tracker, niconico）
- `urlBase64ToUint8Array` 利用パターン

**差異**:
- stock-tracker は `/api/push/refresh` を呼び出してサブスクリプション更新
- niconico は `/api/push/subscribe` を呼び出して登録
- share-together は SW 登録のみ（Push処理なし）

---

#### 1-5. ThemeRegistry コンポーネントの構造重複

**重複度**: 中（同一パターン・微細な差異あり）

| サービス | ファイルパス |
|---------|------------|
| admin | `services/admin/web/src/components/ThemeRegistry.tsx` |
| auth | `services/auth/web/src/components/ThemeRegistry.tsx` |
| codec-converter | `services/codec-converter/web/src/components/ThemeRegistry.tsx` |

**重複内容**: いずれも `AppLayout + Box(flex column) + Header(title=X) + main(flexGrow) + Footer(version)` の同一構造。

**差異**: `Header` の `title` と `ariaLabel` のみ異なる。

---

#### 1-6. `getAwsClients()` パターンの重複

**重複度**: 中（パターンが類似）

| サービス | ファイルパス |
|---------|------------|
| codec-converter | `services/codec-converter/web/src/lib/aws-clients.ts` |
| share-together | `services/share-together/web/src/lib/aws-clients.ts` |
| niconico-mylist-assistant | `services/niconico-mylist-assistant/web/src/lib/aws-clients.ts` |
| stock-tracker (batch) | `services/stock-tracker/batch/src/lib/aws-clients.ts` |

**重複内容**: `getAwsClients()` ファクトリー関数と `clearAwsClientsCache()` パターン。いずれも `@nagiyu/aws` の関数を呼び出すラッパーとして機能しているが、返却するクライアントの種類が異なる。

---

#### 1-7. stock-tracker 独自 DynamoDB クライアント実装（`@nagiyu/aws` 未使用）

**重複度**: 独自実装が共通ライブラリと機能重複

| ファイルパス | 状態 |
|------------|------|
| `services/stock-tracker/web/lib/dynamodb.ts` | 独自実装（未移行） |
| `libs/aws/src/dynamodb/client.ts` | 共通ライブラリ |

**重複内容**: `getDynamoDBClient()` / `getTableName()` を独自実装しているが、`@nagiyu/aws` の `getDynamoDBDocumentClient()` / `getTableName()` で代替可能。

---

#### 1-8. `auth.ts` ファイルの構造重複

**重複度**: 中（構造パターンが同一）

| サービス | ファイルパス |
|---------|------------|
| stock-tracker | `services/stock-tracker/web/auth.ts` |
| share-together | `services/share-together/web/auth.ts` |
| admin | `services/admin/web/src/auth.ts` |
| niconico-mylist-assistant | `services/niconico-mylist-assistant/web/src/auth.ts` |

**重複内容**: `providers: [], trustHost: true, ...createAuthConfig(...)` パターンと `NextAuth` 呼び出し構造がすべて同一。

**差異**: `share-together` と `niconico-mylist-assistant` は `{ includeSubAsUserIdFallback: true }` オプションを使用。

---

#### 1-9. `getSession()` の session.ts パターン重複

**重複度**: 中（`createSessionGetter` 呼び出しパターンが重複）

| サービス | ファイルパス |
|---------|------------|
| admin | `services/admin/web/src/lib/auth/session.ts` |
| auth | `services/auth/web/src/lib/auth/session.ts` |
| share-together | `services/share-together/web/src/lib/auth/session.ts` |
| niconico-mylist-assistant | `services/niconico-mylist-assistant/web/src/lib/auth/session.ts` |
| stock-tracker | `services/stock-tracker/web/lib/auth.ts` |

**重複内容**: `createSessionGetter` を呼び出す全体構造が重複。特に `mapSession` でのフィールドマッピングロジック（`session.user.id → userId` 等）が各サービスで独自定義されている。

---

#### 1-10. `stock-tracker/core/src/services/auth.ts` と `libs/nextjs/src/auth.ts` の機能重複

**重複度**: 高（同一機能の二重実装）

| ファイルパス | エクスポート |
|------------|------------|
| `services/stock-tracker/core/src/services/auth.ts` | `getAuthError()`, `checkPermission()` |
| `libs/nextjs/src/auth.ts` | `getAuthError()`, `withAuth()`, `getSessionOrThrow()` |

**重複内容**: `getAuthError(session, permission)` が `@nagiyu/stock-tracker-core` と `@nagiyu/nextjs` の両方に存在する。stock-tracker の API ルートは `@nagiyu/stock-tracker-core` のものを使用しているが、`@nagiyu/nextjs` にも同等機能がある。

---

### 2. 共通ライブラリへの切り出し可否判断

#### 2-1. `@nagiyu/nextjs` への追加候補

| 候補 | 追加元 | 理由 |
|------|--------|------|
| `createVapidPublicKeyRoute()` | 1-1 の VAPID 公開鍵ルート | `createHealthRoute` と同様のパターン。依存関係に問題なし |
| Push サブスクリプション検証ユーティリティ | 1-2 の subscribe ルート | `validatePushSubscription()`・`createSubscriptionId()` として切り出し可能 |

**依存関係確認**: `@nagiyu/nextjs` は `next`, `next-auth` に依存しており、Web Push 関連の処理追加は可能。`createVapidPublicKeyRoute()` の実装は環境変数の読み取りと `NextResponse.json()` のみで完結するため、`web-push` ライブラリへの依存追加は不要。

#### 2-2. `@nagiyu/common` への追加候補

| 候補 | 追加元 | 理由 |
|------|--------|------|
| `normalizeVapidKey()` | 1-3 の VAPID キー正規化 | ブラウザ依存なし、純粋なユーティリティ関数 |

**依存関係確認**: `@nagiyu/common` は最も依存の少ないライブラリ。`normalizeVapidKey` は `node:crypto` 不使用の純粋な文字列操作なので追加可能。

#### 2-3. `@nagiyu/ui` への追加候補

| 候補 | 追加元 | 理由 |
|------|--------|------|
| `ServiceLayout` コンポーネント | 1-5 の ThemeRegistry パターン | `AppLayout + Header + Footer` の共通ラッパー |
| `useServiceWorkerRegistration()` フック | 1-4 の SW 登録処理 | 基本的なSW登録・更新ロジックを抽象化 |

**依存関係確認**: `@nagiyu/ui` は React/MUI に依存しており、`@nagiyu/browser` を参照可能（`ui → browser` のルール内）。

#### 2-4. 切り出し不可 / 現状維持が妥当なもの

| 対象 | 理由 |
|------|------|
| `auth.ts` ファイル（1-8） | NextAuth の設定はサービス固有設定が必要なため完全共通化は困難 |
| `session.ts` の `createTestSession`（1-9） | テスト環境のユーザー情報はサービス固有 |
| `getAwsClients()`（1-6） | 返却クライアントが異なる、`@nagiyu/aws` を直接使えば十分 |

---

### 3. 既存ライブラリで代替可能な独自実装

#### 3-1. stock-tracker 独自 DynamoDB クライアント → `@nagiyu/aws` へ移行

- **対象**: `services/stock-tracker/web/lib/dynamodb.ts`
- **代替**: `@nagiyu/aws` の `getDynamoDBDocumentClient()` / `getTableName()`
- **影響範囲**: `services/stock-tracker/web/lib/repository-factory.ts` が `dynamodb.ts` を参照しているため、あわせて修正が必要
- **移行工数**: 低（単純な置き換え）

#### 3-2. stock-tracker-core の `getAuthError` → `@nagiyu/nextjs` の `getAuthError` へ移行

- **対象**: `services/stock-tracker/core/src/services/auth.ts` の `getAuthError`
- **代替**: `@nagiyu/nextjs` の `getAuthError()`
- **影響範囲**: `services/stock-tracker/web/app/api/` 配下の全ルートファイル（`getAuthError` 参照箇所）
- **注意点**: stock-tracker-core の `getAuthError` は `Session` 型（`@nagiyu/common`）を前提とし、`@nagiyu/nextjs` の `getAuthError` は `SessionWithRoles` を前提とするため、型互換性の確認が必要
- **移行工数**: 中（型確認と import 変更が必要）

---

### 4. 型定義の重複

#### 4-1. `COMMON_ERROR_MESSAGES` の二重定義（libs/common 内部）

**重複箇所**:
- `libs/common/src/constants/error-messages.ts` （5項目: UNAUTHORIZED, FORBIDDEN, NOT_FOUND, VALIDATION_ERROR, INTERNAL_SERVER_ERROR）
- `libs/common/src/api/types.ts` （14項目: より広範なメッセージセット）

**問題**: `@nagiyu/common` から `COMMON_ERROR_MESSAGES` をインポートすると、`index.ts` の export 順序により `constants/error-messages.ts` 側（5項目版）が使われる。`api/types.ts` 側（14項目版）は `api/index.ts` 経由でもエクスポートされているが、名前衝突が生じている。

**影響**: `share-together`, `stock-tracker`, `niconico-mylist-assistant` が `COMMON_ERROR_MESSAGES` をスプレッドして独自 `ERROR_MESSAGES` を定義している。どちらの版を使用しているかによって含まれるキーが異なる。

**解決方針**: 2つの `COMMON_ERROR_MESSAGES` を統合し、`constants/error-messages.ts` の1つに集約する。

#### 4-2. `next-auth.d.ts` の重複型宣言（影響軽微）

**重複箇所**:
- `services/auth/core/src/types/next-auth.d.ts`
- `services/stock-tracker/web/types/next-auth.d.ts`
- `services/admin/web/src/types/next-auth.d.ts`
- `services/niconico-mylist-assistant/web/src/types/next-auth.d.ts`

**内容**: すべて `import '@nagiyu/nextjs/types/next-auth';` 1行のみ。サービスごとに TypeScript の型拡張ファイルが必要なため、これは適切な実装。現状維持が妥当。

---

## 実装のヒント

### 優先度の考え方

優先度は「重複度 × 共通化の容易さ × 影響範囲」で判断する。

| 優先度 | 対象 | 理由 |
|--------|------|------|
| 高 | VAPID公開鍵ルートの共通化（1-1） | 完全重複、共通化が容易 |
| 高 | `normalizeVapidKey` の `@nagiyu/common` 追加（1-3） | 完全重複、純粋関数で追加容易 |
| 高 | `COMMON_ERROR_MESSAGES` の統合（4-1） | libs/common 内部の問題で影響範囲が広い |
| 中 | stock-tracker 独自 DynamoDB クライアントの削除（3-1） | `@nagiyu/aws` への単純移行 |
| 中 | Push サブスクリプション検証の共通化（1-2） | 重複度高、nextjs ライブラリへの追加 |
| 中 | ThemeRegistry パターンの `ServiceLayout` 化（1-5） | admin/auth/codec-converter の3サービスに適用 |
| 低 | `getAuthError` の統合（3-2、1-10） | 型確認が必要、リスクあり |
| 低 | ServiceWorkerRegistration フック化（1-4） | サービス間の差異が大きく完全共通化は難しい |

### 依存関係ルール遵守の確認

```
ui → browser → common
nextjs → common（ok）
nextjs → browser（ok）
aws → common（確認が必要）
```

- `normalizeVapidKey` を `@nagiyu/common` に追加: ✅ ブラウザ依存なし、純粋文字列操作、ルール維持
- VAPID ルートヘルパーを `@nagiyu/nextjs` に追加: ✅ `next` に依存、ルール維持（`web-push` ライブラリへの依存は不要: 公開鍵の取得は環境変数の読み取りのみ）
- `ServiceLayout` を `@nagiyu/ui` に追加: ✅ `@nagiyu/browser` 参照可（`ui → browser` ルール内）
- `useServiceWorkerRegistration` を `@nagiyu/ui` に追加: ✅ `@nagiyu/browser` の `urlBase64ToUint8Array` を利用可能（`ui → browser` ルール内）
- Push 検証ユーティリティを `@nagiyu/nextjs` に追加: ✅ `crypto` モジュール使用のみ（Node.js 組み込み）、`web-push` 依存不要

---

## タスク

### フェーズ 1: libs/common 内部の整理

- [ ] T001: `libs/common/src/api/types.ts` の `COMMON_ERROR_MESSAGES` を `libs/common/src/constants/error-messages.ts` に統合する
    - 5項目版と14項目版のキーを統合し、1つの定数にまとめる
    - `api/types.ts` から `COMMON_ERROR_MESSAGES` を削除し、`constants/error-messages.ts` からインポートするよう修正
    - `libs/common/src/api/error-handler.ts` の import を修正
    - テストの更新・追加
    - **影響ファイル**: `libs/common/src/api/types.ts`, `libs/common/src/api/error-handler.ts`, `libs/common/src/api/index.ts`, `libs/common/src/index.ts`

### フェーズ 2: 軽微な共通化（低リスク）

- [ ] T002: `normalizeVapidKey` 関数を `libs/common` に追加する
    - `libs/common/src/push/` ディレクトリを作成し `vapid.ts` を追加
    - `libs/common/src/index.ts` からエクスポート
    - テストを追加（`libs/common/tests/unit/push/vapid.test.ts`）
    - stock-tracker バッチ・niconico バッチの `web-push-client.ts` から独自実装を削除し `@nagiyu/common` からインポートするよう修正
    - **影響ファイル**: `services/stock-tracker/batch/src/lib/web-push-client.ts`, `services/niconico-mylist-assistant/batch/src/lib/web-push-client.ts`

- [ ] T003: VAPID公開鍵ルートヘルパーを `libs/nextjs` に追加する
    - `libs/nextjs/src/push.ts` に `createVapidPublicKeyRoute()` を追加
    - `libs/nextjs/src/index.ts` からエクスポート
    - テストを追加（`libs/nextjs/tests/unit/push.test.ts`）
    - stock-tracker・niconico の `vapid-public-key/route.ts` を置き換え
    - **影響ファイル**: `services/stock-tracker/web/app/api/push/vapid-public-key/route.ts`, `services/niconico-mylist-assistant/web/src/app/api/push/vapid-public-key/route.ts`

### フェーズ 3: DynamoDB クライアントの統一

- [ ] T004: `stock-tracker/web/lib/dynamodb.ts` を `@nagiyu/aws` で置き換える
    - `services/stock-tracker/web/lib/dynamodb.ts` を削除
    - `services/stock-tracker/web/lib/repository-factory.ts` の import を `@nagiyu/aws` に変更
    - テスト（もしあれば）の更新
    - **影響ファイル**: `services/stock-tracker/web/lib/dynamodb.ts`, `services/stock-tracker/web/lib/repository-factory.ts`

### フェーズ 4: Pushサブスクリプション検証の共通化

- [ ] T005: Push サブスクリプション検証ユーティリティを `libs/nextjs` に追加する
    - `libs/nextjs/src/push.ts` に `validatePushSubscription()` および `createSubscriptionId()` を追加
    - stock-tracker・niconico の subscribe ルートから独自実装を削除し `@nagiyu/nextjs` からインポート
    - テストを追加
    - **影響ファイル**: `services/stock-tracker/web/app/api/push/subscribe/route.ts`, `services/niconico-mylist-assistant/web/src/app/api/push/subscribe/route.ts`

### フェーズ 5: ThemeRegistry の整理（任意）

- [ ] T006: `ServiceLayout` コンポーネントを `libs/ui` に追加することを検討する
    - `libs/ui/src/components/layout/ServiceLayout.tsx` を新規作成
    - admin, auth, codec-converter の ThemeRegistry を `ServiceLayout` を使う形式に統一
    - `title` と `ariaLabel` を props として受け取る設計
    - **影響ファイル**: `services/admin/web/src/components/ThemeRegistry.tsx`, `services/auth/web/src/components/ThemeRegistry.tsx`, `services/codec-converter/web/src/components/ThemeRegistry.tsx`

---

## 参考ドキュメント

- `docs/development/rules.md` - コーディング規約
- `docs/development/architecture.md` - アーキテクチャ方針
- `libs/nextjs/src/health.ts` - `createHealthRoute` の実装例（VAPID ルート追加の参考）
- `libs/common/src/constants/error-messages.ts` - 現在の `COMMON_ERROR_MESSAGES`（5項目版）
- `libs/common/src/api/types.ts` - 現在の `COMMON_ERROR_MESSAGES`（14項目版・統合対象）

---

## 備考・未決定事項

1. **`getAuthError` の統合（1-10, 3-2）**: stock-tracker-core の `getAuthError` を削除して `@nagiyu/nextjs` のものに統一する方針は妥当だが、stock-tracker-core が `Session` 型前提・nextjs が `SessionWithRoles` 前提という型の差異について確認が必要。実装時に型互換性を検証してから移行する。

2. **ServiceWorkerRegistration の共通フック化（1-4）**: 3サービスで用途が異なる（refreshあり・なし・pushなし）ため、完全な共通化は難しい。`useBasicServiceWorker()` のような基本登録のみ共通化し、Push処理はサービス側に残す方針が現実的か要検討。

3. **`auth.ts` ファイルの完全共通化（1-8）**: `createConsumerAuthConfig()` のようなラッパーを `libs/nextjs` に追加することも選択肢だが、各サービスが `pages.signIn` URLを個別設定する必要があり恩恵が限定的。現状維持でもよい。

4. **共通化後の `web-push-client.ts`**: T002・T005 実施後、2つのバッチ版 `web-push-client.ts` は `normalizeVapidKey` 以外の部分（通知送信・ペイロード生成）はサービス固有ロジックが多いため、残存してよい。
