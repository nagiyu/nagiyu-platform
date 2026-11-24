---
sources:
  - libs/ui/src/components/error/ErrorAlert.tsx
sources_hash: 807dfff61c44f2efd7651e8faebebad07588e45a2cbeb637e4ed9ce62e9f5927
---

# ErrorAlert

エラーを知らせるアラート。文字列・`Error`・[APIError](../common/api-client.md) のどれからでも表示を組み立て、再試行のボタンを添えられる。MUI の `Alert` で描く。`@nagiyu/ui` から `ErrorAlert` を import する。

## 使い方

```tsx
<ErrorAlert error={error} title="取得に失敗しました" onRetry={reload} />
```

| Props | 型 | 既定値 | 内容 |
|---|---|---|---|
| `message` | string | なし | メッセージ。`error` より優先する |
| `error` | string / `Error` / `APIError` / null / undefined | なし | エラー |
| `title` | string | なし | タイトル |
| `details` | string[] | なし | 詳細の箇条書き。`APIError` の詳細より優先する |
| `onRetry` | `() => void` | なし | 指定すると再試行のボタンを出す |
| `retryLabel` | string | `再試行` | 再試行ボタンの表示名 |
| `onClose` | `() => void` | なし | 指定すると閉じるボタン (✕) を出す |
| `severity` | `error` / `warning` / `info` | `error` | 重大度 |

## 振る舞い

### 表示するメッセージ

| 入力 | メッセージ | 詳細 | 再試行 |
|---|---|---|---|
| `message` がある | `message` (`error` は見ない) | `details` | できる |
| `error` が文字列 | その文字列 | `details` | できる |
| `error` が `APIError` | `errorInfo.message`、なければ `error.message`、それもなければ `エラーが発生しました` | `details` があればそれ、なければ `errorInfo.details` | `errorInfo.shouldRetry` が `false` でなければできる |
| `error` が `Error` | `error.message`、なければ `エラーが発生しました` | `details` | できる |
| どちらもない | 何も描かない | | |

- 詳細が空でなければ、メッセージの下に箇条書きで出す
- 再試行のボタンは、`onRetry` があり、かつ再試行できるときだけ、アラートの下の中央に出す
- `role="alert"` と `aria-live="assertive"` を付け、出た時点で読み上げさせる
- 部品は `sx` を受け取らない。`Alert` には下の余白 (`sx={{ mb: 2 }}`) が当たっているので、配置と、それ以外の余白は呼び出し側の親要素で決める
