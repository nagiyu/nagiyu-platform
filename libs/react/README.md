# @nagiyu/react

React-specific utilities and hooks for Nagiyu Platform.

React統合のためのユーティリティとフックを提供するライブラリです。

## 概要

`@nagiyu/react` は、Nagiyu Platform における React 固有の機能を提供するライブラリです。`@nagiyu/common` のAPIクライアント機能をReactに統合し、状態管理やコールバック機能を提供します。

## 主な機能

### useAPIRequest フック

- **状態管理**: APIリクエストの状態（data, loading, error）を自動管理
- **コールバック機能**: 成功時・エラー時のコールバック設定
- **リトライ機能**: 最後のリクエストを再実行
- **リセット機能**: 状態をクリア
- **型安全性**: TypeScriptによる厳格な型チェック

## インストール

モノレポ内のパッケージから利用する場合：

```json
{
  "dependencies": {
    "@nagiyu/react": "workspace:*",
    "@nagiyu/common": "workspace:*"
  }
}
```

```bash
npm install
```

## 基本的な使い方

### シンプルなデータ取得

```typescript
'use client';

import { useAPIRequest } from '@nagiyu/react';
import { useEffect } from 'react';

interface User {
    id: number;
    name: string;
    email: string;
}

function UserProfile({ userId }: { userId: number }) {
    const { data, loading, error, execute } = useAPIRequest<User>();

    useEffect(() => {
        execute(`/api/users/${userId}`);
    }, [userId]);

    if (loading) return <div>読み込み中...</div>;
    if (error) return <div>エラー: {error.message}</div>;
    if (!data) return null;

    return (
        <div>
            <h2>{data.name}</h2>
            <p>{data.email}</p>
        </div>
    );
}
```

### トースト通知との統合

```typescript
'use client';

import { useAPIRequest } from '@nagiyu/react';
import { useToast } from '@/hooks/useToast';

function CreateUserForm() {
    const toast = useToast();
    const { loading, execute } = useAPIRequest<User>({
        onSuccess: (user) => {
            toast.success(`ユーザー「${user.name}」を作成しました`);
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);

        await execute('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: formData.get('name'),
                email: formData.get('email'),
            }),
        });
    };

    return (
        <form onSubmit={handleSubmit}>
            <input name="name" placeholder="名前" required />
            <input name="email" type="email" placeholder="メール" required />
            <button type="submit" disabled={loading}>
                {loading ? '作成中...' : '作成'}
            </button>
        </form>
    );
}
```

### リトライ機能

```typescript
'use client';

import { useAPIRequest } from '@nagiyu/react';
import { useEffect } from 'react';

function DataList() {
    const { data, loading, error, execute, retry } = useAPIRequest<DataType[]>();

    useEffect(() => {
        execute('/api/data');
    }, []);

    if (loading) return <div>読み込み中...</div>;

    if (error) {
        return (
            <div>
                <p>エラー: {error.message}</p>
                <button onClick={retry}>再試行</button>
            </div>
        );
    }

    if (!data) return null;

    return (
        <ul>
            {data.map((item) => (
                <li key={item.id}>{item.name}</li>
            ))}
        </ul>
    );
}
```

### 状態のリセット

```typescript
'use client';

import { useAPIRequest } from '@nagiyu/react';

function SearchComponent() {
    const { data, loading, error, execute, reset } = useAPIRequest<SearchResult>();

    const handleSearch = async (query: string) => {
        await execute(`/api/search?q=${encodeURIComponent(query)}`);
    };

    const handleClear = () => {
        reset(); // data, error, loading をすべて初期化
    };

    return (
        <div>
            <input
                type="text"
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="検索..."
            />
            <button onClick={handleClear}>クリア</button>
            {loading && <div>検索中...</div>}
            {error && <div>エラー: {error.message}</div>}
            {data && <SearchResults results={data} />}
        </div>
    );
}
```

### HTTPメソッドの指定

```typescript
'use client';

import { useAPIRequest } from '@nagiyu/react';

function UserEditor() {
  const { data, loading, execute } = useAPIRequest<User>();

  const loadUser = (userId: number) => {
    execute(`/api/users/${userId}`, {
      method: 'GET',
    });
  };

  const createUser = (userData: Partial<User>) => {
    execute('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
  };

  const updateUser = (userId: number, userData: Partial<User>) => {
    execute(`/api/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
  };

  const deleteUser = (userId: number) => {
    execute(`/api/users/${userId}`, {
      method: 'DELETE',
    });
  };

  // ...
}
```

### 認証トークンを使った保護されたAPI呼び出し

```typescript
'use client';

import { useAPIRequest } from '@nagiyu/react';
import { useAuth } from '@/hooks/useAuth';
import { useEffect } from 'react';

