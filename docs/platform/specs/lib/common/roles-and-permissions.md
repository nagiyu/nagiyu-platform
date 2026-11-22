---
sources:
  - libs/common/src/auth/types.ts
  - libs/common/src/auth/roles.ts
  - libs/common/src/auth/permissions.ts
  - libs/common/src/auth/auth-error.ts
sources_hash: d07e8cda775b5fcffc2fca1af28f91e87b933b049c24efa903e688fca6331ac1
---

# ロールと権限

ユーザー・セッションの型と、ロール (`ROLES`)、権限の判定をまとめた部品。ロールはコードで定義し、DB には持たない。メインの `@nagiyu/common` から import する。

## 型

| 型 | 内容 |
|---|---|
| `User` | DB に保存するユーザー。`userId` (UUID v4)、`googleId`、`email`、`name`、`roles` (ロール ID の配列)、`roleGrants` (課金の権利。一度も付けていないユーザーには無い)、`stripeCustomerId`、`createdAt` / `updatedAt` (Unix ミリ秒)、`lastLoginAt` (任意)、`picture` (任意) |
| `SessionUser` | JWT から復元する、リクエスト時点の認証済みユーザー。`id`、`email`、`name`、`image` (任意)、`roles` だけを持つ。`googleId` や作成日時など、JWT に載らない値は持たない |
| `Session` | `user` (`SessionUser`) と `expires` (ISO 8601 の文字列) |
| `Permission` | `{resource}:{action}` 形式の権限の文字列の型 |
| `Role` | `ROLES` のキーの型 |

`roleGrants` の型は [課金の権利](./role-grants.md) にある。

## ロール

`ROLES` は、ロール ID をキーにした定義の表。各ロールは `id`、`name` (表示名)、`description`、`permissions` を持つ。有料ロールだけ `billing` (サービス ID と段の順位) を持つ。`description` は管理画面のロール割り当てにそのまま表示される。

| ロール ID | 表示名 | 権限 | billing |
|---|---|---|---|
| `admin` | 管理者 | `users:read`、`users:write`、`roles:assign`、`notifications:write`、`errors:read` | なし |
| `user-manager` | ユーザー管理者 | `users:read`、`users:write` | なし |
| `stock-viewer` | Stock 閲覧者 | `stocks:read` | なし |
| `stock-user` | Stock ユーザー | `stocks:read`、`stocks:write-own` | なし |
| `stock-admin` | Stock 管理者 | `stocks:read`、`stocks:write-own`、`stocks:manage-data` | なし |
| `livetalk-user` | LiveTalk ユーザー | `livetalk:chat` | なし |
| `livetalk-admin` | LiveTalk 管理者 | `livetalk:chat`、`livetalk:admin` | なし |
| `livetalk-standard` | LiveTalk スタンダード | `livetalk:standard` | `livetalk` / 段 1 |
| `quick-clip-standard` | Quick Clip スタンダード | `quick-clip:standard` | `quick-clip` / 段 1 |
| `quick-clip-pro` | Quick Clip プロ | `quick-clip:standard`、`quick-clip:pro` | `quick-clip` / 段 2 |
| `quick-clip-unlimited` | Quick Clip 使い放題 | `quick-clip:unlimited` | なし |
| `billing-tester` | 課金のテスト | `billing:test` | なし |

- `Permission` 型には `auth:read` と `auth:write` もあるが、どのロールにも割り当てていない
- `livetalk-admin` が `livetalk:chat` を含むのは、チャットの権限を要求する処理を管理者も通すため
- `quick-clip-pro` が `quick-clip:standard` を含むのは、上の段が下の段の権限を含むため
- `quick-clip-unlimited` と `billing-tester` は、売らず課金とも結びつけないので `billing` を持たない。`billing-tester` は本番以外の環境でテスト用の決済を始めるためのロールで、管理者の権限とは分けてある

### ロールの参照

