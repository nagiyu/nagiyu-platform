---
sources:
  - libs/react/src/hooks/useAPIRequest.ts
  - libs/react/src/api-client.ts
sources_hash: 2904b44bc8106b33d7ee6e6c06299b3af54d8d8a320a42d7cf32fc7f2f7e9fa7
---

# API リクエストのフックとクライアント

API リクエストの状態を持つ `useAPIRequest` と、同じリクエストをクラスで呼ぶ `ApiClient`。どちらも [API クライアント](../common/api-client.md)の `apiRequest` を包む。`@nagiyu/react` から import する。サービスからは使われていない。

## 使い方

### useAPIRequest

| 引数 (`options`) | 内容 |
|---|---|
| `onSuccess` | 成功したときに、データを渡して呼ぶ |
| `onError` | 失敗したときに、`APIError` を渡して呼ぶ |

トースト通知などの画面の処理は、呼び出し側がこのコールバックで渡す。

| 戻り値 | 内容 |
|---|---|
| `data` | 直近に成功したレスポンス。なければ `null` |
| `loading` | 実行中か |
| `error` | 直近の失敗の `APIError`。なければ `null` |
| `execute(url, options)` | リクエストを実行し、データを返す。失敗や破棄では `null`。`options` は `apiRequest` の `APIRequestOptions` |
| `retry()` | 直近の `execute` と同じ引数で再実行する |
| `reset()` | 状態を初期に戻す |

再試行の画面は、`error` と `retry` を [エラー表示](../ui/error-alert.md) の `APIError` と `onRetry` に渡して作れる。

### ApiClient

`new ApiClient(baseUrl, defaultOptions)` で作る。

| メソッド | 内容 |
|---|---|
| `request(url, options)` | `baseUrl + url` に `apiRequest` で要求する。`defaultOptions` に `options` を重ね、`headers` は両方を合成する |
| `get(url, options)` | `GET` |
| `post(url, body, options)` | `POST`。`body` を JSON 文字列にして送り、`Content-Type` の既定は `application/json` |
| `put(url, body, options)` | `PUT`。`post` と同じ |
| `delete(url, options)` | `DELETE` |

`APIError` と、`APIRequestOptions`・`RetryConfig`・`ErrorInfo` の型は、common から再エクスポートする。

## 振る舞い

### useAPIRequest の状態

- `execute` は、`loading` を立てて `error` を消し、直近のリクエストとして URL と `options` を記録する。`data` は実行中は残る
- 成功すると `data` に入れ、`error` は `null` にして、`onSuccess` を呼ぶ
- 失敗すると、`data` を `null` に戻して `error` に入れ、`onError` を呼ぶ
- コールバックは最新の参照を使う。再レンダリングで関数が変わっても、`execute` は変わらない

### 応答を捨てる場合

次のとき、`execute` は状態を更新せず、コールバックも呼ばずに `null` を返す。

- 後から別の `execute` が始まった (古い応答を捨てる)
- コンポーネントがアンマウントされた

### retry と reset の注意

- `retry` は、直近のリクエストを state から読む。同じレンダーの中で `execute` の直後に呼ぶと、更新前の値を見る
- `reset` は直近のリクエストも消すので、その後の `retry` は何も実行せず、`console.warn` を出して `null` を返す
- `reset` は、実行中のリクエストを無効にしない。そのリクエストの結果は、`reset` の後でも状態に入る
