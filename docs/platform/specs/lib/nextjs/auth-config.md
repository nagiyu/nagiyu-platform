---
sources:
  - libs/nextjs/src/auth-config.ts
  - libs/nextjs/src/types/next-auth.d.ts
  - libs/nextjs/package.json
sources_hash: 6f6380ff74f787abd19dad5f99ed341fb305e307e64b4f5cbccc2d46e2176847
---

# NextAuth の設定

NextAuth の共通設定 (セッション・Cookie・コールバック・サインインページ) を作り、`next-auth` の型を拡張する。関数は `@nagiyu/nextjs` から、型の拡張は `@nagiyu/nextjs/types/next-auth` から import する。providers は含まず、サービス側で足す。

## 使い方

| 関数 | 戻り値 | 用途 |
|---|---|---|
| `createServiceAuthConfig(options?)` | `session` / `cookies` / `callbacks` / `pages` | ログインを別のサービス (Auth サービス) に任せる側。サインインページを Auth サービスへ向ける |
| `createAuthConfig(options?)` | `session` / `cookies` / `callbacks` | ログインを受け付ける側 (Auth サービス)。`jwt` コールバックを渡せる |
| `createAuthSessionConfig()` | `session` | セッション設定だけ |
| `createAuthCookies(nodeEnv?, nagiyuEnv?)` | `cookies` | Cookie の名前と属性だけ |
| `createAuthCookieOptions(nodeEnv?, nagiyuEnv?)` | Cookie に共通の属性 | 属性だけ |
| `createAuthCallbacks(options?)` | `callbacks` | `jwt` / `session` コールバックだけ |

オプション:

| オプション | 対象 | 内容 | 既定値 |
|---|---|---|---|
| `includeSubAsUserIdFallback` | `createServiceAuthConfig` / `createAuthConfig` / `createAuthCallbacks` | `token.userId` が空のとき `token.sub` を `session.user.id` に使う | `false` |
| `jwt` | `createAuthConfig` / `createAuthCallbacks` | `jwt` コールバック。渡すと、その戻り値が token になる | token をそのまま返す |
| `nodeEnv` | `createAuthConfig` | 環境の判定に使う `NODE_ENV` の代わりの値 | `process.env.NODE_ENV` |
| `nagiyuEnv` | `createAuthConfig` | 環境の判定に使う `NAGIYU_ENV` の代わりの値 | `process.env.NAGIYU_ENV` |

`createServiceAuthConfig` は `includeSubAsUserIdFallback` だけを受け取り、`jwt` は渡せない。

```typescript
import { createServiceAuthConfig } from '@nagiyu/nextjs';

export const { handlers, auth } = NextAuth({
    providers: [],
    ...createServiceAuthConfig({ includeSubAsUserIdFallback: true }),
});
```

## 振る舞い

### セッション

| 項目 | 値 |
|---|---|
| 方式 | `jwt` |
| 有効期間 | 30 日 |

### サインインページ

`createServiceAuthConfig` は `pages.signIn` を設定する。

| 環境変数 `NEXT_PUBLIC_AUTH_URL` | `pages.signIn` |
|---|---|
| 設定あり | `{NEXT_PUBLIC_AUTH_URL}/signin` |
| 未設定 | `/signin` |

`createAuthConfig` は `pages` を返さない。

### コールバック

`session` コールバックは、token から `session.user` を次のように作る。

| `session.user` の項目 | 元 | 空のとき |
|---|---|---|
| `id` | `token.userId`。空なら `token.sub` (`includeSubAsUserIdFallback` が `true` のときだけ) | 空文字 |
| `email` | `token.email` | 空文字 |
| `name` | `token.name` | 空文字 |
| `image` | `token.picture` | `undefined` |
| `roles` | `token.roles` | 空配列 |

`jwt` コールバックは、`jwt` オプションがあればそれを呼んだ戻り値を、なければ受け取った token をそのまま返す。

### Cookie

環境は次の順で決まる。

| 条件 | ドメイン | 名前の末尾 | `secure` |
|---|---|---|---|
| `NODE_ENV` が `development` (ローカル開発) | なし | なし | `false` |
| `NAGIYU_ENV` が `dev` | `.dev.nagiyu.com` | `.dev` | `true` |
| 上記以外 (`NAGIYU_ENV` が `prod`・未設定・ほかの値) | `.nagiyu.com` | なし | `true` |

Cookie は 6 種類で、名前の `{末尾}` は上の表の名前の末尾。

| 用途 | 名前 |
|---|---|
| セッショントークン | `__Secure-authjs.session-token{末尾}` |
| コールバック URL | `__Secure-authjs.callback-url{末尾}` |
| CSRF トークン | `__Host-authjs.csrf-token{末尾}` |
| state | `__Secure-authjs.state{末尾}` |
| PKCE コード検証子 | `__Secure-authjs.pkce.code_verifier{末尾}` |
| nonce | `__Secure-authjs.nonce{末尾}` |

属性はすべての Cookie で共通。

| 属性 | 値 |
|---|---|
| `httpOnly` | `true` |
| `sameSite` | `lax` |
| `path` | `/` |
| `domain` | 上の表のドメイン。CSRF トークンだけは常になし |
| `secure` | 上の表の値 |

### 型の拡張

`@nagiyu/nextjs/types/next-auth` は型だけを提供し、次を拡張する。

| 対象 | 追加するもの |
|---|---|
| `Session` | `user` の型を、共通ライブラリの `SessionUser` にする |
| `User` | `id` / `email` / `name` / `image?` / `roles?` |
| `JWT` | `userId?` / `googleId?` / `email?` / `name?` / `picture?` / `roles?` / `rolesRefreshedAt?` (ロールを最後に取得した時刻、epoch ミリ秒) |

## 理由

- 環境の判定に `NAGIYU_ENV` を使う。Next.js はビルド時に `process.env.NODE_ENV` を `production` に置き換え、`NEXT_PUBLIC_` の環境変数もビルド時の値に固定する。そのため、デプロイ後のサーバー側では、これらから dev と prod を区別できない。ビルド時に置き換えられない実行時の環境変数が要る。`NODE_ENV` が `development` かどうかだけは、ローカル開発が `next build` を通らないので `NODE_ENV` で判定できる
- `NAGIYU_ENV` が未設定なら prod として扱う。本番の設定漏れで dev 扱いになると、Cookie のドメインが変わり、サービス間のシングルサインオンが壊れるため
- Cookie のドメインを `.nagiyu.com` / `.dev.nagiyu.com` にするのは、サービス間でセッションを共有するため。名前に `.dev` を付けるのは、dev と prod の Cookie を分け、環境の取り違えを防ぐため
- CSRF トークンの Cookie だけ `__Host-` の接頭辞を使い、ドメインを付けない。`__Host-` の Cookie はドメインを指定できないというブラウザの規則があるため
