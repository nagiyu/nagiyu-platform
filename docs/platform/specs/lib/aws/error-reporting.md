---
sources:
  - libs/aws/src/error-events/writer.ts
  - libs/aws/src/error-events/mapper.ts
  - libs/aws/src/error-events/validation.ts
  - libs/aws/src/error-events/dynamodb-writer.ts
  - libs/aws/src/error-events/in-memory-writer.ts
  - libs/aws/src/error-events/in-memory-store.ts
  - libs/aws/src/error-events/factory.ts
  - libs/aws/src/error-events/report.ts
  - libs/aws/src/error-events/with-error-reporting.ts
sources_hash: 06a2edcf4fde08542d4a3cb8f24d18989e6e229e7a205f9fd4e30fa90fcce735
---

# エラーの報告

エラーイベント ([ErrorEvent](../../term/error-event.md)) を DynamoDB に書き込む SDK。書き込みの `ErrorEventWriter`、1 件を報告する `reportErrorEvent`、例外を報告する `createErrorReporter` と `withErrorReporting` がある。保存先のテーブルと権限は [エラーイベントのテーブル](../../data/error-events.md) にある。`@nagiyu/aws` から import する。

## 使い方

### reportErrorEvent

エラーイベントを 1 件書き込み、書いたイベントを返す。`Promise<ErrorEvent | null>`。

| 入力の項目 | 内容 |
|---|---|
| `serviceId`、`severity`、`title`、`message` | 必須 |
| `source` | 既定は `application` |
| `context` | 補足情報 (オブジェクト)。JSON の文字列にして保存する |
| `occurredAt` | ISO 8601 の文字列か、エポックミリ秒。既定は呼び出し時点 |
| `eventId` | 既定は自動採番 |

### createErrorReporter

`createErrorReporter({ serviceId })` は、`serviceId` を固定したレポーターを返す。

| メンバー | 内容 |
|---|---|
| `report(title, error, options?)` | 例外を報告する。`Promise<ErrorEvent \| null>` |
| `onError(title)` | `(error) => Promise<void>` を返す。ルートのファクトリなどの `onError` に渡す用 |

`options` は次のとおり。

| 項目 | 既定値 |
|---|---|
| `severity` | `error` |
| `message` | 例外のメッセージ |
| `context` | なし |

```ts
const reporter = createErrorReporter({ serviceId: 'stock-tracker' });
await reporter.report('取得に失敗しました', error, { context: { market }, severity: 'warning' });
```

### withErrorReporting

`withErrorReporting(options, fn)` は、Lambda や Batch のエントリポイントの定型のエラー処理を包む。戻り値は `Promise<T | undefined>`。

| `options` の項目 | 既定値 | 内容 |
|---|---|---|
| `serviceId`、`title` | 必須 | エラーイベントの項目 |
| `severity` | `error` | |
| `context` | なし | 補足情報 |
| `exitOnError` | 偽 | 真なら、報告のあと `process.exit(1)` で終了する |
| `runIfNotTest` | 偽 | 真なら、環境変数 `NODE_ENV` が `test` のとき `fn` を実行しない |
| `onSuccess` | なし | `fn` の成功後に呼ぶ |
| `onError` | なし | 報告のあとに呼ぶ追加の処理 (ジョブの状態を失敗に更新するなど) |

```ts
withErrorReporting(
  { serviceId: 'my-service', severity: 'critical', title: '処理失敗', exitOnError: true, runIfNotTest: true },
  main
);
```

### Writer

| クラス・関数 | 内容 |
|---|---|
| `ErrorEventWriter` | `put(event)` を持つインターフェース |
| `DynamoDBErrorEventWriter` | `new DynamoDBErrorEventWriter(docClient, tableName)` |
| `InMemoryErrorEventWriter` | `new InMemoryErrorEventWriter(store?)`。書いたイベントを `getRecords()` で返し、`reset()` で消す (テスト用) |
| `createErrorEventWriter` | `(docClient?, tableName?)`。環境に応じた Writer を返す |
| `resetErrorEventWriter` | Writer と InMemory の共有ストアを破棄する (テスト用) |
| `getInMemoryErrorEventStore`、`resetInMemoryErrorEventStore` | InMemory の共有ストアの取得と破棄 |
| `ErrorEventMapper` | [EntityMapper](./entity-mapper.md) の実装。`buildErrorEventPK`、`buildErrorEventSK` も export する |

