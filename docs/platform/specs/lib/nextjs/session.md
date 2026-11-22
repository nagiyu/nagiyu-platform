---
sources:
  - libs/nextjs/src/session.ts
sources_hash: 710dd960caee3fcef8e69e422b6b760fb852024509f022a238fd2082b8c19d81
---

# セッション取得とテストセッション

サーバー側のセッション取得関数と、`/api/auth/session` を包むハンドラを作る。認証を飛ばすテスト (`SKIP_AUTH_CHECK=true`) のときは、実際の認証の代わりにテストセッションを返す。`@nagiyu/nextjs` または `@nagiyu/nextjs/session` から import する。

## 使い方

| 関数 | 内容 |
|---|---|
| `createSessionGetter({ auth, defaultRoles? })` | サーバー側で使う、セッションを返す関数を作る。未認証なら `null` を返す |
| `createClientSessionGetHandler(originalGet, { defaultRoles? }?)` | NextAuth の `handlers.GET` を包み、テスト時だけ `/api/auth/session` にテストセッションを返す GET ハンドラを作る |
| `resolveTestUser({ defaultRoles?, roles? }?)` | 環境変数からテストユーザーを作る |
| `parseTestUserRoles(value)` | `,` 区切りのロール文字列を配列にする |
| `createTestSessionExpires()` | テストセッションの有効期限 (ISO 8601) を作る |

| 定数 | 値 |
|---|---|
| `TEST_USER_ROLES_HEADER` | `x-test-user-roles` |
| `TEST_SESSION_TTL_MS` | 30 日 (ミリ秒) |

`createSessionGetter` の `auth` は、NextAuth の `auth` を `() => Promise<Session | null>` に絞って渡す。`auth` はミドルウェア用のオーバーロードを持ち、そのままでは代入できないため。戻り値の `Session` は共通ライブラリの型 ([ロールと権限](../common/roles-and-permissions.md)) で、サービスによらず揃う。

NextAuth の `app/api/auth/[...nextauth]/route.ts` では、`GET` を `createClientSessionGetHandler` で包んで export し、`POST` は `handlers` のものをそのまま export する。

```typescript
export const getSession = createSessionGetter({
    auth: auth as () => Promise<Session | null>,
    defaultRoles: ['user'],
});

export const GET = createClientSessionGetHandler((req: NextRequest) => handlers.GET(req), {
    defaultRoles: ['user'],
});
```

## 振る舞い

### セッションの取得

`createSessionGetter` が返す関数は、環境変数 `SKIP_AUTH_CHECK` で分かれる。

| `SKIP_AUTH_CHECK` | 動作 |
|---|---|
| `'true'` | `auth()` を呼ばず、テストセッションを返す |
| それ以外 | `auth()` を呼ぶ。結果がない、または `user` がなければ `null`、あればそのセッション |

### テストセッション

テストセッションは `SKIP_AUTH_CHECK` が `'true'` のときだけ作られ、本番の認証経路では使われない。

| 項目 | 値 |
|---|---|
| `user.id` | 環境変数 `TEST_USER_ID`。なければ `test-user-id` |
| `user.email` | 環境変数 `TEST_USER_EMAIL`。なければ `test@example.com` |
| `user.name` | 環境変数 `TEST_USER_NAME`。なければ `Test User` |
| `user.image` | 環境変数 `TEST_USER_IMAGE`。なければなし |
| `user.roles` | 下記 |
| `expires` | 現在から 30 日後 |

`roles` は、次の順で最初に値があるものを使う。

| 順 | 元 |
|---|---|
| 1 | リクエストヘッダ `x-test-user-roles` |
| 2 | 環境変数 `TEST_USER_ROLES` |
| 3 | `defaultRoles` |
| 4 | 空配列 |

ロール文字列は `,` で分け、各要素の前後の空白を除き、空の要素を捨てる。結果が空なら未設定として扱い、次の順に進む (`TEST_USER_ROLES=""` も `defaultRoles` に戻る)。`resolveTestUser` の `roles` オプションはヘッダ由来のロールを渡すためのもので、空配列なら未指定と同じ。

`createSessionGetter` は、ヘッダを `next/headers` の `headers()` から読む。リクエストの外 (ビルド・プリレンダなど) では `headers()` が例外を投げるため、握ってヘッダなしとして扱う。

### クライアント向けセッション API

`createClientSessionGetHandler` が返すハンドラは、次の両方を満たすときだけテストセッションを JSON で返し、それ以外は元の `GET` にそのまま渡す。

- `SKIP_AUTH_CHECK` が `'true'`
- リクエストのパスが `/api/auth/session`

ロールはリクエストのヘッダ `x-test-user-roles` から読み、解決の順はサーバー側と同じ。`image` がないときは `null` にする (`useSession()` が `null` を前提にするため)。

## 理由

- ヘッダでロールを差し替えられるのをサーバー側の `createSessionGetter` だけにすると、クライアント側 (`useSession()`) とロールの見え方が食い違う。そのため、同じ解決規則 (ヘッダ → `TEST_USER_ROLES` → `defaultRoles`) を、サーバー側とクライアント向け API の両方で使う
- ロール文字列の解釈 (分割・空白の除去・空要素の除去) を `parseTestUserRoles` に集め、環境変数とヘッダで同じ結果にする
- テストセッションの有効期間を 30 日にそろえる。E2E や長い手動確認の途中でセッションが切れないようにするため
