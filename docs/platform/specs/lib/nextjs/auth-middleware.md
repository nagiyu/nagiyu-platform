---
sources:
  - libs/nextjs/src/middleware.ts
  - libs/nextjs/package.json
sources_hash: cd23a1ed2c65654528bc832d34987dd9da5cafb1a9066ececc0447cd74c9e04a
---

# 認証ミドルウェア

未認証のリクエストをサインインへ、権限のないリクエストを 403 の応答か画面へ振り分ける Next.js ミドルウェアを作る。`@nagiyu/nextjs` または `@nagiyu/nextjs/middleware` から import する。

## 使い方

`createAuthMiddleware(options?)` が、リクエストを受けて `NextResponse` を返す関数を返す。リクエストの `auth` は NextAuth が付ける。

| オプション | 内容 | 既定値 |
|---|---|---|
| `publicPaths` | 認証なしで通すパス (完全一致) | なし |
| `isPublicPath` | 認証なしで通すかを、パスから判定する関数。`publicPaths` と併用できる | なし |
| `signInPath` | サインインページのパス | `/signin` |
| `getSignInBaseUrl` | サインインページのオリジン。未認証のときに呼ばれる | なし (リクエストの URL のオリジン) |
| `getCallbackUrl` | サインイン後の戻り先 | 下の「サインインへのリダイレクト」 |
| `onAuthConfigError` | `getSignInBaseUrl` が空を返したときの応答 | 500 の JSON |
| `requiredPermission` | 認証済みのユーザーに追加で求める権限 | なし |
| `onForbidden` | 権限が足りないときの応答。`forbiddenPath` より優先する | 下の「権限なしの応答」 |
| `forbiddenPath` | 権限が足りないページアクセスの飛び先 | `/forbidden` |

```typescript
const authMiddleware = createAuthMiddleware({
    publicPaths: ['/api/health'],
    getSignInBaseUrl: () => process.env.NEXT_PUBLIC_AUTH_URL || process.env.NEXTAUTH_URL,
    requiredPermission: 'stocks:read',
});
```

## 振る舞い

リクエストは次の順で判定する。

| 順 | 条件 | 結果 |
|---|---|---|
| 1 | 環境変数 `SKIP_AUTH_CHECK` が文字列 `'true'` | 通す |
| 2 | パスが `publicPaths` に含まれる、または `isPublicPath` が真 | 通す |
| 3 | `request.auth` があり、`requiredPermission` がないか、満たしている | 通す |
| 4 | `request.auth` があり、`requiredPermission` を満たさない | 権限なしの応答 |
| 5 | `request.auth` がない | サインインへリダイレクト |

`requiredPermission` を満たすのは、`request.auth.user.roles` のうち、その権限を持つロールが 1 つでもあるとき。`roles` がない、または配列でなければ、ロールなしとして扱う。権限の判定は[ロールと権限](../common/roles-and-permissions.md)に従う。

### 権限なしの応答

`onForbidden` があれば、その戻り値を返す。なければパスで分ける。

| パス | 応答 |
|---|---|
| `/api` または `/api/` 配下 | 403 の JSON `{ error: 'FORBIDDEN', message: 'この操作を実行する権限がありません' }` |
| それ以外 (ページ) | `forbiddenPath` へのリダイレクト。元のパスと検索文字列を、クエリ `from` に入れる |

ページのリダイレクト先のオリジンは、環境変数 `APP_URL` が未設定 (`undefined`) のときだけリクエストの URL のオリジン。`APP_URL=""` のときは空文字のままになり、`forbiddenPath` の解決に失敗する。`/apixyz` のように接頭辞だけが一致するパスは API とみなさない。

### サインインへのリダイレクト

未認証は、`/api` 配下でも JSON にせず、サインインページへリダイレクトする。リダイレクト先は `{サインインのオリジン}{signInPath}?callbackUrl={戻り先}`。

| 項目 | 値 |
|---|---|
| サインインのオリジン | `getSignInBaseUrl` が返した値。オプションがなければリクエストの URL のオリジン |
| 戻り先 (既定) | `APP_URL` が空でなければ `{APP_URL}{パス}{検索文字列}`。空または未設定ならパスだけ (検索文字列を含まない) |

`getSignInBaseUrl` を渡したのに空を返したとき (環境変数の設定漏れ) は、サインインへ飛ばさず、ログに `NEXT_PUBLIC_AUTH_URL or NEXTAUTH_URL is not set` を出す。応答は `onAuthConfigError` の戻り値、なければ 500 の JSON `{ error: 'Authentication configuration error' }`。

## 理由

- 権限なしのページを rewrite ではなくリダイレクトにする。next-auth は `request.url` のオリジンを `AUTH_URL` に書き換えるため、rewrite 先が自分自身と一致せず、外部へのプロキシとして扱われてしまう。戻り先は `from` クエリで渡す
- 権限なしのリダイレクト先に `APP_URL` を優先する。ECS の中では `request.url` が内部のホスト名になりうるため、公開 URL に飛ばすには `APP_URL` が要る
- `/api` の権限なしは JSON の 403 にする。API の呼び出し側は、リダイレクトではなくステータスで分岐するため
