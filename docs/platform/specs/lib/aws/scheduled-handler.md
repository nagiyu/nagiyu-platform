---
sources:
  - libs/aws/src/lambda/scheduled-handler.ts
sources_hash: dea2b2f1657d981d4fa29adb678d241819056329661077b7b6cf644278e8cfcb
---

# 定期実行 Lambda の骨格

EventBridge から定期実行される Lambda の共通の骨格 `createScheduledHandler`。開始ログ、失敗時のログとエラー報告 ([エラーの報告](./error-reporting.md)) を受け持ち、失敗したら元の例外を投げ直す。`@nagiyu/aws` から import する。

## 使い方

`createScheduledHandler(options, fn)` は、`event` を受け取って `fn` の結果を返すハンドラーを返す。

| 引数 | 内容 |
|---|---|
| `options.serviceId` | エラー報告に渡すサービス ID |
| `options.name` | ログの接頭辞に使うバッチ名。`[{name}]` の形で付く |
| `options.errorTitle` | エラー報告のタイトル |
| `options.getLogContext` (省略可) | `event` からログと報告の `context` を作る関数 |
| `fn` | 本処理。`event` を受け取り、結果を返す |

型引数は、`event` の型 (既定は `ScheduledEvent`) と、結果の型 (既定は `HandlerResponse`)。

```ts
export const handler = createScheduledHandler(
  { serviceId: 'my-service', name: 'notify', errorTitle: '通知バッチが失敗しました' },
  async () => {
    // 本処理
    return { statusCode: 200, body: 'OK' };
  }
);
```

### ScheduledHandlerError

部分的な失敗など、エラー報告のタイトルや `context` を呼び出し側で指定したい失敗に投げる例外。`new ScheduledHandlerError(message, { title?, context? })`。

### 型

| 型 | 内容 |
|---|---|
| `ScheduledEvent` | EventBridge のスケジュールルールが Lambda に渡すイベント (`id`、`time`、`detail` など) |
| `HandlerResponse` | `{ statusCode, body }` |

## 振る舞い

1. 開始ログ `[{name}] バッチ開始` を、`context` つきで出力する
2. `fn` を呼び、結果をそのまま返す
3. `fn` が例外を投げたら、次を行って、元の例外をそのまま投げ直す
    1. 失敗ログ `[{name}] バッチ失敗` を、`context` とエラーのメッセージつきで出力する
    2. エラーを報告する

### context

| 状況 | `context` |
|---|---|
| `getLogContext` あり | その戻り値 |
| `getLogContext` なし | `event` が文字列の `id` を持てば `eventId`、文字列の `time` を持てば `eventTime`。持たなければ空 |

### エラー報告の内容

| 項目 | 値 |
|---|---|
| `severity` | `error` |
| `title` | `ScheduledHandlerError` の `title`。なければ `errorTitle` |
| `message` | 例外のメッセージ |
| `context` | 上の `context` に、`ScheduledHandlerError` の `context`、さらに例外から作る `errorName`、`errorMessage`、`errorStack` の順に重ねる。同じキーは後のものが勝つ |

- 報告は補助的な手段で、`reportErrorEvent` は例外を投げないので、元の例外を投げ直すことを妨げない
- 完了ログは出さない。統計を持つ `fn` が出す

## 理由

- 失敗したときは、500 を返さずに例外を投げる。500 を返して正常終了すると、Lambda としては成功扱いになり、`Errors` メトリクスが増えない。`Errors` アラーム、DLQ、非同期呼び出しの再試行が働かなくなるため
- 部分的な失敗は、`ScheduledHandlerError` で報告の内容だけを上書きする。`fn` の中で個別に報告してから普通の例外を投げると、この骨格がもう一度報告して、二重になるため
- `event` が `ScheduledEvent` でない呼び出し (EventBridge 以外から呼ぶ場合) でも動くよう、既定の `context` は、文字列の `id` と `time` が取れるときだけ作る
