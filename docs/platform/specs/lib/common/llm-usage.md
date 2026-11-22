---
sources:
  - libs/common/src/llm-usage/types.ts
  - libs/common/src/llm-usage/usage-log.ts
sources_hash: ecdcb570df0def02c9d8e6d39d38284cdcf9ebd2571ce198811b1d3621285833
---

# LLM のトークン使用量のログ

LLM の呼び出し 1 回分のトークン使用量を、構造化ログとして出す部品。Provider の SDK の型に依存せず、使用量は素の数値のオブジェクトとして扱う。ログは CloudWatch Logs Insights で、サービス・用途別にトークン数を集計するためのもの。メインの `@nagiyu/common` から import する。

## 使い方

| 関数 | 引数 | 戻り値 |
|---|---|---|
| `logLLMUsage(input)` | `LLMUsageLogInput` | なし。使用量を `INFO` のログに出す |
| `extractOpenAIResponsesUsage(usage)` | OpenAI Responses API の `usage` (`unknown`) | `LLMTokenUsage` |
| `resolveOpenAIResponsesOutcome(status)` | OpenAI Responses API の `response.status` (`unknown`) | `LLMUsageOutcome` または `undefined` |

```typescript
logLLMUsage({
  service: 'livetalk',
  purpose: 'conversation',
  model,
  reasoningEffort: 'low',
  outcome: resolveOpenAIResponsesOutcome(response.status),
  ...extractOpenAIResponsesUsage(response.usage),
});
```

### `LLMUsageLogInput`

| 項目 | 内容 |
|---|---|
| `service` | サービスの識別子 |
| `purpose` | 用途の識別子 (`conversation`、`classify` など) |
| `model` | 実際に呼び出したモデル名 |
| `reasoningEffort` | 指定した `reasoning.effort`。API の既定に任せたときは省く |
| `outcome` | 呼び出しの終了状態。省くと、ログにも出ない |
| `inputTokens` / `cachedInputTokens` / `outputTokens` / `reasoningTokens` / `totalTokens` | トークン数。すべて任意 |

トークン数 5 項目の型が `LLMTokenUsage` で、`LLMUsageLogInput` はそれを含む。

## 振る舞い

### ログの出力

- ログのメッセージは `[llm-usage] LLM トークン使用量` (`LLM_USAGE_LOG_MESSAGE`)。集計クエリの検索キーになる
- context は入れ子にせず、`service`、`purpose`、`model`、`reasoningEffort`、`outcome` とトークン数 5 項目を平らに並べる。値が `undefined` の項目は JSON に出ない
- トークン数の 5 項目がすべて無く、`outcome` が `aborted` でないときは、`WARN` のログを 1 件足す。メッセージは `LLM_USAGE_WARN_MESSAGES.NO_USAGE_EXTRACTED` で、context は `service`、`purpose`、`model`、`outcome`。SDK や API のフィールド形式が変わって抽出が追従できていないことに気づくためのもの

### 終了状態 (`outcome`)

| 値 | 意味 | 使用量 |
|---|---|---|
| `completed` | 正常に完了した | 取れる |
| `incomplete` | `max_output_tokens` への到達などで打ち切られた | 取れる。最もトークンを使うので取りこぼさない |
| `failed` | API 側のエラーで応答が失敗した | 取れる場合がある |
| `aborted` | ストリーミングがどの終了イベントにも着かずに終わった。利用側が `break` / `return` で中断した場合と、途中で例外が出た場合を含む | 原理的に取れない。欠測したことだけを記録する |

ストリーミングと非ストリーミングの呼び出しで、同じ語彙を使う。

### 使用量の抽出

`extractOpenAIResponsesUsage` は、Responses API の次のフィールドを読む。

| 出力 | 読むフィールド |
|---|---|
| `inputTokens` | `input_tokens` |
| `cachedInputTokens` | `input_tokens_details.cached_tokens` |
| `outputTokens` | `output_tokens` |
| `reasoningTokens` | `output_tokens_details.reasoning_tokens` |
| `totalTokens` | `total_tokens` |

- 数値でないもの、存在しないもの、`null` や `undefined` を含む想定外の型は、例外にせず `undefined` にする。計測の失敗で本処理を壊さないため
- Responses API 専用。Embeddings API の `usage` は `prompt_tokens` と `total_tokens` の別の形式なので、渡してはならない。渡すと全項目が `undefined` になり、上の警告が出る。関数名に Provider と API を含めているのは、この誤用を命名で防ぐため

`resolveOpenAIResponsesOutcome` は、`status` が `completed`、`incomplete`、`failed` のときだけそのまま返す。それ以外 (`in_progress`、文字列でない値など) は `undefined`。`aborted` は返さない。

## 理由

使用量の型を Provider 非依存にしている。`libs/common` が外部依存を持たないため、SDK の型を取り込まず、`unknown` を受けて構造的に読む。
