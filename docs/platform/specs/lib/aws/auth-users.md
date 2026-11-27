---
sources:
  - libs/aws/src/auth-users/index.ts
  - libs/aws/src/auth-users/mapper.ts
  - libs/aws/src/auth-users/reader.ts
  - libs/aws/src/auth-users/dynamodb-reader.ts
  - libs/aws/src/auth-users/in-memory-reader.ts
  - libs/aws/src/auth-users/in-memory-store.ts
  - libs/aws/src/auth-users/factory.ts
sources_hash: e9a4e412087bd9f15c6536159d2fa236f763c8ea2f3daa35ce2a9976f3f63bb5
---

# auth のユーザー

auth のユーザーのテーブル (`nagiyu-auth-users-{env}`) の項目の形を扱う。項目と `User` を相互に変える `UserMapper` と、ほかのサービスが利用者のロールの出どころ (手動のロールと課金の権利) だけを読む `AuthUserRoleSourceReader` がある。auth と、ロールを知りたいほかのサービスが、同じ解釈を使うためのもの。`@nagiyu/aws` から import する。テーブルの項目の意味は [Auth のユーザーテーブル](../../../../services/auth/specs/data/users.md) にある。

## 使い方

### ロールの出どころを読む

| 関数・クラス | 引数 | 戻り値 |
|---|---|---|
| `createAuthUserRoleSourceReader` | `tableName` (必須)、`docClient` (省略時は環境から) | `AuthUserRoleSourceReader`。一度作ったものを使い回す |
| `AuthUserRoleSourceReader.getRoleSources` | `userId` (auth のユーザー ID) | `{ roles, roleGrants }` (`AuthUserRoleSources`)。ユーザーがいなければ `null` |
| `DynamoDBAuthUserRoleSourceReader` | `docClient`、`tableName` | DynamoDB 版 |
| `InMemoryAuthUserRoleSourceReader` | `store` (省略時は新しいストア) | メモリ版。`putItem` で保存形式の項目 (`userId` を含む) を入れられる |
| `getInMemoryAuthUserStore` | なし | メモリ版が共有するストア。なければ作る |
| `resetAuthUserRoleSourceReader` | なし | 使い回しのインスタンスと、メモリ版の共有ストアを捨てる。テスト用 |
| `resetInMemoryAuthUserStore` | なし | メモリ版の共有ストアだけを捨てる。テスト用 |

有効なロールへの変換は、呼ぶ側が `getEffectiveRoles(roles, roleGrants, now)` (`@nagiyu/common`、[課金の権利](../common/role-grants.md)) で行う。

```ts
import { createAuthUserRoleSourceReader } from '@nagiyu/aws';
import { getEffectiveRoles } from '@nagiyu/common';

const reader = createAuthUserRoleSourceReader(authUsersTableName);
const sources = await reader.getRoleSources(userId);
const roles = sources ? getEffectiveRoles(sources.roles, sources.roleGrants, Date.now()) : [];
```

### 項目と User の変換

| 関数・クラス・定数 | 内容 |
|---|---|
| `UserMapper` | `User` と項目を相互に変える [EntityMapper](./entity-mapper.md)。キーは `userId`。auth のユーザーのリポジトリが使う |
| `readRoles(item)` | 項目から手動のロールを読む |
| `readRoleGrants(item)` | 項目から課金の権利を読む。属性がなければ `undefined` |
| `roleGrantToItem(grant)` / `roleGrantToEntity(value)` | 権利 1 つと、保存形式の map を相互に変える |
| `LEGACY_ATTRIBUTE_NAMES` | 読むときに受け付ける旧名の属性名 |

`UserMapper.toEntity` も `readRoles` と `readRoleGrants` で読むので、reader と同じ解釈になる。

## 振る舞い

### 実装の選択

- 環境変数 `USE_IN_MEMORY_DB` が `true` のとき、`createAuthUserRoleSourceReader` はメモリ版を返す。メモリ版は全体で 1 つの共有ストアを読む。それ以外は DynamoDB 版を返す ([リポジトリの登録と生成](./repository-registry.md))
- 共有ストアは `globalThis` に持つ。Next.js の開発サーバーでは、モジュールがバンドルごとに複製されても、同じストアを読む

### 読み取り

- DynamoDB 版は、キー `userId` の項目を `GetItem` で読み、`Roles`・`roles` (旧名)・`RoleGrants` の 3 つの属性だけを取り出す。メールや名前は読まない
- ロールは `Roles` を読み、なければ旧名の `roles` を読む。要素はすべて文字列でなければならない
- 権利の属性がない項目では、`roleGrants` は空の配列になる。要素の `source` は出どころの定義 (`ROLE_GRANT_SOURCES`) のどれかでなければならない

### 書き込みの形

- `UserMapper.toItem` は、属性名を PascalCase で書く。キー (`userId`) と GSI のキー (`googleId`) は camelCase のまま。`Type` は `User`
- 任意の項目 (`roleGrants`、`stripeCustomerId`、`picture`、`lastLoginAt`) は、値がなければ属性を作らない。権利の要素の任意の項目 (`sourceRef`、`expiresAt`、`revokedAt`、`grantedBy`) も同じ
- `UserMapper.toUpdateAttributes` は、`userId`・`googleId`・`createdAt` を含む変更を拒む。`email`・`name`・`roles` を `null` (削除) にする変更も拒む

## 失敗したとき

| 状況 | 結果 |
|---|---|
| ユーザーがいない | `null` を返す |
| ロールや権利の形が読めない | `InvalidEntityDataError` ([リポジトリのエラー](./repository-errors.md)) |
| DynamoDB の呼び出しの失敗 | `toDatabaseError` で包んだエラー |
| `toUpdateAttributes` に変えられない項目や、必須の項目の削除が含まれる | `InvalidEntityDataError` |

## 理由

- **項目の形を知るのを 1 か所にする**: auth の項目の形を知るコードを auth の中だけに置くと、ほかのサービスは auth のパッケージに依存するか、形を写して持つことになる。サービスどうしのパッケージ依存は作らず、写しは auth が形を変えたときに黙ってずれるので、libs に置いて両方が使う
- **ロールに要る属性だけを読む**: 読む側 (LiveTalk など) は個人情報を持たない方針で、ロールを決めるのにメールや名前は要らない。読まなければ、ログや例外に混ざることもない
- **テーブル名を必ず受け取る**: 読む側のサービスは自分のテーブル名を `DYNAMODB_TABLE_NAME` に持つため、環境変数の既定値を使うと別のテーブルを読んでしまう