## 振る舞い

### reportErrorEvent

- 環境変数 `ERROR_EVENTS_TABLE_NAME` がなければ、ログを出して `null` を返す
- 環境変数 `USE_IN_MEMORY_DB` が `true` なら InMemory の Writer、そうでなければ DynamoDB の Writer に書く ([リポジトリの登録と生成](./repository-registry.md))
- 書き込みに失敗しても例外を投げず、ログを出して `null` を返す。報告は補助的な手段で、本処理を巻き込まないため
- `context` を JSON にできないとき (循環参照、`BigInt` など) は、ログを出し、`{"contextSerializeError": "{原因}"}` を保存して報告を続ける。`context` がなければ `{}`
- `occurredAt` が日時として解釈できなければ、書き込まずに `null` を返す

### createErrorReporter と withErrorReporting

- 報告の `context` は、呼び出し側の `context` に、例外から作る 3 つの項目を重ねたもの。同じキーがあれば、例外から作る項目が勝つ

    | キー | 内容 |
    |---|---|
    | `errorName` | `Error` なら `name`。そうでなければ値の型 |
    | `errorMessage` | 例外のメッセージ |
    | `errorStack` | `Error` のスタック。`Error` でなければキーごとない |

- `message` は、`createErrorReporter` では `options.message`、なければ例外のメッセージ。`withErrorReporting` では、例外のメッセージ。`context.errorMessage` にも同じものが入る

`withErrorReporting` の流れは次のとおり。

1. `runIfNotTest` が真で `NODE_ENV` が `test` なら、`fn` を呼ばずに `undefined` を返す
2. `fn` を呼ぶ。成功したら `onSuccess` を呼び、`fn` の結果を返す
3. 失敗したら、`reportErrorEvent` で報告し、`onError` があれば呼ぶ
4. `exitOnError` が真なら、`process.exit(1)` で終了する (投げ直さない)。偽なら、元の例外を投げ直す

- `onSuccess` が失敗した場合も、同じく失敗として報告する
- `onError` が例外を投げると、その例外が伝わり、終了と投げ直しは行われない

### 書き込む内容

| 項目 | 内容 |
|---|---|
| キー | `PK` は `ERROR_EVENT#{serviceId}`、`SK` は `OCCURRED#{発生時刻 (ISO 8601)}#{eventId}`。全件横断の GSI のキーは `ERROR_EVENT_ALL` と `SK` |
| TTL | 発生時刻 (`occurredAt`) の 180 日後。エポック秒で、属性名は `TTL` |
| 保存の形 | 項目の一覧は [エラーイベントのテーブル](../../data/error-events.md) |

- 書き込み前に、`eventId`、`serviceId`、`title` が空でないこと、`occurredAt` が日時として解釈できる数値であることを確かめる。満たさなければ `Error` を投げる
- 書き込みは [EntityStore](./entity-store.md) の `create` で行う。同じキーのイベントがあれば、上書きせず拒否する
- 書いたイベントは変更できない。mapper の `toUpdateAttributes` は、どの項目の変更も拒否する
- 読み出し (`toEntity`) は、新名を優先し、小文字始まりの旧名と、ISO 文字列の `occurredAt` も受け付ける。不正な Item は除外せず、`InvalidEntityDataError` にする
- InMemory の共有ストアは、`globalThis` に保持する。Writer と読み取り側は別のパッケージで、Next.js の dev ではモジュールがバンドルごとに複製され、モジュール内の変数では同じストアを指せないため

### 個人情報

`title`、`message`、`context` は、渡された値をそのまま保存する。個人情報のマスクはしない。

## 理由

- 書き込みに失敗しても例外を投げず、`null` を返す。エラーの報告が原因で、本処理が失敗しないようにするため
- 例外の項目 (`errorName`、`errorMessage`、`errorStack`) の組み立てを 1 か所にし、呼び出し側の同名のキーより優先する。報告箇所ごとに手書きすると項目が欠け、Admin で調べるときに stack や message が見つからなくなるため
- 保存形式 (キー、属性名) の変換を `ErrorEventMapper` だけが持ち、書く側と読む側の両方が使う。別々に持つと、項目を足したときに片方だけが直るため
- TTL を発生時刻の起点にする。書き込みの時刻ではなく、発生した時刻から一定期間で消すため
