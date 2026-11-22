---
sources:
  - libs/common/src/api/client.ts
  - libs/common/src/api/error-handler.ts
  - libs/common/src/api/types.ts
  - libs/common/src/async/sleep.ts
sources_hash: 389ee817db26333c100c0d1ff95a1f68dce5cf0422e249240afb6091d2d5676b
---

# API クライアント

リトライとエラーの変換を持つ `fetch` のラッパー。JSON の API を呼び、失敗を `APIError` にして投げる。待機の関数 `sleep` もここにある。メインの `@nagiyu/common` から import する。サービスからは使われていない。

バックエンドの処理を再試行する [リトライ](./retry.md) とは別のもの。こちらは HTTP の応答とネットワークの失敗を見て再試行を決める。

## 使い方

| 関数 | 引数 | 内容 |
|---|---|---|
| `apiRequest<T>(url, options)` | URL、`APIRequestOptions` | リトライ付きのリクエスト。成功した応答の本文を JSON として読み、`T` として返す |
| `get<T>(url, options)` | URL、オプション | `GET` |
| `post<T>(url, body, options)` | URL、本文、オプション | `POST`。本文を `JSON.stringify` し、`Content-Type: application/json` を付ける |
| `put<T>(url, body, options)` | 同上 | `PUT`。`post` と同じ |
| `del<T>(url, options)` | URL、オプション | `DELETE` |
| `fetchWithTimeout(url, options)` | URL、`RequestInit` と `timeout` | タイムアウト付きの `fetch` |
| `calculateBackoffDelay(attempt, config)` | 試行の番号 (0 始まり)、`RetryConfig` | 待機時間 (ミリ秒) |
| `mapAPIErrorToMessage(errorResponse, serviceMessages?)` | エラーの応答、コードごとのメッセージ (任意) | 画面に出すメッセージ |
| `isRetryableError(status)` | HTTP ステータス | 再試行してよいか |
| `sleep(ms)` | ミリ秒 | その時間だけ待つ `Promise` |

`APIRequestOptions` は `RequestInit` に `retry` (`RetryConfig` の一部) と `timeout` (ミリ秒) を足したもの。`post` と `put` で `headers` を渡すと、`Content-Type` に重ねて指定できる。

```typescript
const items = await get<Item[]>('/api/items', { retry: { maxRetries: 1 } });
```

- 型引数 `T` は、省くと `unknown` になってコンパイルは通る。応答の形を保証する仕組みはないので、呼び出し側が正しい型を渡す
- 呼び出し側の `signal` は使われない。タイムアウトのために、関数が自前の `AbortController` の `signal` で上書きする

## 振る舞い

### 既定値

| 項目 | 値 |
|---|---|
| 最大のリトライ回数 (`maxRetries`) | 3 |
| 最初の待機 (`initialDelay`) | 1000 ミリ秒 |
| 待機の上限 (`maxDelay`) | 10000 ミリ秒 |
| 倍率 (`backoffMultiplier`) | 2 |
| タイムアウト | 30000 ミリ秒 |

- 試行は最大で `maxRetries + 1` 回
- タイムアウトは、試行 1 回ごとに数える。全体ではない
- 待機は `initialDelay × backoffMultiplier ^ attempt` を `maxDelay` で頭打ちにし、±25% のジッターを足して切り捨てる。既定では、1 回目の再試行の前が約 1 秒、2 回目が約 2 秒、3 回目が約 4 秒
- 再試行のたびに `console.log` で `Retrying request to {url} after {遅延}ms (attempt {n}/{最大})` を出す

### 再試行する失敗

| 失敗 | 再試行 |
|---|---|
| ステータスが 408、429、500 以上 | する |
| ステータスが上のほかの 4xx | しない |
| ネットワークの失敗 (`TypeError` で、メッセージに `fetch` を含む) | する |
| タイムアウト (`AbortError`) | する |
| 上のどれでもない例外 | しない |

- ネットワークの失敗の判定は、メッセージに `fetch` を含む `TypeError` に限る。Safari の `Load failed` のように `fetch` を含まないメッセージは、ネットワークの失敗とみなさず再試行しない
- 再試行を使い切った場合や、再試行しない失敗は、`APIError` を投げて終わる

### 失敗したとき

失敗はすべて `APIError` (`name` は `APIError`) で投げる。

| 項目 | 内容 |
|---|---|
| `status` | 応答があれば HTTP ステータス。応答のない失敗は 0 |
| `errorInfo` | `type` (`error` / `warning` / `info`)、`message`、`details` (任意)、`shouldRetry` (任意) |
| `message` | `errorInfo.message` と同じ |

`errorInfo` の作り方は、失敗の種類で分かれる。

| 失敗 | `type` | `message` |
|---|---|---|
| 応答があり、ステータスが 500 以上 | `error` | 下のエラーコードの対応で決まる |
| 応答があり、ステータスが 400 台 | `warning` | 同上 |
| ネットワークの失敗 | `error` | ネットワーク接続を確認してください |
| タイムアウト | `error` | 接続がタイムアウトしました。しばらくしてから再度お試しください |
| 上のほか (本文を JSON として読めない成功の応答を含む) | `error` | 予期しないエラーが発生しました |

- 成功の応答 (`ok`) は、本文の有無を見ずに `response.json()` を呼ぶ。本文のない応答 (204 など) は JSON として読めず、上の「上のほか」に当たる。`APIError` (`status` は 0) を投げ、再試行もしない。本文のない応答を返す API には使えない
- エラーの応答の本文が `{ error, message }` (どちらも文字列) でなければ、`error` を `HTTP_ERROR`、`message` を `HTTPエラー: {ステータス}` として扱う。`details` は本文の `details` をそのまま使う
- `apiRequest` は `mapAPIErrorToMessage` をサービス固有のメッセージなしで呼ぶので、`APIError` の `message` にサービス固有のメッセージは入らない。サービス固有のメッセージに変えたいときは、呼び出し側が `mapAPIErrorToMessage` を使う

### エラーコードからメッセージへの対応

`mapAPIErrorToMessage` は、次の順で最初に当てはまるものを返す。

| 順 | 条件 | メッセージ |
|---|---|---|
| 1 | `serviceMessages` に応答の `error` のキーがある | その値 |
| 2 | `error` が下の共通の対応にある | 共通のメッセージ |
| 3 | 応答の `message` が空でない | その `message` |
| 4 | 上のどれでもない | 予期しないエラーが発生しました |

共通の対応は次のとおり。メッセージの文言は [エラーコード・エラーメッセージ・応答の型](./error-codes.md) にある。

| `error` | メッセージのキー |
|---|---|
| `UNAUTHORIZED` | `UNAUTHORIZED` |
| `FORBIDDEN` | `FORBIDDEN` |
| `INVALID_REQUEST` | `INVALID_REQUEST` |
| `VALIDATION_ERROR` | `VALIDATION_ERROR` |
| `NOT_FOUND` | `NOT_FOUND` |
| `INTERNAL_ERROR` | `SERVER_ERROR` |

`ALREADY_EXISTS` など、ここにないコードは 3 に進む。

### 補助の関数

- `fetchWithTimeout` は、`timeout` (既定 30000) のあとに `AbortController` で中断する。終わったらタイマーを解除する
- `sleep` は、指定したミリ秒だけ待つ。再試行の待機を各所で実装し直さないために置いている
