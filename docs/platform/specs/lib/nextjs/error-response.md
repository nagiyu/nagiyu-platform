---
sources:
  - libs/nextjs/src/error.ts
sources_hash: af5c070dd31c75b287bcdd5810036a501290c89b11a695d0572f8e6146c9fda8
---

# エラーレスポンス

例外を API のエラーレスポンスに変換する。`@nagiyu/nextjs` から import する。レスポンスの形 (`error` と `message`) と、エラーコードは[エラーコード](../common/error-codes.md)に従う。

## 使い方

| 関数 | 引数 | 戻り値 |
|---|---|---|
| `handleApiError(error)` | 例外 (`unknown`) | 例外の種類に応じたステータスのエラーレスポンス |
| `createErrorResponse(status, error, message)` | ステータス、エラーコード、メッセージ | `{ error, message }` を本文にしたレスポンス |

```typescript
export async function GET() {
    try {
        return NextResponse.json(await repository.getById('123'));
    } catch (error) {
        return handleApiError(error);
    }
}
```

## 振る舞い

`handleApiError` は、まず `console.error('API Error:', error)` でログに出し、次の順で最初に当たるものに変換する。`message` は例外のメッセージで、空なら表の既定のメッセージ。

| 判定 | ステータス | `error` | 既定のメッセージ |
|---|---|---|---|
| `PaginationValidationError` のインスタンス | 400 | `VALIDATION_ERROR` | 入力データが不正です |
| `Error` で、名前に `NotFound` を含む | 404 | `NOT_FOUND` | データが見つかりませんでした |
| `Error` で、名前に `AlreadyExists` を含む | 400 | `ALREADY_EXISTS` | 指定されたデータは既に存在しています |
| `Error` で、名前に `Invalid` を含む | 400 | `VALIDATION_ERROR` | 入力データが不正です |
| 上記以外 (`Error` でないものを含む) | 500 | `INTERNAL_ERROR` | 内部エラーが発生しました |

- 500 の `message` は例外のメッセージを使わず、常に既定のメッセージにする
- エラーの名前 (`error.name`) の一部で判定するので、エラークラスを import せずに、名前が合うエラーを変換できる
