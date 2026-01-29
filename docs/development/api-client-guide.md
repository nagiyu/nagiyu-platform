# API クライアント利用ガイド

## 目的

本ドキュメントは、プラットフォームで提供する統一的なAPIクライアントの使い方と、エラーハンドリング戦略について説明する。

## 概要

本プラットフォームでは、以下の2つのパッケージでAPIリクエスト機能を提供している：

- **@nagiyu/common**: フレームワーク非依存のAPIクライアント（リトライ、タイムアウト、エラーハンドリング）
- **@nagiyu/react**: React専用のAPIリクエストフック（状態管理、依存注入パターン）

### アーキテクチャ概要

```
┌─────────────────────────────────────────┐
│   アプリケーション層                    │
│   (サービス固有のUI・ビジネスロジック)  │
└──────────────┬──────────────────────────┘
               │
               │ useAPIRequest() / apiRequest()
               │
┌──────────────▼──────────────────────────┐
│   @nagiyu/react                          │
│   - useAPIRequest Hook                   │
│   - 状態管理 (loading, error, data)     │
│   - 依存注入 (onSuccess, onError)       │
└──────────────┬──────────────────────────┘
               │
               │ apiRequest()
               │
┌──────────────▼──────────────────────────┐
│   @nagiyu/common                         │
│   - リトライ機能                        │
│   - タイムアウト制御                    │
│   - エラー変換                          │
│   - エクスポネンシャルバックオフ        │
└─────────────────────────────────────────┘
```

### パッケージの責務

| パッケージ       | 責務                                               | 依存関係 |
| ---------------- | -------------------------------------------------- | -------- |
| `@nagiyu/common` | APIリクエストのコア機能、エラーハンドリング       | なし     |
| `@nagiyu/react`  | React専用の状態管理、依存注入による柔軟性の提供 | React    |

## @nagiyu/common の使い方

フレームワークに依存しないAPIクライアントを提供する。

### 基本的な使い方

#### apiRequest()

最も基本的なAPIリクエスト関数。リトライ機能とエラーハンドリングを統合。

```typescript
import { apiRequest } from '@nagiyu/common';

// 型を明示的に指定（必須）
interface User {
    id: string;
    name: string;
}

async function fetchUser(userId: string): Promise<User> {
    const user = await apiRequest<User>(`/api/users/${userId}`);
    return user;
}
```

**重要**: `apiRequest()` を使用する場合、レスポンスの型を必ず明示的に指定すること。型指定がないとコンパイルエラーになる。

#### HTTPメソッド別ヘルパー関数

より便利なHTTPメソッド別の関数も提供している。

```typescript
import { get, post, put, del } from '@nagiyu/common';

// GETリクエスト
const user = await get<User>('/api/users/123');

// POSTリクエスト（第2引数にbody）
const newUser = await post<User>('/api/users', {
    name: 'Taro Yamada',
    email: 'taro@example.com',
});

// PUTリクエスト
const updatedUser = await put<User>('/api/users/123', {
    name: 'Updated Name',
});

// DELETEリクエスト
await del<void>('/api/users/123');
```

### リトライ設定のカスタマイズ

デフォルトのリトライ設定は以下の通り：

- **最大リトライ回数**: 3回
- **初期遅延**: 1000ms（1秒）
- **最大遅延**: 10000ms（10秒）
- **バックオフ乗数**: 2（エクスポネンシャルバックオフ）

リトライ設定は `retry` オプションでカスタマイズ可能。

```typescript
import { apiRequest } from '@nagiyu/common';

// カスタムリトライ設定
const user = await apiRequest<User>('/api/users/123', {
    retry: {
        maxRetries: 5, // リトライ回数を5回に増やす
        initialDelay: 500, // 初期遅延を500msに短縮
        maxDelay: 5000, // 最大遅延を5秒に短縮
        backoffMultiplier: 1.5, // バックオフ乗数を1.5に変更
    },
});
```

**リトライされる条件**:

- ネットワークエラー（fetch失敗）
- タイムアウト（AbortError）
- HTTPステータス 500番台（サーバーエラー）
- HTTPステータス 408（Request Timeout）
- HTTPステータス 429（Too Many Requests）

**リトライされない条件**:

- HTTPステータス 400番台（クライアントエラー、ただし408と429を除く）
- 401 Unauthorized
- 403 Forbidden
- 404 Not Found
- その他の4xx系エラー

### タイムアウト設定

デフォルトのタイムアウトは **30秒**。`timeout` オプションでカスタマイズ可能。

