---
sources:
  - libs/aws/src/auth-users/mapper.ts
  - libs/aws/src/auth-users/reader.ts
  - libs/aws/src/auth-users/dynamodb-reader.ts
  - libs/aws/src/auth-users/in-memory-reader.ts
  - libs/aws/src/auth-users/in-memory-store.ts
  - libs/aws/src/auth-users/factory.ts
sources_hash: 6e4a00ffd8e0c7334489f1d22e086a92756bd9736bbbf1a69d8b7d24088ef19b
---

# auth のユーザー

auth のユーザーのテーブル (`nagiyu-auth-users-{env}`) の項目の形を扱う。項目と `User` を相互に変える `UserMapper` と、ほかのサービスが利用者のロールの出どころ (手動のロールと課金の権利) だけを読む `AuthUserRoleSourceReader` がある。auth と、ロールを知りたいほかのサービスが、同じ解釈を使う。`@nagiyu/aws` から import する。

## 使い方

### ロールの出どころを読む

| 関数・クラス | 引数 | 戻り値 |
|---|---|---|
| `createAuthUserRoleSourceReader` | `tableName` (必須)、`docClient` (省略時は環境から) | `AuthUserRoleSourceReader`。一度作ったものを使い回す |
| `AuthUserRoleSourceReader.getRoleSources` | `userId` (auth のユーザー ID) | `{ roles, roleGrants }`。ユーザーがいなければ `null` |
| `DynamoDBAuthUserRoleSourceReader` | `docClient`、`tableName` | DynamoDB 版 |
| `InMemoryAuthUserRoleSourceReader` | `store` (省略時は新しいストア) | メモリ版。`putItem` で保存形式の項目を入れられる |
| `resetAuthUserRoleSourceReader` | なし | 使い回しのインスタンスと、メモリ版の共有ストアを捨てる。テスト用 |

有効なロールへの変換は、呼ぶ側が `getEffectiveRoles(roles, roleGrants, now)` (`@nagiyu/common`) で行う。

```ts
import { createAuthUserRoleSourceReader } from '@nagiyu/aws';
import { getEffectiveRoles } from '@nagiyu/common';

const reader = createAuthUserRoleSourceReader(authUsersTableName);
const sources = await reader.getRoleSources(userId);
const roles = sources ? getEffectiveRoles(sources.roles, sources.roleGrants, Date.now()) : [];
```

### 項目と User の変換

`UserMapper` は auth のユーザーのリポジトリが使う。`readRoles(item)` と `readRoleGrants(item)` は、項目からロールと権利だけを読む。`UserMapper.toEntity` も同じ関数で読む。

## 振る舞い

- 環境変数 `USE_IN_MEMORY_DB` が `true` のとき、`createAuthUserRoleSourceReader` はメモリ版を返す。メモリ版は全体で 1 つの共有ストアを読む
- DynamoDB 版は、キー `userId` の項目を `GetItem` で読み、`Roles`・`roles`・`RoleGrants` の 3 つの属性だけを取り出す。メールや名前は読まない
- ロールは `Roles` を読み、なければ旧名の `roles` を読む
- 権利の属性がない項目では、`roleGrants` は空の配列になる

## 失敗したとき

| 状況 | 結果 |
|---|---|
| ユーザーがいない | `null` を返す |
| ロールや権利の形が読めない | `InvalidEntityDataError` |
| DynamoDB の呼び出しの失敗 | `toDatabaseError` で包んだエラー |

## 理由

- **項目の形を知るのを 1 か所にする**: auth の項目の形を知るコードを auth の中だけに置くと、ほかのサービスは auth のパッケージに依存するか、形を写して持つことになる。サービスどうしのパッケージ依存は作らず、写しは auth が形を変えたときに黙ってずれるので、libs に置いて両方が使う
- **ロールに要る属性だけを読む**: 読む側 (LiveTalk など) は個人情報を持たない方針で、ロールを決めるのにメールや名前は要らない。読まなければ、ログや例外に混ざることもない
- **テーブル名を必ず受け取る**: 読む側のサービスは自分のテーブル名を `DYNAMODB_TABLE_NAME` に持つため、環境変数の既定値を使うと別のテーブルを読んでしまう
