---
sources:
  - libs/ui/src/utils/auth.ts
sources_hash: 27cb308800b5129d9fc27a31428912a43574a1756bc4edfdb6b652f20a3f07f1
---

# auth サービスへの URL

auth サービスのサインイン・サインアウト・権限の更新・プランの各画面への URL を作る関数。`@nagiyu/ui` から import する。

## 使い方

```ts
const url = buildSignOutUrl('https://auth.example.com', window.location.origin);
// https://auth.example.com/api/auth/signout?callbackUrl=https%3A%2F%2F...
```

| 関数 | 作る URL のパス | 用途 |
|---|---|---|
| `buildSignInUrl(authUrl, callbackUrl?)` | `/signin` | 未ログインの利用者をサインインへ誘導する |
| `buildSignOutUrl(authUrl, callbackUrl?)` | `/api/auth/signout` | サインアウトする |
| `buildRefreshUrl(authUrl, callbackUrl?)` | `/refresh` | 管理者がロールを付与した後に、セッションを取り直す |
| `buildPlansUrl(authUrl, callbackUrl?)` | `/plans` | プランの画面へ誘導する。購入や変更のあと `callbackUrl` へ戻れる |

| 引数 | 内容 |
|---|---|
| `authUrl` | auth サービスのベース URL |
| `callbackUrl` | 遷移の後に戻る URL。省略または空文字なら付けない |

## 振る舞い

- `authUrl` の末尾のスラッシュは取り除いてから、パスをつなぐ。スラッシュが二重にならない
- `callbackUrl` があれば、`?callbackUrl=` に URL エンコードして付ける
- `authUrl` が空文字なら、`/signin` のような同じオリジンの相対パスになる。auth サービス自身が使うとき
- 副作用はない。遷移は呼び出し側 ([Header](./header.md) のログアウト、[SessionHeader](./session-header.md)、[エラー画面](./feedback-views.md)) が行う

## 理由

- サインアウトは、Cookie の発行元である auth サービスに集約する。サービスは自前で NextAuth のサインアウトを受けず、この URL へ遷移する。サービス側のサインアウトは、NextAuth が自身の公開 URL を持たないとき、内部のホスト名 (`ip-10-x-x-x.ec2.internal:3000` など) へリダイレクトして、名前解決に失敗することがあるため
