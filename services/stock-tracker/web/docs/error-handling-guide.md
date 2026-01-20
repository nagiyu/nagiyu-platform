# エラーハンドリング統合ガイド

## 概要

このガイドでは、既存のページに新しいエラーハンドリング機能を統合する方法を説明します。

## 基本的な使い方

### 1. Snackbar を使用したトーストメッセージ

```tsx
'use client';

import { useSnackbar } from '@/components/SnackbarProvider';
// または
import { useSnackbar } from '@/lib/error-handling';

function MyComponent() {
  const { showSuccess, showError, showWarning, showInfo } = useSnackbar();

  const handleSave = async () => {
    try {
      await saveData();
      showSuccess('データを保存しました');
    } catch (error) {
      showError('データの保存に失敗しました');
    }
  };

  return <button onClick={handleSave}>保存</button>;
}
```

### 2. API クライアントを使用したリトライ機能付きリクエスト

```tsx
import { get, post, put, del, APIError } from '@/lib/api-client';
// または
import { get, post, put, del, APIError } from '@/lib/error-handling';

// GETリクエスト（自動リトライ付き）
async function fetchData() {
  try {
    const data = await get<DataType>('/api/data');
    return data;
  } catch (error) {
    if (error instanceof APIError) {
      console.error('API Error:', error.message);
      console.error('Status:', error.status);
      console.error('Should retry:', error.errorInfo.shouldRetry);
    }
    throw error;
  }
}

// POSTリクエスト
async function createItem(item: Item) {
  return await post<Item>('/api/items', item);
}

// カスタムリトライ設定
async function fetchWithCustomRetry() {
  return await get('/api/data', {
    retry: {
      maxRetries: 5,
      initialDelay: 2000,
    },
    timeout: 60000, // 60秒
  });
}
```

### 3. useAPIRequest フックを使用した状態管理

```tsx
'use client';

import { useAPIRequest } from '@/lib/hooks/useAPIRequest';
// または
import { useAPIRequest } from '@/lib/error-handling';

function MyComponent() {
  const { data, loading, error, execute, retry } = useAPIRequest<DataType>({
    showErrorToast: true, // 自動的にエラートーストを表示
    showSuccessToast: true, // 自動的に成功トーストを表示
    successMessage: 'データを取得しました',
  });

  useEffect(() => {
    execute('/api/data');
  }, [execute]);

  if (loading) return <CircularProgress />;
  if (error) return <ErrorDisplay error={error} onRetry={retry} />;
  if (!data) return null;

  return <div>{/* データを表示 */}</div>;
}
```

### 4. ErrorDisplay コンポーネントでエラーを表示

```tsx
import { ErrorDisplay, LoadingError } from '@/components/ErrorDisplay';
// または
import { ErrorDisplay, LoadingError } from '@/lib/error-handling';

function MyComponent() {
  const [error, setError] = useState<APIError | null>(null);

  // 完全なエラー表示（リトライボタン付き）
  return (
    <ErrorDisplay
      error={error}
      onRetry={() => {
        setError(null);
        refetch();
      }}
      showRetryButton={true}
      fullWidth={true}
    />
  );

  // 簡易エラー表示
  return <LoadingError message="データの読み込みに失敗しました" onRetry={refetch} />;
}
```

## 既存コードのリファクタリング例

### Before: 従来のfetch + useState

```tsx
'use client';

import { useState, useEffect } from 'react';

function HoldingsPage() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHoldings();
  }, []);

  const fetchHoldings = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/holdings');
      if (!res.ok) {
        throw new Error('データの取得に失敗しました');
      }
      const data = await res.json();
      setHoldings(data.holdings);
    } catch (err) {
      setError(err instanceof Error ? err.message : '不明なエラー');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <CircularProgress />;
  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <div>
      {holdings.map((holding) => (
        <div key={holding.holdingId}>{holding.symbol}</div>
      ))}
    </div>
  );
}
```

### After: useAPIRequest + エラーハンドリング統合

```tsx
'use client';

import { useEffect } from 'react';
import { CircularProgress } from '@mui/material';
import { useAPIRequest, ErrorDisplay } from '@/lib/error-handling';

interface HoldingsResponse {
  holdings: Holding[];
  pagination: {
    count: number;
    lastKey?: string;
  };
}

function HoldingsPage() {
  const { data, loading, error, execute, retry } = useAPIRequest<HoldingsResponse>();

  useEffect(() => {
    execute('/api/holdings');
  }, [execute]);

  if (loading) return <CircularProgress />;
  if (error) return <ErrorDisplay error={error} onRetry={retry} />;
  if (!data) return null;

  return (
    <div>
      {data.holdings.map((holding) => (
        <div key={holding.holdingId}>{holding.symbol}</div>
      ))}
    </div>
  );
}
```

## エラーハンドリングのベストプラクティス

### 1. エラーメッセージは日本語で定数化

```tsx
const ERROR_MESSAGES = {
  FETCH_ERROR: 'データの取得に失敗しました',
  CREATE_ERROR: '登録に失敗しました',
  UPDATE_ERROR: '更新に失敗しました',
  DELETE_ERROR: '削除に失敗しました',
} as const;
```

### 2. 成功メッセージも定数化

```tsx
const SUCCESS_MESSAGES = {
  CREATE_SUCCESS: '登録しました',
  UPDATE_SUCCESS: '更新しました',
  DELETE_SUCCESS: '削除しました',
} as const;
```

### 3. APIエラーレスポンスの型定義

API Route で以下の形式でエラーを返す:

```tsx
// API Route
return NextResponse.json(
  {
    error: 'VALIDATION_ERROR',
    message: '入力データが不正です',
    details: ['保有数は0.0001以上である必要があります'],
  },
  { status: 400 }
);
```

### 4. トーストメッセージの使い分け

- **success**: 操作が成功した時（登録、更新、削除など）
- **error**: 操作が失敗した時
- **warning**: 警告（データが不完全など）
- **info**: 情報提供（処理中など）

### 5. リトライボタンの表示制御

- ネットワークエラー: リトライボタンを表示
- サーバーエラー (5xx): リトライボタンを表示
- バリデーションエラー (4xx): リトライボタンを非表示

これは `APIError.errorInfo.shouldRetry` で自動判定されます。

## トラブルシューティング

### Snackbar が表示されない

- `ThemeRegistry` が `SnackbarProvider` でラップされているか確認
- `useSnackbar` を `SnackbarProvider` の外で使用していないか確認

### リトライが動作しない

- `APIError.errorInfo.shouldRetry` が `true` になっているか確認
- ネットワークエラーまたは 5xx エラーかどうか確認

### エラーメッセージが英語で表示される

- `lib/error-handler.ts` の `ERROR_MESSAGES` にマッピングを追加
- API Route のエラーレスポンスが統一形式になっているか確認

## まとめ

新しいエラーハンドリングシステムを使用することで:

- ✅ 統一されたエラー表示
- ✅ 自動リトライ機能
- ✅ ユーザーフレンドリーなメッセージ
- ✅ トーストメッセージによる通知
- ✅ コードの簡潔化

が実現できます。