| 関数・定数 | 内容 |
|---|---|
| `VALID_ROLES` | `ROLES` のキーの配列。API の入力検証に使う |
| `getRoleName(roleId)` | 表示名を返す。`ROLES` に無い ID は、その ID をそのまま返す |
| `getRoleDescription(roleId)` | 説明を返す。`ROLES` に無い ID は `undefined` |

- 保存データと API はロール ID のまま扱い、画面に出すときだけ名前と説明に変換する。未定義の ID でも表示が消えないよう、`getRoleName` は ID を返す
- どちらの関数も `ROLES` 自身のキーだけを引く。外部由来の文字列が `constructor` のようにプロトタイプのプロパティと同名でも拾わない

### 有料ロール

有料ロールのサービスと段は `billing` が決める。ロール ID の文字列からは読み取らない。

| 関数・定数 | 内容 |
|---|---|
| `BILLING_SERVICES` | 有料サービスの ID と表示名。`livetalk` は LiveTalk、`quick-clip` は Quick Clip |
| `PAID_ROLES` | 有料ロール ID の配列。サービス ID の順 (`localeCompare`)、同じサービスの中では段の昇順。`livetalk-standard`、`quick-clip-standard`、`quick-clip-pro` の順 |
| `getBillingServiceId(roleId)` | 有料ロールのサービス ID。有料ロールでなければ `undefined` |
| `getBillingTierRoleIds(serviceId)` | そのサービスの有料ロール ID を下の段から順に返す。知らないサービスは空配列 |
| `compareBillingTier(a, b)` | 同じサービスの有料ロール 2 つの段を比べる。a が下なら負、同じなら 0、a が上なら正 |

`compareBillingTier` は、次のとき `Error` を投げる。

| 条件 | メッセージ |
|---|---|
| どちらかが有料ロールでない | 有料ロールではないため、段を比較できません |
| サービスが違う | 別のサービスの有料ロールどうしは、段を比較できません |

`PAID_ROLES` は、権利を付けるときの検証と選択肢にだけ使う。権利の読み取りや有効なロールの算出では絞らない。

## 権限の判定

| 関数 | 引数 | 戻り値・失敗したとき |
|---|---|---|
| `hasPermission` | ロール ID の配列、権限 | いずれかのロールがその権限を持てば `true`。`ROLES` に無い ID は権限なしとして扱う |
| `hasUserPermission` | `{ roles?: unknown }` または `null` / `undefined`、権限 | `hasPermission` と同じ。ユーザーが無い、`roles` が配列でないときは例外にせず `false` |
| `requirePermission` | ロール ID の配列、権限 | 権限があれば何も返さない。無ければ `Permission denied: {権限}` の `Error` を投げる |
| `hasAnyPermission` | ロール ID の配列、権限の配列 | どれか 1 つでも持てば `true`。空の配列は `false` |
| `hasAllPermissions` | ロール ID の配列、権限の配列 | すべて持てば `true`。空の配列は `true` |

```typescript
const canChat = hasUserPermission(session?.user, 'livetalk:chat');
```

- `hasUserPermission` が `roles` を `unknown` で受けるのは、next-auth の型拡張に依存せず、未ログイン・`roles` 未設定・想定外の型のどれでも例外にしたくないため
- `hasAnyPermission` と `hasAllPermissions` は、サービスからは使われていない

## 認可エラーの判定

`getAuthError(session, permission)` は、セッションと必要な権限から、返すべきエラーを決める。

| 条件 | 戻り値 |
|---|---|
| `session` が `null` | メッセージが `COMMON_ERROR_MESSAGES.UNAUTHORIZED`、`statusCode` が 401 |
| `session.user.roles` が権限を持たない | メッセージが `COMMON_ERROR_MESSAGES.FORBIDDEN`、`statusCode` が 403 |
| 権限がある | `null` |

メッセージの文言は [エラーコードとエラーメッセージ](./error-codes.md) にある。

`@nagiyu/nextjs` にも同名の `getAuthError` があり、サービスが使うのはそちら ([with-auth](../nextjs/with-auth.md))。こちらはサービスからは使われていない。
