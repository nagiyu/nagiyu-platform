# APIクライアントマイグレーションガイド

## 目次

-   [概要](#概要)
-   [変更点一覧](#変更点一覧)
-   [移行手順](#移行手順)
-   [移行チェックリスト](#移行チェックリスト)
-   [トラブルシューティング](#トラブルシューティング)

## 概要

このドキュメントは、既存のAPIクライアント実装から新しい `@nagiyu/common` と `@nagiyu/react` パッケージへの移行手順を説明します。

### 移行の目的

-   **統一されたエラーハンドリング**: プラットフォーム全体で一貫したエラー処理
-   **自動リトライ機能**: ネットワークエラーやサーバーエラーへの自動対応
-   **型安全性の向上**: TypeScriptによる厳格な型チェック
-   **保守性の向上**: 共通ライブラリによるコードの重複削減

### 対象者

-   既存サービスの開発者
-   新しいAPIクライアントライブラリを導入するプロジェクト
-   fetch APIやaxiosを直接使用しているコード

## 変更点一覧

### 1. トースト通知の依存注入パターン

#### 変更前

```typescript
// エラーハンドリングとトースト通知が混在
async function fetchData() {
    try {
        const response = await fetch('/api/data');
        if (!response.ok) {
            toast.error('データの取得に失敗しました');
            throw new Error('Fetch failed');
        }
        const data = await response.json();
        toast.success('データを取得しました');
        return data;
    } catch (error) {
        toast.error('エラーが発生しました');
        throw error;
    }
}
```

#### 変更後

```typescript
// トースト通知はコールバックで分離
import { useAPIRequest } from '@nagiyu/react';
import { useToast } from '@/hooks/useToast';

const toast = useToast();
const { data, execute } = useAPIRequest<DataType>({
    onSuccess: (data) => {
        toast.success('データを取得しました');
    },
    onError: (error) => {
        toast.error(error.message);
    },
});

await execute('/api/data');
```

**理由**: ビジネスロジックとUI通知を分離することで、テスタビリティと再利用性が向上します。

### 2. 型指定の強制

#### 変更前

```typescript
// 型が不明確
const response = await fetch('/api/users/1');
const user = await response.json();
console.log(user.name); // any型、型安全でない
```

#### 変更後

```typescript
// 型を明示的に指定
import { get } from '@nagiyu/common';

interface User {
    id: number;
    name: string;
    email: string;
}

const user = await get<User>('/api/users/1');
console.log(user.name); // 型安全にアクセス
```

**理由**: TypeScriptの型推論により、実行時エラーを防ぎ、開発体験を向上させます。

### 3. エラーメッセージの2段階マッピング

#### 変更前

```typescript
// エラーメッセージがハードコード
try {
    const response = await fetch('/api/stocks/AAPL');
    if (response.status === 404) {
        throw new Error('銘柄が見つかりませんでした');
    }
    if (response.status === 500) {
        throw new Error('サーバーエラーが発生しました');
    }
} catch (error) {
    console.error(error.message);
}
```

#### 変更後

```typescript
// エラーメッセージは定数化＋2段階マッピング
import { get, APIError } from '@nagiyu/common';

const SERVICE_MESSAGES = {
    STOCK_NOT_FOUND: '指定された銘柄が見つかりませんでした',
};

try {
    const stock = await get<Stock>('/api/stocks/AAPL', {}, SERVICE_MESSAGES);
} catch (error) {
    if (error instanceof APIError) {
        console.error(error.message); // 自動的にマッピングされたメッセージ
    }
}
```

**理由**: エラーメッセージを定数化することで、保守性が向上し、多言語対応も容易になります。

### 4. 自動リトライ機能

#### 変更前

```typescript
// 手動でリトライロジックを実装
async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                return response;
            }
            if (i === maxRetries - 1) {
                throw new Error('Max retries reached');
            }
        } catch (error) {
            if (i === maxRetries - 1) {
                throw error;
            }
            await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, i)));
        }
    }
    throw new Error('Unreachable');
}
```

#### 変更後

```typescript
// リトライは自動的に行われる
import { get } from '@nagiyu/common';

const data = await get<DataType>('/api/data');
// デフォルトで3回リトライ、エクスポネンシャルバックオフ付き
```

**理由**: リトライロジックを共通化することで、コードの重複を削減し、一貫した動作を保証します。

### 5. タイムアウト制御

#### 変更前

```typescript
// AbortControllerを手動で管理
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30000);

try {
    const response = await fetch('/api/data', {
        signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
} catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
        throw new Error('タイムアウトしました');
    }
    throw error;
}
```

#### 変更後

```typescript
// タイムアウトはオプションで指定
import { get } from '@nagiyu/common';

const data = await get<DataType>('/api/data', {
    timeout: 30000, // ミリ秒
});
```

**理由**: タイムアウト処理を抽象化することで、コードの可読性が向上します。

### 6. Reactフックの状態管理

#### 変更前

```typescript
// 手動で状態管理
const [data, setData] = useState<DataType | null>(null);
const [loading, setLoading] = useState(false);
const [error, setError] = useState<Error | null>(null);

const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
        const response = await fetch('/api/data');
        const result = await response.json();
        setData(result);
    } catch (err) {
        setError(err as Error);
    } finally {
        setLoading(false);
    }
};
```

#### 変更後

```typescript
// useAPIRequestで状態管理を統一
import { useAPIRequest } from '@nagiyu/react';

const { data, loading, error, execute } = useAPIRequest<DataType>();

const fetchData = async () => {
    await execute('/api/data');
};
```

**理由**: 状態管理ロジックを共通化することで、ボイラープレートコードを削減します。

## 移行手順

### Step 1: パッケージのインストール

#### サービスのcore（ビジネスロジック層）

```json
{
    "name": "your-service-core",
    "dependencies": {
        "@nagiyu/common": "workspace:*"
    }
}
```

#### サービスのweb（プレゼンテーション層）

```json
{
    "name": "your-service-web",
    "dependencies": {
        "your-service-core": "workspace:*",
        "@nagiyu/common": "workspace:*",
        "@nagiyu/react": "workspace:*"
    }
}
```

```bash
npm install
```

### Step 2: エラーメッセージ定数の作成

サービス固有のエラーメッセージを定義します。

```typescript
// services/your-service/core/src/constants/error-messages.ts

export const SERVICE_ERROR_MESSAGES = {
    // サービス固有のエラーコードとメッセージのマッピング
    RESOURCE_NOT_FOUND: 'リソースが見つかりませんでした',
    INVALID_INPUT: '入力内容が正しくありません',
    OPERATION_FAILED: '操作に失敗しました',
} as const;
```

### Step 3: API関数の置き換え（core層）

#### 変更前

```typescript
// services/your-service/core/src/api/old-api.ts

export async function fetchUser(userId: number): Promise<User> {
    const response = await fetch(`/api/users/${userId}`);
    if (!response.ok) {
        throw new Error('Failed to fetch user');
    }
    return response.json();
}

export async function createUser(userData: CreateUserRequest): Promise<User> {
    const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
    });
    if (!response.ok) {
        throw new Error('Failed to create user');
    }
    return response.json();
}
```

#### 変更後

```typescript
// services/your-service/core/src/api/user-api.ts

import { get, post } from '@nagiyu/common';
import { SERVICE_ERROR_MESSAGES } from '../constants/error-messages';

export async function fetchUser(userId: number): Promise<User> {
    return get<User>(`/api/users/${userId}`, {}, SERVICE_ERROR_MESSAGES);
}

export async function createUser(userData: CreateUserRequest): Promise<User> {
    return post<User>('/api/users', userData, {}, SERVICE_ERROR_MESSAGES);
}
```

### Step 4: Reactコンポーネントの置き換え（web層）

#### 変更前

```typescript
// services/your-service/web/src/components/UserProfile.tsx

'use client';

import { useState, useEffect } from 'react';
import { fetchUser } from 'your-service-core/api/old-api';
import { useToast } from '@/hooks/useToast';

export function UserProfile({ userId }: { userId: number }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const toast = useToast();

    useEffect(() => {
        const loadUser = async () => {
            setLoading(true);
            setError(null);
            try {
                const data = await fetchUser(userId);
                setUser(data);
                toast.success('ユーザー情報を取得しました');
            } catch (err) {
                setError(err as Error);
                toast.error('ユーザー情報の取得に失敗しました');
            } finally {
                setLoading(false);
            }
        };
        loadUser();
    }, [userId]);

    if (loading) return <div>読み込み中...</div>;
    if (error) return <div>エラー: {error.message}</div>;
    if (!user) return null;

    return (
        <div>
            <h2>{user.name}</h2>
            <p>{user.email}</p>
        </div>
    );
}
```

#### 変更後

```typescript
// services/your-service/web/src/components/UserProfile.tsx

'use client';

import { useEffect } from 'react';
import { useAPIRequest } from '@nagiyu/react';
import { fetchUser } from 'your-service-core/api/user-api';
import { useToast } from '@/hooks/useToast';

export function UserProfile({ userId }: { userId: number }) {
    const toast = useToast();
    const { data: user, loading, error } = useAPIRequest<User>({
        onSuccess: () => {
            toast.success('ユーザー情報を取得しました');
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });

    useEffect(() => {
        // fetchUser() は内部で apiRequest() を使用
        const loadUser = async () => {
            const data = await fetchUser(userId);
            return data;
        };
        loadUser();
    }, [userId]);

    if (loading) return <div>読み込み中...</div>;
    if (error) return <div>エラー: {error.message}</div>;
    if (!user) return null;

    return (
        <div>
            <h2>{user.name}</h2>
            <p>{user.email}</p>
        </div>
    );
}
```

**または、execute関数を使用する場合**:

```typescript
'use client';

import { useEffect } from 'react';
import { useAPIRequest } from '@nagiyu/react';
import { useToast } from '@/hooks/useToast';

export function UserProfile({ userId }: { userId: number }) {
    const toast = useToast();
    const { data: user, loading, error, execute } = useAPIRequest<User>({
        onSuccess: () => {
            toast.success('ユーザー情報を取得しました');
        },
        onError: (error) => {
            toast.error(error.message);
        },
    });

    useEffect(() => {
        execute(`/api/users/${userId}`);
    }, [userId]);

    if (loading) return <div>読み込み中...</div>;
    if (error) return <div>エラー: {error.message}</div>;
    if (!user) return null;

    return (
        <div>
            <h2>{user.name}</h2>
            <p>{user.email}</p>
        </div>
    );
}
```

### Step 5: エラーハンドリングの更新

#### 変更前

```typescript
try {
    const response = await fetch('/api/data');
    if (response.status === 401) {
        router.push('/login');
        return;
    }
    if (!response.ok) {
        throw new Error('Request failed');
    }
    const data = await response.json();
    // ...
} catch (error) {
    console.error(error);
}
```

#### 変更後

```typescript
import { get, APIError } from '@nagiyu/common';

try {
    const data = await get<DataType>('/api/data');
    // ...
} catch (error) {
    if (error instanceof APIError) {
        if (error.status === 401) {
            router.push('/login');
            return;
        }
        console.error('APIエラー:', error.message);
        console.error('ステータス:', error.status);
        console.error('詳細:', error.errorInfo.details);
    } else {
        console.error('予期しないエラー:', error);
    }
}
```

### Step 6: テストの更新

#### 変更前

```typescript
// old-api.test.ts
global.fetch = jest.fn();

test('fetchUser returns user data', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1, name: 'Test User' }),
    });

    const user = await fetchUser(1);
    expect(user).toEqual({ id: 1, name: 'Test User' });
});
```

#### 変更後

```typescript
// user-api.test.ts
import { get } from '@nagiyu/common';
import { fetchUser } from './user-api';

jest.mock('@nagiyu/common', () => ({
    get: jest.fn(),
}));

const mockGet = get as jest.MockedFunction<typeof get>;

test('fetchUser returns user data', async () => {
    const mockUser = { id: 1, name: 'Test User' };
    mockGet.mockResolvedValue(mockUser);

    const user = await fetchUser(1);
    expect(user).toEqual(mockUser);
    expect(mockGet).toHaveBeenCalledWith('/api/users/1', {}, expect.any(Object));
});
```

### Step 7: 段階的な移行

大規模なプロジェクトでは、すべてのAPIクライアントを一度に移行するのは困難です。以下の戦略を推奨します：

1.  **新しい機能から適用**: 新規開発では新しいAPIクライアントを使用
2.  **重要度順に移行**: バグが多い箇所、変更頻度が高い箇所を優先
3.  **モジュール単位で移行**: ファイル単位ではなく、機能単位で移行
4.  **段階的にリリース**: 移行したモジュールごとにリリースして検証

## 移行チェックリスト

移行作業を完了する前に、以下のチェックリストを確認してください。

### パッケージのインストール

-   [ ] `@nagiyu/common` をcore層にインストール
-   [ ] `@nagiyu/react` をweb層にインストール
-   [ ] package.jsonの依存関係が正しい

### エラーメッセージの定義

-   [ ] サービス固有のエラーメッセージ定数を作成
-   [ ] エラーコードとメッセージのマッピングが完全
-   [ ] 日本語メッセージが適切

### API関数の置き換え（core層）

-   [ ] `fetch()` を `apiRequest()` / `get()` / `post()` などに置き換え
-   [ ] 型パラメータ `<T>` を正しく指定
-   [ ] サービス固有メッセージを第3引数に渡している
-   [ ] カスタムヘッダーが必要な場合、正しく設定されている
-   [ ] タイムアウトが必要な場合、設定されている

### Reactコンポーネントの置き換え（web層）

-   [ ] `useState`/`useEffect` を `useAPIRequest` に置き換え
-   [ ] `onSuccess` と `onError` コールバックでトースト通知を実装
-   [ ] ローディング状態を適切に表示
-   [ ] エラー状態を適切に表示
-   [ ] データがない場合の処理を実装

### エラーハンドリング

-   [ ] `APIError` 型でエラーをキャッチ
-   [ ] `error.status` でHTTPステータスコードを確認
-   [ ] `error.message` でユーザーフレンドリーなメッセージを表示
-   [ ] 認証エラー（401）への対応を実装
-   [ ] 権限エラー（403）への対応を実装

### テストの更新

-   [ ] `@nagiyu/common` のモックを作成
-   [ ] `APIError` のモックを作成（React層）
-   [ ] エラーケースのテストを追加
-   [ ] リトライのテストを追加（必要に応じて）
-   [ ] すべてのテストがパスする

### ドキュメント

-   [ ] APIの使い方をドキュメント化
-   [ ] エラーメッセージの一覧を作成
-   [ ] 他の開発者がコードを理解できる

### デプロイ前の確認

-   [ ] ローカル環境で動作確認
-   [ ] 開発環境でE2Eテストを実行
-   [ ] ビルドエラーがない
-   [ ] ESLintエラーがない
-   [ ] TypeScriptの型エラーがない

## トラブルシューティング

### 問題1: 型エラー「Property 'xxx' does not exist on type 'unknown'」

**原因**: レスポンスデータの型を指定していない

**解決方法**:

```typescript
// ❌ 型を指定していない
const data = await get('/api/data');
console.log(data.name); // 型エラー

// ✅ 型を指定する
interface DataType {
    name: string;
}
const data = await get<DataType>('/api/data');
console.log(data.name); // OK
```

### 問題2: エラーメッセージが「予期しないエラーが発生しました」になる

**原因**: サービス固有メッセージが定義されていない、または渡されていない

**解決方法**:

```typescript
// ❌ サービス固有メッセージを渡していない
const data = await get<DataType>('/api/data');

// ✅ サービス固有メッセージを渡す
const SERVICE_MESSAGES = {
    DATA_NOT_FOUND: 'データが見つかりませんでした',
};
const data = await get<DataType>('/api/data', {}, SERVICE_MESSAGES);
```

### 問題3: リトライが効かない

**原因1**: エラーがリトライ可能でない（4xxエラー）

**確認方法**:

```typescript
try {
    const data = await get<DataType>('/api/data');
} catch (error) {
    if (error instanceof APIError) {
        console.log('リトライ可能:', error.errorInfo.shouldRetry);
        console.log('ステータスコード:', error.status);
    }
}
```

**解決方法**: リトライ可能なエラー（5xx, 429, ネットワークエラー）のみリトライされます。4xxエラーはクライアントエラーなのでリトライされません。

**原因2**: リトライ設定が無効化されている

**解決方法**:

```typescript
// リトライ設定を確認
const data = await get<DataType>('/api/data', {
    retry: {
        maxRetries: 3, // 0ではないことを確認
    },
});
```

### 問題4: タイムアウトが発生する

**原因**: タイムアウト時間が短すぎる、またはサーバーのレスポンスが遅い

**解決方法**:

```typescript
// タイムアウトを延長
const data = await get<DataType>('/api/slow-endpoint', {
    timeout: 60000, // 60秒
});
```

### 問題5: useAPIRequestが無限ループする

**原因**: `useEffect` の依存配列に `execute` が含まれている

**解決方法**:

```typescript
// ❌ executeが依存配列に含まれている
useEffect(() => {
    execute('/api/data');
}, [execute]); // executeは毎レンダリングで新しい関数

// ✅ executeを依存配列から除外
useEffect(() => {
    execute('/api/data');
    // eslint-disable-next-line react-hooks/exhaustive-deps
}, []); // 初回のみ実行
```

### 問題6: 認証トークンが送信されない

**原因**: ヘッダーが正しく設定されていない

**解決方法**:

```typescript
// ✅ ヘッダーを明示的に設定
const data = await get<DataType>('/api/protected', {
    headers: {
        Authorization: `Bearer ${token}`,
    },
});
```

### 問題7: POSTリクエストでContent-Typeが設定されない

**原因**: `post()` 関数はデフォルトで `Content-Type: application/json` を設定しますが、カスタムヘッダーで上書きされる可能性があります。

**解決方法**:

```typescript
// ✅ post関数は自動的にContent-Typeを設定
const data = await post<DataType>('/api/data', { key: 'value' });

// カスタムヘッダーが必要な場合
const data = await post<DataType>(
    '/api/data',
    { key: 'value' },
    {
        headers: {
            'Content-Type': 'application/json', // 明示的に指定
            'X-Custom-Header': 'value',
        },
    }
);
```

### 問題8: テストで「Cannot find module '@nagiyu/common'」

**原因**: Jestのモジュール解決設定が不足している

**解決方法**:

```javascript
// jest.config.js
module.exports = {
    moduleNameMapper: {
        '^@nagiyu/common$': '<rootDir>/../../../libs/common/src/index.ts',
        '^@nagiyu/react$': '<rootDir>/../../../libs/react/src/index.ts',
    },
};
```

または、モックを使用:

```typescript
// テストファイル
jest.mock('@nagiyu/common', () => ({
    get: jest.fn(),
    post: jest.fn(),
    APIError: class APIError extends Error {},
}));
```

### 問題9: サービス固有メッセージが適用されない

**原因**: バックエンドAPIのエラーレスポンス形式が正しくない

**確認方法**:

```json
// 正しい形式
{
    "error": "RESOURCE_NOT_FOUND",
    "message": "Resource not found",
    "details": ["Resource ID 123 does not exist"]
}
```

**解決方法**: バックエンドAPIが上記の形式でエラーレスポンスを返すようにしてください。

### 問題10: ビルドエラー「Cannot read property 'json' of undefined」

**原因**: `apiRequest()` がPromiseを返すことを想定していないコード

**解決方法**:

```typescript
// ❌ awaitを忘れている
const data = get<DataType>('/api/data');
console.log(data.name); // Promiseにアクセスしようとしている

// ✅ awaitを使用
const data = await get<DataType>('/api/data');
console.log(data.name); // OK
```

## 参考資料

-   [APIクライアント使用ガイド](./api-client-guide.md)
-   [アーキテクチャ方針](./architecture.md)
-   [共通ライブラリ設計](./shared-libraries.md)
-   [テスト戦略](./testing.md)

## サポート

移行に関する質問や問題がある場合は、以下の方法でサポートを受けられます：

-   GitHub Issueで質問を投稿
-   開発チームのSlackチャンネルで質問
-   コードレビューでフィードバックをリクエスト
