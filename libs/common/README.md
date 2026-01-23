# @nagiyu/common

Framework-agnostic common utility library for Nagiyu Platform.

完全フレームワーク非依存の汎用ユーティリティライブラリです。

## 概要

`@nagiyu/common` は、Nagiyu Platform における共通機能を提供するライブラリです。フレームワークやブラウザAPIに依存せず、どの環境でも利用できる汎用ユーティリティを提供します。

## 主な機能

### APIクライアント

- **リトライ機能付きAPIクライアント**: ネットワークエラーやサーバーエラーへの自動リトライ
- **エクスポネンシャルバックオフ**: リトライ時の遅延を指数関数的に増加
- **タイムアウト制御**: リクエストのタイムアウト設定
- **エラーハンドリング**: 統一的なエラー処理とユーザーフレンドリーなメッセージ変換
- **型安全性**: TypeScriptによる厳格な型チェック

### 認証・認可

- ロールベースアクセス制御（RBAC）
- パーミッション管理
- 認証ユーティリティ

## インストール

モノレポ内のパッケージから利用する場合：

```json
{
  "dependencies": {
    "@nagiyu/common": "workspace:*"
  }
}
```

```bash
npm install
```

## 基本的な使い方

### APIクライアント

#### シンプルなGETリクエスト

```typescript
import { get } from '@nagiyu/common';

interface User {
  id: number;
  name: string;
  email: string;
}

const user = await get<User>('/api/users/1');
console.log(user.name); // 型安全にアクセス
```

#### POSTリクエストでデータを作成

```typescript
import { post } from '@nagiyu/common';

interface CreateUserRequest {
  name: string;
  email: string;
}

interface User {
  id: number;
  name: string;
  email: string;
}

const newUser = await post<User>('/api/users', {
  name: 'John Doe',
  email: 'john@example.com',
});
```

#### カスタムリトライ設定

```typescript
import { apiRequest, type RetryConfig } from '@nagiyu/common';

const customRetryConfig: Partial<RetryConfig> = {
  maxRetries: 5,
  initialDelay: 2000,
  maxDelay: 30000,
  backoffMultiplier: 3,
};

const data = await apiRequest<DataType>('/api/data', {
  method: 'GET',
  retry: customRetryConfig,
});
```

#### エラーハンドリング

```typescript
import { get, APIError } from '@nagiyu/common';

try {
  const data = await get<DataType>('/api/data');
  console.log(data);
} catch (error) {
  if (error instanceof APIError) {
    console.error('ステータスコード:', error.status);
    console.error('エラーメッセージ:', error.message);
    console.error('エラータイプ:', error.errorInfo.type);
    console.error('リトライ可能:', error.errorInfo.shouldRetry);
  } else {
    console.error('予期しないエラー:', error);
  }
}
```

#### サービス固有のエラーメッセージ

```typescript
import { get } from '@nagiyu/common';

const SERVICE_ERROR_MESSAGES = {
  RESOURCE_NOT_FOUND: 'リソースが見つかりませんでした',
  INVALID_INPUT: '入力内容が正しくありません',
};

const data = await get<DataType>('/api/data', {}, SERVICE_ERROR_MESSAGES);
```

### HTTPメソッドラッパー

```typescript
import { get, post, put, del } from '@nagiyu/common';

// GET
const user = await get<User>('/api/users/1');

// POST
const newUser = await post<User>('/api/users', userData);

// PUT
const updatedUser = await put<User>('/api/users/1', userData);

// DELETE
await del('/api/users/1');
```

### 共通エラーメッセージ定数

```typescript
import { COMMON_ERROR_MESSAGES } from '@nagiyu/common';

console.log(COMMON_ERROR_MESSAGES.UNAUTHORIZED);
// "ログインが必要です。再度ログインしてください"

console.log(COMMON_ERROR_MESSAGES.NETWORK_ERROR);
// "ネットワーク接続を確認してください"

console.log(COMMON_ERROR_MESSAGES.SERVER_ERROR);
// "サーバーエラーが発生しました。しばらくしてから再度お試しください"
```

## API リファレンス

### `apiRequest<T>(url, options?, serviceMessages?)`

リトライ機能とエラーハンドリングを統合したAPIリクエスト関数。

**パラメータ:**

