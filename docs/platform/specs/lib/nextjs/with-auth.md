---
sources:
  - libs/nextjs/src/auth.ts
sources_hash: 6f6e1b48bd5d6f05868648a875b9df1f93e12874c901ec57540141da0e7b1250
---

# 認証付きルートハンドラ

API ルートのハンドラを、認証と権限の確認で包む。`@nagiyu/nextjs` から import する。

`@nagiyu/common` にも同名の `getAuthError` があるが、こちらは `permission` を省略 (または `null`) でき、`Session` に限らず `user.roles` を持つセッションを受け取る。

## 使い方

| 関数 | 引数 | 戻り値 |
|---|---|---|
| `withAuth(auth, permission, handler)` | NextAuth の `auth` 関数、必要な権限 (権限を問わないなら `null`)、ハンドラ (第 1 引数がセッション、残りは元のハンドラの引数) | 認証と権限を確認してから `handler` を呼ぶハンドラ |
| `getAuthError(session, permission?)` | セッション (未認証なら `null`)、必要な権限 | エラー (`message` と `statusCode`)。問題がなければ `null` |
| `getOptionalSession(auth)` | `auth` 関数 | セッション。未認証なら `null` |
| `getSessionOrThrow(auth)` | `auth` 関数 | セッション。未認証なら `Error('UNAUTHORIZED')` を投げる |

`auth` 関数とセッションの型は、`user.roles` (文字列の配列) を持つ型であればよい。

```typescript
export const GET = withAuth(auth, 'stocks:read', async (session, request: NextRequest) => {
    return NextResponse.json({ data: 'success' });
});
```

## 振る舞い

`withAuth` が返すハンドラは、`auth()` でセッションを取り、`getAuthError` で確認する。

| 状態 | ステータス | 応答の `error` | 応答の `message` |
|---|---|---|---|
| 未認証 | 401 | `UNAUTHORIZED` | ログインが必要です |
| `permission` を満たさない | 403 | `FORBIDDEN` | この操作を実行する権限がありません |
| 問題なし | ハンドラの応答 | | |

- 権限は `user.roles` のいずれかが `permission` を持つかで判定する ([ロールと権限](../common/roles-and-permissions.md))
- `permission` が `null` なら、認証だけを確認する
- `auth()` とハンドラが投げた例外は握らず、そのまま投げ直す

## 理由

- 例外を 500 に変換しない。変換すると、例外を最後に受け止める層 ([API ルートのエラー報告](./api-error-reporting.md)) に届かず、障害が報告されなくなる。そのため、そのラッパーは `withAuth` の外側に置く
