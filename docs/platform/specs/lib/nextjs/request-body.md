---
sources:
  - libs/nextjs/src/request-body.ts
sources_hash: 7a476ca943d4aecf03c65df3d6af5c2a1c51acb4b4ae9619f65c48a5cbefde1c
---

# リクエストボディの読み取り

リクエストボディを JSON のオブジェクトとして読む。`@nagiyu/nextjs` から import する。

## 使い方

`readJsonObjectBody(request)` は、`Request` を受け取り、結果を返す。例外は投げない。

| 戻り値 | 意味 |
|---|---|
| `{ ok: true, body }` | JSON のオブジェクトとして読めた。`body` の各項目は `unknown` |
| `{ ok: false }` | 読めなかった |

```typescript
const result = await readJsonObjectBody(request);
if (!result.ok) {
    return NextResponse.json({ error: 'INVALID_REQUEST', message: 'リクエストボディが不正です' }, { status: 400 });
}
const { name } = result.body;
```

## 振る舞い

次のどれかのとき、`ok: false` を返す。失敗の理由は区別しない。

- 本文が JSON として読めない (空の本文を含む)
- JSON が `null`、配列、またはオブジェクト以外 (文字列・数値・真偽値)
- 本文がすでに読み取り済みで、読み取りが失敗した

また、次のことはしない。

- `body` の項目の型の検証 (呼び出し側が確かめる)
- 400 の応答の組み立て (エラーコードとメッセージは呼び出し側が決める)
- エラーの報告

## 理由

- 例外ではなく結果を返す。読み取りの失敗は利用者の入力の誤りで、呼び出し側が自前の 400 を組み立てるため。例外のまま汎用の catch に落ちると 500 になり、エラーの通報に利用者の誤入力が混ざる
- 失敗の理由を区別しない。呼び出し側は、どの失敗でも同じ 400 を返すため