- `url: string` - リクエストURL
- `options?: APIRequestOptions` - リクエストオプション
  - `method?: string` - HTTPメソッド（GET, POST, PUT, DELETEなど）
  - `headers?: Record<string, string>` - カスタムヘッダー
  - `body?: BodyInit` - リクエストボディ
  - `retry?: Partial<RetryConfig>` - リトライ設定
  - `timeout?: number` - タイムアウト（ミリ秒、デフォルト: 30000）
- `serviceMessages?: Record<string, string>` - サービス固有のエラーメッセージマッピング

**戻り値:**

- `Promise<T>` - レスポンスデータ

**例外:**

- `APIError` - APIエラーが発生した場合

### `get<T>(url, options?, serviceMessages?)`

GETリクエストを実行するヘルパー関数。

### `post<T>(url, body, options?, serviceMessages?)`

POSTリクエストを実行するヘルパー関数。

### `put<T>(url, body, options?, serviceMessages?)`

PUTリクエストを実行するヘルパー関数。

### `del<T>(url, options?, serviceMessages?)`

DELETEリクエストを実行するヘルパー関数。

### `APIError`

APIエラーを表すクラス。

**プロパティ:**

- `status: number` - HTTPステータスコード
- `errorInfo: ErrorInfo` - エラー情報
  - `type: 'error' | 'warning' | 'info'` - エラータイプ
  - `message: string` - ユーザーフレンドリーなメッセージ
  - `details?: string[]` - 詳細情報
  - `shouldRetry?: boolean` - リトライ可能か
- `message: string` - エラーメッセージ

### `RetryConfig`

リトライ設定の型。

**プロパティ:**

- `maxRetries: number` - 最大リトライ回数（デフォルト: 3）
- `initialDelay: number` - 初回遅延時間（ミリ秒、デフォルト: 1000）
- `maxDelay: number` - 最大遅延時間（ミリ秒、デフォルト: 10000）
- `backoffMultiplier: number` - バックオフ増加率（デフォルト: 2）

### `COMMON_ERROR_MESSAGES`

共通エラーメッセージ定数。

- `UNAUTHORIZED` - 認証エラー
- `FORBIDDEN` - 権限エラー
- `NETWORK_ERROR` - ネットワークエラー
- `TIMEOUT_ERROR` - タイムアウトエラー
- `SERVER_ERROR` - サーバーエラー
- `INVALID_REQUEST` - 無効なリクエスト
- その他多数

## アーキテクチャ

### 3層エラー処理モデル

1.  **リトライ層**: 一時的なエラーに対する自動リトライ
2.  **変換層**: 技術的なエラーコードをユーザーフレンドリーなメッセージに変換
3.  **表示層**: エラーメッセージをUIに表示

### エクスポネンシャルバックオフ

リトライ時の遅延時間は以下の式で計算されます：

```
delay = min(initialDelay × backoffMultiplier^attempt, maxDelay) ± jitter
```

ジッター（遅延時間の±25%のランダム値）により、複数クライアントの同時リトライを分散します。

### リトライ可能性の判定

以下のエラーはリトライ可能と判定されます：

- ネットワークエラー（`status === 0`）
- タイムアウト（`status === 408`）
- サーバーエラー（`status >= 500`）
- Too Many Requests（`status === 429`）

## 設計原則

- **フレームワーク非依存**: ブラウザAPI、React、Next.jsなどに依存しない
- **純粋関数**: 副作用のない関数として実装
- **型安全性**: TypeScript strict modeで厳格な型チェック
- **テスト容易性**: 高いテストカバレッジを維持

## 開発

### ビルド

```bash
npm run build
```

### テスト

```bash
npm run test
```

### テストカバレッジ

```bash
npm run test:coverage
```

### リント

```bash
npm run lint
```

### フォーマット

```bash
npm run format
```

## 関連ドキュメント

- [APIクライアント使用ガイド](../../docs/development/api-client-guide.md)
- [APIクライアントマイグレーションガイド](../../docs/development/api-client-migration.md)
- [アーキテクチャ方針](../../docs/development/architecture.md)
- [共通ライブラリ設計](../../docs/development/shared-libraries.md)

## ライセンス

このプロジェクトは [MIT License](../../MIT_LICENSE) および [Apache License 2.0](../../Apache_LICENSE) のデュアルライセンスです。
