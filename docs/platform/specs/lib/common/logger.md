---
sources:
  - libs/common/src/logger/logger.ts
  - libs/common/src/logger/types.ts
sources_hash: c57120646ed89fc6fee7f7da8435995404fc318439e7ac2c87c135e920535d11
---

# ロガー

JSON 1 行で出力する構造化ログ。`console` を薄く包んだもので、モジュールが作る `logger` を使う。メインの `@nagiyu/common` から import する。

## 使い方

```typescript
import { logger } from '@nagiyu/common';

logger.error('処理に失敗しました', { userId, error: error.message });
```

| メソッド | 引数 | 出力先 |
|---|---|---|
| `debug` | メッセージ、context (任意) | 標準出力 (`console.log`) |
| `info` | 同上 | 標準出力 (`console.log`) |
| `warn` | 同上 | 標準エラー出力 (`console.error`) |
| `error` | 同上 | 標準エラー出力 (`console.error`) |

context は任意のキーと値の組 (`Record<string, unknown>`)。

## 振る舞い

### 出力の形

1 件を次の項目を持つ JSON の 1 行にして、同期で出力する。

| 項目 | 内容 |
|---|---|
| `timestamp` | 出力時の ISO 8601 の文字列 |
| `level` | `DEBUG` / `INFO` / `WARN` / `ERROR` |
| `message` | メッセージ |
| `context` | context を渡したときだけ持つ |

### ログレベル

環境変数 `LOG_LEVEL` に指定したレベル以上のログだけを出す。順序は `DEBUG` < `INFO` < `WARN` < `ERROR`。

| `LOG_LEVEL` | 動作 |
|---|---|
| 未設定、空文字 | `INFO` として動く。警告は出さない |
| `DEBUG` / `INFO` / `WARN` / `ERROR` | そのレベル。大文字小文字は区別しない (`warn` でもよい) |
| 上以外 | `INFO` として動く。警告を 1 回出す |

- `LOG_LEVEL` はモジュールを最初に import したときに 1 回だけ読む。そのあとに環境変数を変えても、動作は変わらない
- 無効な値の警告は、`WARN` の JSON (`Invalid LOG_LEVEL: "{値}". Using default "INFO".`。値は大文字にしたもの) を、ロガーを通さず `console.error` に直接出す。値の前後の空白は取り除かないので、空白だけの値も無効として扱う

### 失敗したとき

context が JSON にできない (循環参照など) とき、元のログは出ない。代わりに `ERROR` の JSON を標準エラー出力に出す。

| 項目 | 内容 |
|---|---|
| `message` | `Failed to stringify log entry` |
| `context.error` | `JSON.stringify` が投げたエラーのメッセージ。`Error` でなければ `Unknown error` |
| `context.originalMessage` | 元のメッセージ |
| `context.originalLevel` | 元のレベル |

呼び出し側には例外を投げない。

## 理由

`console` を薄く包むだけにしている。ログの出力でパフォーマンスに影響を与えず、外部のログライブラリを持ち込まないため。`DEBUG` と `INFO` を標準出力、`WARN` と `ERROR` を標準エラー出力に振り分けているので、出力先を見て重大度で分けられる。
