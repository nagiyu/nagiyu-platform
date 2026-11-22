---
sources:
  - libs/nextjs/src/error-reporting.ts
sources_hash: 80036e4f449205b84ad7b789167bf87c3392eda0c9da746128f1bcc8e993da22
---

# API ルートのエラー報告

API ルートのハンドラを包み、想定外の例外 (500 以上になるもの) だけを報告するラッパーを作る。`@nagiyu/nextjs` から import する。報告されるエラーは[エラーイベント](../common/error-event.md)の入力になる。

## 使い方

`createApiErrorReporting(options)` が、`withApiErrorReporting(title, handler)` を返す。

| オプション | 内容 | 既定値 |
|---|---|---|
| `serviceId` | 報告に付けるサービスの識別子 | 必須 |
| `report` | 報告する関数。`ApiErrorReportInput` を受け取る | 必須 |
| `toErrorResponse` | 例外をレスポンスへ変換する関数 | `handleApiError` ([エラーレスポンス](./error-response.md)) |

`ApiErrorReportInput`:

| 項目 | 値 |
|---|---|
| `serviceId` | オプションの `serviceId` |
| `severity` | `error` |
| `title` | `withApiErrorReporting` に渡した `title` |
| `message` | 例外のメッセージ |
| `context` | リクエストの情報と、例外から作ったコンテキスト |

```typescript
const withApiErrorReporting = createApiErrorReporting({
    serviceId: 'my-service',
    report: reportErrorEvent,
});

export const GET = withApiErrorReporting('GET /api/items', async (request: NextRequest) => {
    return NextResponse.json(await listItems());
});
```

`handler` の引数は変えずに渡すので、[認証付きルートハンドラ](./with-auth.md)の `withAuth` などと重ねて使える。

## 振る舞い

`handler` が例外を投げたとき、`toErrorResponse` でレスポンスに変換して返す。変換後のステータスが 500 以上なら、返す前に `report` を呼んで待つ。

| 場合 | 報告 |
|---|---|
| `handler` が正常にレスポンスを返した (4xx / 5xx を含む) | しない |
| 例外が 4xx のレスポンスに変換された (404 や 400 など) | しない |
| 例外が 500 以上のレスポンスに変換された | する |

`context` の中身:

| 項目 | 内容 |
|---|---|
| `method` / `pathname` | `handler` の第 1 引数が `Request` のときだけ入る。URL を解析できないときは `method` だけ。クエリは個人情報を含みうるため入れない |
| そのほか | `buildErrorContext` の項目 (`errorName` / `errorMessage` / `errorStack`)。[エラーイベントの型とヘルパー](../common/error-event.md)にある |

`report` が失敗 (例外) しても、レスポンスは変わらない。例外は握り、`[withApiErrorReporting] エラー報告に失敗しました` をログに出す。`toErrorResponse` が例外を投げたときは握らず、そのまま投げ返す。

## 理由

- 報告は、例外を最後に受け止める層だけが行う方針のため、ルートの入口で 1 回だけ行う
- `report` を、呼び出し側から渡させる。`@nagiyu/nextjs` は `@nagiyu/aws` に依存しないため、エラーイベントの書き込みを直接呼べない。`ApiErrorReportInput` は、`@nagiyu/aws` の `ReportErrorEventInput` に代入できる形にそろえてある
- `toErrorResponse` を差し替えられるようにする。サービス固有のエラー形式を保つため
- 正常に返した 4xx / 5xx は報告しない。ハンドラ自身が返したものは想定内のため