interface UserProfile {
    id: string;
    name: string;
    email: string;
}

function ProfilePage() {
    const { token } = useAuth();
    const { data, loading, error, execute } = useAPIRequest<UserProfile>();

    useEffect(() => {
        if (token) {
            execute('/api/user/profile', {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
        }
    }, [token]);

    if (loading) return <div>読み込み中...</div>;
    if (error) return <div>エラー: {error.message}</div>;
    if (!data) return null;

    return (
        <div>
            <h1>{data.name}</h1>
            <p>{data.email}</p>
        </div>
    );
}
```

## API リファレンス

### `useAPIRequest<T>(options?)`

APIリクエストを実行し、状態管理とエラーハンドリングを提供するReactフック。

**パラメータ:**

- `options?: UseAPIRequestOptions<T>` - オプション設定
  - `onSuccess?: (data: T) => void` - 成功時のコールバック
  - `onError?: (error: APIError) => void` - エラー時のコールバック

**戻り値: `UseAPIRequestReturn<T>`**

- `data: T | null` - レスポンスデータ
- `loading: boolean` - ローディング状態
- `error: APIError | null` - エラー情報
- `execute: (url: string, options?: APIRequestOptions) => Promise<T | null>` - リクエスト実行関数
- `reset: () => void` - 状態をリセット
- `retry: () => Promise<T | null>` - 最後のリクエストをリトライ

### 型定義

#### `UseAPIRequestOptions<T>`

```typescript
interface UseAPIRequestOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: APIError) => void;
}
```

#### `UseAPIRequestReturn<T>`

```typescript
interface UseAPIRequestReturn<T> {
  data: T | null;
  loading: boolean;
  error: APIError | null;
  execute: (url: string, options?: APIRequestOptions) => Promise<T | null>;
  reset: () => void;
  retry: () => Promise<T | null>;
}
```

#### `APIRequestState<T>`

```typescript
interface APIRequestState<T> {
  data: T | null;
  loading: boolean;
  error: APIError | null;
}
```

## ベストプラクティス

### 1. エラーハンドリングのパターン

```typescript
const { data, error, execute } = useAPIRequest<DataType>({
  onError: (error) => {
    // エラータイプに応じた処理
    if (error.errorInfo.type === 'error') {
      toast.error(error.message);
    } else if (error.errorInfo.type === 'warning') {
      toast.warning(error.message);
    } else {
      toast.info(error.message);
    }

    // ステータスコードに応じた処理
    if (error.status === 401) {
      router.push('/login');
    }
  },
});
```

### 2. ローディング状態の表示

```typescript
import CircularProgress from '@mui/material/CircularProgress';

function DataView() {
    const { data, loading, error, execute } = useAPIRequest<DataType>();

    useEffect(() => {
        execute('/api/data');
    }, []);

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                <CircularProgress />
            </div>
        );
    }

    if (error) return <ErrorMessage error={error} />;
    if (!data) return <div>データがありません</div>;

    return <DataDisplay data={data} />;
}
```

### 3. useEffectの依存配列

```typescript
// ❌ executeを依存配列に含めると無限ループ
useEffect(() => {
  execute('/api/data');
}, [execute]);

// ✅ executeを依存配列から除外
useEffect(() => {
  execute('/api/data');
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

// または、特定の値が変わった時だけ実行
useEffect(() => {
  execute(`/api/users/${userId}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [userId]);
```

### 4. サービス固有のエラーメッセージとの統合

```typescript
// API関数をラップして使用
import { getStockPrice } from 'stock-tracker-core/api/stock-api';

function StockPrice({ symbol }: { symbol: string }) {
  const toast = useToast();
  const { data, loading, error } = useAPIRequest<StockPrice>({
    onError: (error) => {
      // サービス固有のエラーメッセージが適用される
      toast.error(error.message);
    },
  });

  useEffect(() => {
    const fetchPrice = async () => {
      // getStockPrice() は内部でサービス固有メッセージを使用
      await getStockPrice(symbol);
    };
    fetchPrice();
  }, [symbol]);

  // ...
}
```

## 設計原則

- **React統合**: Reactのフックパターンに準拠
- **型安全性**: TypeScript strict modeで厳格な型チェック
- **依存分離**: トースト通知はコールバックで注入
- **再利用性**: 状態管理ロジックを共通化

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

## 依存関係

このパッケージは以下に依存しています：

- `@nagiyu/common` - APIクライアント機能
- `react` - Reactフック機能

## ライセンス

このプロジェクトは [MIT License](../../MIT_LICENSE) および [Apache License 2.0](../../Apache_LICENSE) のデュアルライセンスです。
