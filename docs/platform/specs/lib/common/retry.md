---
sources:
  - libs/common/src/retry/retry.ts
  - libs/common/src/retry/types.ts
  - libs/common/src/retry/timeout.ts
sources_hash: d40dc16e353bc958a0c8bea1e80afb5eda699c2de96a2055cda477653ce5c816
---

# リトライとタイムアウト

バックエンドの処理を、指数バックオフで再試行する `withRetry` と、時間の上限を付ける `withTimeout`。メインの `@nagiyu/common` から import する。

HTTP の応答を見て再試行を決める [API クライアント](./api-client.md) のリトライとは別のもの。こちらは任意の非同期関数を包み、投げられた例外で再試行を決める。

## 使い方

| 関数 | 引数 | 戻り値 |
|---|---|---|
| `withRetry(fn, options?)` | 非同期関数、`Partial<RetryOptions>` | `fn` の結果。再試行を使い切ると、最後の例外を投げる |
| `withTimeout(promise, timeoutMs, timeoutMessage)` | `Promise`、ミリ秒、期限切れのメッセージ | `promise` の結果。期限を過ぎると `Error(timeoutMessage)` で reject する |

### `RetryOptions`

| 項目 | 既定値 | 内容 |
|---|---|---|
| `maxRetries` | 3 | 最大のリトライ回数。試行は最大で `maxRetries + 1` 回 |
| `initialDelayMs` | 1000 | 最初の待機 (ミリ秒) |
| `backoffMultiplier` | 2 | 待機の倍率 |
| `shouldRetry` | なし | 例外を受けて、再試行するかを返す関数。なければすべて再試行する |
| `logger` | `logger` ([ロガー](./logger.md)) | `warn` と `error` を持つオブジェクト |

既定値は `DEFAULT_RETRY_OPTIONS` として公開している。

```typescript
const result = await withRetry(() => callExternalApi(), {
  maxRetries: 2,
  shouldRetry: (error) => !error.message.includes('400'),
});
```

## 振る舞い

### `withRetry`

- `n` 回目 (0 始まり) の失敗のあと、`initialDelayMs × backoffMultiplier ^ n` ミリ秒待つ。既定では 1 秒、2 秒、4 秒。ジッターも上限もない
- `Error` でない値が投げられたときは、`String(値)` をメッセージにした `Error` に変えて扱う
- 失敗したあとの扱い

| 状況 | 動作 |
|---|---|
| `shouldRetry` が `false` を返した | ログを出さず、その例外をすぐに投げる |
| 最後の試行も失敗した | `logger.error('リトライ回数が上限に達しました', { attempt, error })` を出し、その例外を投げる |
| 再試行できる | `logger.warn('処理が失敗したため、リトライします', { attempt, delayMs, error })` を出し、待ってから再実行する |

`attempt` は 1 始まりの試行の番号、`error` は例外のメッセージ。

### `withTimeout`

- `Promise.race` で `promise` と期限のタイマーを競わせる。終わったらタイマーを必ず解除する
- 期限を過ぎても、`promise` の処理自体は止めない。結果が捨てられるだけ