```typescript
import { apiRequest } from '@nagiyu/common';

// 10秒でタイムアウト
const user = await apiRequest<User>('/api/users/123', {
    timeout: 10000, // 10秒
});

// リトライとタイムアウトの併用
const user = await apiRequest<User>('/api/users/123', {
    timeout: 5000, // 5秒でタイムアウト
    retry: {
        maxRetries: 2, // 2回までリトライ
    },
});
```

タイムアウトが発生すると、リトライ可能なエラーとして扱われ、設定に応じてリトライされる。

### エラーハンドリング

#### APIError の構造

`apiRequest()` はエラー時に `APIError` をスローする。

```typescript
import { apiRequest, APIError } from '@nagiyu/common';

try {
    const user = await apiRequest<User>('/api/users/123');
} catch (error) {
    if (error instanceof APIError) {
        console.error('Status:', error.status); // HTTPステータスコード
        console.error('Message:', error.message); // ユーザーフレンドリーなメッセージ
        console.error('Type:', error.errorInfo.type); // 'error' | 'warning' | 'info'
        console.error('Details:', error.errorInfo.details); // 詳細情報（配列）
        console.error('Should Retry:', error.errorInfo.shouldRetry); // リトライ可能か
    }
}
```

#### エラーメッセージの多段階マッピング

エラーメッセージは以下の優先順位で決定される：

1.  **サービス固有メッセージ**: 各サービスが定義したエラーコードとメッセージのマッピング
2.  **共通メッセージ**: `@nagiyu/common` で定義された汎用エラーメッセージ
3.  **APIレスポンスのメッセージ**: サーバーから返却されたメッセージをそのまま使用

```typescript
import { COMMON_ERROR_MESSAGES } from '@nagiyu/common';

// 共通エラーメッセージの例
COMMON_ERROR_MESSAGES.UNAUTHORIZED; // 'ログインが必要です。再度ログインしてください'
COMMON_ERROR_MESSAGES.NETWORK_ERROR; // 'ネットワーク接続を確認してください'
COMMON_ERROR_MESSAGES.SERVER_ERROR; // 'サーバーエラーが発生しました。しばらくしてから再度お試しください'
```

#### サービス固有エラーメッセージの定義

サービス固有のエラーコードに対するメッセージは、各サービスで定義することを推奨する。

**例: Stock Trackerのエラーメッセージ**

```typescript
// services/stock-tracker/web/lib/error-messages.ts

/**
 * Stock Tracker固有のエラーメッセージ
 */
export const STOCK_TRACKER_ERROR_MESSAGES = {
    TICKER_NOT_FOUND: '指定されたティッカーシンボルが見つかりませんでした',
    MARKET_CLOSED: '市場が閉まっています。取引時間中に再度お試しください',
    INVALID_PRICE: '価格が不正です。正の数値を入力してください',
    PORTFOLIO_NOT_FOUND: 'ポートフォリオが見つかりませんでした',
} as const;
```

この定義を `mapAPIErrorToMessage()` に渡すことで、サービス固有のエラーメッセージを優先的に使用できる。

```typescript
import { mapAPIErrorToMessage } from '@nagiyu/common';
import { STOCK_TRACKER_ERROR_MESSAGES } from './error-messages';

// エラーレスポンスをユーザーフレンドリーなメッセージに変換
const errorResponse = {
    error: 'TICKER_NOT_FOUND',
    message: 'Ticker not found',
};

const message = mapAPIErrorToMessage(errorResponse, STOCK_TRACKER_ERROR_MESSAGES);
// => '指定されたティッカーシンボルが見つかりませんでした'
```

**NOTE**: サービス固有のエラーメッセージは、APIエンドポイントから返却されるエラーコードに対応する必要がある。

### カスタムヘッダーの追加

認証トークンなどのカスタムヘッダーを追加する場合：

```typescript
import { apiRequest } from '@nagiyu/common';

const user = await apiRequest<User>('/api/users/123', {
    headers: {
        Authorization: `Bearer ${token}`,
        'X-Custom-Header': 'custom-value',
    },
});
```

## @nagiyu/react の使い方

React専用のAPIリクエストフック。状態管理と依存注入パターンを提供。

### 基本的な使い方

#### useAPIRequest()

APIリクエストの状態を管理し、コールバックによる依存注入を実現するカスタムフック。

```typescript
import { useAPIRequest } from '@nagiyu/react';
import { useSnackbar } from '../components/SnackbarProvider';

interface User {
    id: string;
    name: string;
}

function UserProfile({ userId }: { userId: string }) {
    const { showSuccess, showError } = useSnackbar();

    const { data, loading, error, execute } = useAPIRequest<User>({
        onSuccess: (data) => {
            showSuccess(`ユーザー ${data.name} の情報を取得しました`);
        },
        onError: (error) => {
            showError(error.message);
        },
    });

    const handleFetch = async () => {
        await execute(`/api/users/${userId}`);
    };

    if (loading) return <p>読み込み中...</p>;
    if (error) return <p>エラー: {error.message}</p>;

    return (
        <div>
            <button onClick={handleFetch}>ユーザー情報を取得</button>
            {data && <p>名前: {data.name}</p>}
        </div>
    );
}
```

