---
sources:
  - libs/nextjs/src/pagination.ts
sources_hash: 1169b42da1adb1290f893f542eac60d98bb31753ff50e6a3182287ac102b1964
---

# ページネーション

一覧 API のクエリからページネーションのパラメータを読み、ページネーション付きのレスポンスを作る。`@nagiyu/nextjs` から import する。レスポンスの型 `PaginatedResponse` は[エラーコード](../common/error-codes.md)にある。

## 使い方

| 関数 | 引数 | 戻り値 |
|---|---|---|
| `parsePagination(request)` | `NextRequest` | `{ limit, cursor? }` |
| `createPaginatedResponse(items, lastKey?)` | 項目の配列、次のページのキー | ページネーション付きの JSON レスポンス |

```typescript
export async function GET(request: NextRequest) {
    const pagination = parsePagination(request);
    const result = await repository.getByUserId(userId, pagination);
    return createPaginatedResponse(result.items, result.nextCursor);
}
```

## 振る舞い

### クエリの読み取り

| クエリ | 戻り値の項目 | 既定値 | 条件 |
|---|---|---|---|
| `limit` | `limit` | 50 (クエリがない、または空文字のとき) | 整数で 1 から 100 |
| `lastKey` | `cursor` | なし | 空文字ならなし |

- `limit` は `parseInt` (10 進) で読むため、`10abc` は 10、`1.9` は 1 として受け付ける。数値として読めない、または範囲外なら `PaginationValidationError` を投げる (`code` は `INVALID_LIMIT`、メッセージは「limit は 1 から 100 の間で指定してください」)。`handleApiError` が 400 の `VALIDATION_ERROR` に変換する ([エラーレスポンス](./error-response.md))
- `cursor` は `lastKey` の文字列をそのまま返し、デコードしない。戻り値は、リポジトリのページネーションのオプションとして渡せる

### レスポンス

```json
{ "items": [], "pagination": { "count": 0, "lastKey": "..." } }
```

- `count` は `items` の件数
- `lastKey` は、引数があるときだけ入れる (空なら項目ごと省く)

## 理由

- `cursor` をデコードしない。エンコードの形式はリポジトリが持っていて、ここで解釈すると二重に変換することになるため
