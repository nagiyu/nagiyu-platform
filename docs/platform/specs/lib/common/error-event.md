---
sources:
  - libs/common/src/error-event/types.ts
  - libs/common/src/error-event/event-id.ts
  - libs/common/src/error-event/error-context.ts
  - libs/common/src/api/error-utils.ts
sources_hash: e778245cb4a75c66d37530045ecdac351a81db72be26d44f92fedf8a7cf4fe2c
---

# エラーイベントの型とヘルパー

エラーイベントの型と、ID の生成、例外から context を組み立てる関数。エラーイベントの定義は [ErrorEvent (エラーイベント)](../../term/error-event.md)、保存先は [エラーイベントのテーブル](../../data/error-events.md) にある。メインの `@nagiyu/common` から import する。

## 使い方

| 名前 | 内容 |
|---|---|
| `ErrorEvent` | 保存される 1 件のエラーイベントの型 |
| `ERROR_SEVERITIES` / `ErrorSeverity` | 重大度の一覧と型 |
| `ERROR_SOURCES` / `ErrorSource` | 発生源の一覧と型 |
| `isErrorSeverity(value)` / `isErrorSource(value)` | `unknown` が、一覧のいずれかかを判定する型ガード。文字列でなければ `false` |
| `generateEventId()` | 新しいイベント ID を返す |
| `buildErrorContext(error)` | 例外から context の項目を組み立てる |

`isErrorSeverity` と `isErrorSource` は、サービスからは使われていない。

### `ErrorEvent`

| 項目 | 内容 |
|---|---|
| `eventId` | イベントの ID |
| `serviceId` | 発生元のサービス ID |
| `source` | 発生源 |
| `severity` | 重大度 |
| `title` | 一覧の見出し |
| `message` | 詳細の本文 |
| `context` | 生のペイロードを入れた JSON の文字列 |
| `occurredAt` | 発生時刻 (Unix ミリ秒) |

| 一覧 | 値 |
|---|---|
| `ERROR_SEVERITIES` | `info`、`warning`、`error`、`critical` |
| `ERROR_SOURCES` | `cloudwatch-alarm`、`application`、`manual`、`batch-event` |

型は、これらの配列から導く。保存データの検証と型を、同じ定義から行うため。

## 振る舞い

### `generateEventId`

`globalThis.crypto.randomUUID()` の値を返す。ID の形式は実装の詳細なので、呼び出し側は文字列としてだけ扱う。ブラウザとサーバーのどちらにバンドルされても動く。

### `buildErrorContext`

例外から、次の項目を持つオブジェクトを返す。`ErrorEvent` の `context` に入れる JSON の元にする。

| 項目 | 内容 |
|---|---|
| `errorName` | `Error` なら `name`。それ以外は `typeof` の結果 (`string` など) |
| `errorMessage` | `Error` なら `message`。それ以外は `String(値)` |
| `errorStack` | `Error` で `stack` があるときだけ持つ。`Error` 以外では、キー自体を持たない |

## 理由

`buildErrorContext` に組み立てを集めているのは、報告の箇所ごとに手書きすると項目がばらつき、Admin で同じ観点で調べられなくなるため。