#### 戻り値の詳細

`useAPIRequest()` は以下のプロパティを持つオブジェクトを返す：

| プロパティ | 型                   | 説明                                                 |
| ---------- | -------------------- | ---------------------------------------------------- |
| `data`     | `T \| null`          | レスポンスデータ（成功時のみ）                       |
| `loading`  | `boolean`            | ローディング状態                                     |
| `error`    | `APIError \| null`   | エラー情報（失敗時のみ）                             |
| `execute`  | `(url, options) => Promise<T \| null>` | APIリクエストを実行する関数               |
| `reset`    | `() => void`         | 状態をリセットする関数                               |
| `retry`    | `() => Promise<T \| null>` | 最後のリクエストを再実行する関数                |

### トースト通知の統合方法

`useAPIRequest()` は、トースト通知の実装を依存注入パターンで受け取る。これにより、各サービスが独自のトースト実装を使用できる。

#### 依存注入パターンの利点

- **柔軟性**: サービスごとに異なるトースト実装を使用可能
- **疎結合**: `useAPIRequest()` がトースト実装の詳細を知る必要がない
- **テスト容易性**: モック化が容易

#### Material-UI の Snackbar を使用する例

```typescript
import { useAPIRequest } from '@nagiyu/react';
import { useSnackbar } from '../components/SnackbarProvider';

function MyComponent() {
    const { showSuccess, showError } = useSnackbar();

    const { data, loading, error, execute } = useAPIRequest<User>({
        onSuccess: (data) => showSuccess('データの取得に成功しました'),
        onError: (error) => showError(error.message),
    });

    // ...
}
```

#### カスタムトースト実装を使用する例

```typescript
import { useAPIRequest } from '@nagiyu/react';
import { toast } from 'react-toastify';

function MyComponent() {
    const { data, loading, error, execute } = useAPIRequest<User>({
        onSuccess: (data) => toast.success('データの取得に成功しました'),
        onError: (error) => toast.error(error.message),
    });

    // ...
}
```

### エラーハンドリングのベストプラクティス

#### 1. エラーメッセージの日本語化

エラーメッセージは日本語で定数化し、一元管理する。

```typescript
// サービス固有のエラーメッセージ定義
export const SERVICE_ERROR_MESSAGES = {
    INVALID_INPUT: '入力内容が不正です',
    DATA_NOT_FOUND: 'データが見つかりませんでした',
    OPERATION_FAILED: '操作に失敗しました',
} as const;

// 使用例
const { execute } = useAPIRequest<Data>({
    onError: (error) => {
        // APIErrorのメッセージはすでに日本語化されている
        showError(error.message);
    },
});
```

#### 2. エラー種別に応じた処理の分岐

`APIError` の `type` プロパティを使用して、エラーの重要度に応じた処理を行う。

```typescript
import { useAPIRequest } from '@nagiyu/react';
import type { APIError } from '@nagiyu/common';

const { execute } = useAPIRequest<Data>({
    onError: (error: APIError) => {
        switch (error.errorInfo.type) {
            case 'error':
                // 致命的エラー（サーバーエラー、ネットワークエラー等）
                showError(error.message);
                break;
            case 'warning':
                // 警告レベル（バリデーションエラー、4xx系）
                showWarning(error.message);
                break;
            case 'info':
                // 情報レベル
                showInfo(error.message);
                break;
        }
    },
});
```

#### 3. リトライ可能性の確認

エラーがリトライ可能かどうかを確認し、ユーザーに再試行ボタンを表示する。

```typescript
import { useAPIRequest } from '@nagiyu/react';

function MyComponent() {
    const { data, loading, error, execute, retry } = useAPIRequest<Data>();

    const handleFetch = async () => {
        await execute('/api/data');
    };

    if (error) {
        return (
            <div>
                <p>エラー: {error.message}</p>
                {error.errorInfo.shouldRetry && (
                    <button onClick={retry}>再試行</button>
                )}
            </div>
        );
    }

    // ...
}
```

#### 4. ローディング状態の適切な表示

ローディング中は、ユーザーに待機状態を明示的に伝える。

```typescript
import { useAPIRequest } from '@nagiyu/react';
import CircularProgress from '@mui/material/CircularProgress';

function MyComponent() {
    const { data, loading, execute } = useAPIRequest<Data>();

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                <CircularProgress />
            </div>
        );
    }

    // ...
}
```

#### 5. 状態のリセット

コンポーネントのクリーンアップ時やフォームのリセット時に、状態をリセットする。

```typescript
import { useAPIRequest } from '@nagiyu/react';
import { useEffect } from 'react';

function MyComponent() {
    const { data, loading, error, execute, reset } = useAPIRequest<Data>();

    const handleSubmit = async (formData: FormData) => {
        // 前回の状態をクリア
        reset();
        await execute('/api/data', {
            method: 'POST',
            body: JSON.stringify(formData),
        });
    };

    // コンポーネントのアンマウント時にクリーンアップ
    useEffect(() => {
        return () => {
            reset();
        };
    }, [reset]);

    // ...
}
```

**注意**: `reset()` を実行すると、最後のリクエスト情報もクリアされるため、その後 `retry()` を呼び出しても何も実行されない。

### カスタムAPIリクエストオプション

`execute()` の第2引数に、`@nagiyu/common` の `apiRequest()` と同じオプションを渡すことができる。

```typescript
import { useAPIRequest } from '@nagiyu/react';

function MyComponent() {
    const { execute } = useAPIRequest<Data>();

    const handleFetch = async () => {
        await execute('/api/data', {
            // カスタムヘッダー
            headers: {
                Authorization: `Bearer ${token}`,
            },
            // リトライ設定
            retry: {
                maxRetries: 5,
                initialDelay: 500,
            },
            // タイムアウト設定
            timeout: 10000,
        });
    };

    // ...
}
```

## 実装例

### 完全な実装例: ユーザー管理画面

```typescript
import { useAPIRequest } from '@nagiyu/react';
import { useSnackbar } from '../components/SnackbarProvider';
import { useState } from 'react';

interface User {
    id: string;
    name: string;
    email: string;
}

function UserManagementPage() {
    const { showSuccess, showError } = useSnackbar();
    const [userId, setUserId] = useState('');

    // ユーザー取得
    const { data: user, loading: fetchLoading, error: fetchError, execute: fetchUser, retry } = useAPIRequest<User>({
        onSuccess: (data) => showSuccess(`ユーザー ${data.name} を取得しました`),
        onError: (error) => showError(error.message),
    });

    // ユーザー削除
    const { loading: deleteLoading, execute: deleteUser } = useAPIRequest<void>({
        onSuccess: () => {
            showSuccess('ユーザーを削除しました');
            setUserId('');
        },
        onError: (error) => showError(error.message),
    });

    const handleFetch = async () => {
        await fetchUser(`/api/users/${userId}`);
    };

    const handleDelete = async () => {
        if (confirm('本当に削除しますか？')) {
            await deleteUser(`/api/users/${userId}`, {
                method: 'DELETE',
            });
        }
    };

    return (
        <div>
            <h1>ユーザー管理</h1>

            {/* 検索フォーム */}
            <div>
                <input
                    type="text"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    placeholder="ユーザーID"
                />
                <button onClick={handleFetch} disabled={fetchLoading || !userId}>
                    {fetchLoading ? '検索中...' : '検索'}
                </button>
            </div>

            {/* エラー表示 */}
            {fetchError && (
                <div style={{ color: 'red', marginTop: '1rem' }}>
                    <p>エラー: {fetchError.message}</p>
                    {fetchError.errorInfo.shouldRetry && (
                        <button onClick={retry}>再試行</button>
                    )}
                </div>
            )}

            {/* ユーザー情報表示 */}
            {user && (
                <div style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ccc' }}>
                    <h2>ユーザー情報</h2>
                    <p>ID: {user.id}</p>
                    <p>名前: {user.name}</p>
                    <p>メール: {user.email}</p>
                    <button onClick={handleDelete} disabled={deleteLoading}>
                        {deleteLoading ? '削除中...' : '削除'}
                    </button>
                </div>
            )}
        </div>
    );
}
```

## まとめ

- **@nagiyu/common**: フレームワーク非依存のAPIクライアント。リトライ、タイムアウト、エラーハンドリングを統合
- **@nagiyu/react**: React専用のフック。状態管理と依存注入パターンを提供
- **型安全性**: レスポンスの型を明示的に指定することで、コンパイル時の安全性を確保
- **エラーハンドリング**: 多段階メッセージマッピングにより、サービス固有のエラーメッセージを柔軟に定義可能
- **依存注入**: トースト通知の実装を外部から注入することで、柔軟性とテスト容易性を実現

## 参考

- [architecture.md](./architecture.md): アーキテクチャ方針とエラーハンドリング戦略
- [shared-libraries.md](./shared-libraries.md): 共通ライブラリ設計と依存関係
- [rules.md](./rules.md): コーディング規約
