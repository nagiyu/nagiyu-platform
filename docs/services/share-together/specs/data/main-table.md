---
sources:
  - infra/share-together/lib/dynamodb-stack.ts
  - services/share-together/core/src/repositories/user/user-mapper.ts
  - services/share-together/core/src/repositories/list/personal-list-mapper.ts
  - services/share-together/core/src/repositories/list/group-list-mapper.ts
  - services/share-together/core/src/repositories/group/group-mapper.ts
  - services/share-together/core/src/repositories/membership/membership-mapper.ts
  - services/share-together/core/src/repositories/todo/todo-item-mapper.ts
  - services/share-together/core/src/repositories/membership/dynamodb-membership-repository.ts
  - services/share-together/core/src/repositories/user/dynamodb-user-repository.ts
  - services/share-together/core/src/repositories/list/dynamodb-list-repository.ts
  - services/share-together/core/src/repositories/todo/dynamodb-todo-repository.ts
  - services/share-together/core/src/repositories/group/dynamodb-group-repository.ts
  - libs/aws/src/dynamodb/validators.ts
  - libs/aws/src/dynamodb/batch.ts
  - libs/aws/src/dynamodb/pagination.ts
  - libs/aws/src/dynamodb/store/entity-store-support.ts
sources_hash: 8499a259e9dbc2b4b188bf8a4f46b2556b998efeeb0753d3f8e2203b868634e5
---

# Share Together のテーブル

Share Together のデータをすべて保存する DynamoDB の 1 つのテーブル。利用者、個人リスト、グループ、メンバーシップ (招待を含む)、共有リスト、ToDo の 6 種を、キーの形で分けて入れる。

## テーブル

| 項目 | 内容 |
|---|---|
| 名前 | `nagiyu-share-together-main-{env}` (`{env}` は `dev` か `prod`) |
| 課金 | オンデマンド |
| 暗号化 | AWS 管理のキー |
| バックアップ | ポイントインタイムリカバリを有効にする |
| 有効期限 (TTL) | 属性 `TTL` (エポック秒)。メンバーシップのうち、期限のある招待だけが持つ |

| 環境 | スタックを削除したときのテーブル |
|---|---|
| dev | 削除する |
| prod | 残す |

- 名前は[Web の実行環境](../resource/web-runtime.md)の環境変数 `DYNAMODB_TABLE_NAME` で渡す
- prod は、スタックを削除してもテーブルとデータが残る。dev は、スタックを削除するとデータも消える
- スタックは `NagiyuShareTogetherDynamoDB{Env}`

## キー設計

| 種類 | `Type` | PK | SK |
|---|---|---|---|
| 利用者 | `User` | `USER#{利用者 ID}` | `#META#` |
| [個人リスト](../term/personal-list.md) | `PersonalList` | `USER#{利用者 ID}` | `PLIST#{リスト ID}` |
| グループ | `Group` | `GROUP#{グループ ID}` | `#META#` |
| メンバーシップ ([招待](../term/invitation.md)を含む) | `GroupMembership` | `GROUP#{グループ ID}` | `MEMBER#{利用者 ID}` |
| [共有リスト](../term/shared-list.md) | `GroupList` | `GROUP#{グループ ID}` | `GLIST#{リスト ID}` |
| ToDo | `TodoItem` | `LIST#{リスト ID}` | `TODO#{ToDo ID}` |

利用者と個人リストは同じ PK を、グループとメンバーシップと共有リストは同じ PK を共有する。ToDo は、個人リストのものも共有リストのものも、リスト ID を PK にする。

| インデックス | パーティションキー | ソートキー | 射影 | 用途 |
|---|---|---|---|---|
| `GSI1` | `GSI1PK` (`USER#{利用者 ID}`) | `GSI1SK` (`GROUP#{グループ ID}`) | すべての属性 | 利用者から、所属するグループと受け取った招待を引く。メンバーシップだけが持つ |
| `GSI2` | `GSI2PK` (`EMAIL#{小文字にしたメールアドレス}`) | なし | すべての属性 | メールアドレスから利用者を引く。利用者だけが持つ |

どの取得に使うか。

| 取得 | 方法 |
|---|---|
| 利用者の 1 件 | PK と SK を指定した GetItem。複数件は BatchGetItem |
| メールアドレスから利用者 | `GSI2` の Query。`GSI2PK` が一致する 1 件 |
| 利用者の個人リストの全件 | PK が `USER#{利用者 ID}` で、SK が `PLIST#` で始まるものの Query |
| グループの 1 件 | PK と SK を指定した GetItem。複数件 (グループの一覧、招待の一覧) は BatchGetItem |
| グループのメンバーシップの全件 | PK が `GROUP#{グループ ID}` で、SK が `MEMBER#` で始まるものの Query |
| グループの共有リストの全件 | PK が `GROUP#{グループ ID}` で、SK が `GLIST#` で始まるものの Query |
| リストの ToDo の全件 | PK が `LIST#{リスト ID}` で、SK が `TODO#` で始まるものの Query |
| 利用者の所属グループ (メンバーシップ) | `GSI1` の Query。`GSI1PK` が一致するもの |
| 利用者が受け取った招待 | `GSI1` の Query。`GSI1PK` が一致するものから、状態が `PENDING` のものに絞る |

- `GSI1` は `GSI1SK` を条件に使わない。利用者の全メンバーシップを引き、必要なら状態で絞る
- `GSI2` はメールアドレスの完全一致だけで引く。名前の部分一致で引く手段は持たない
- どの取得も GetItem、BatchGetItem、Query のいずれかで、Scan は使わない
- 読むときは、現在の名前の属性がなければ、旧い形式の属性名 (先頭が小文字の `groupId` など) と、ISO 文字列の時刻も受け付ける。新しい名前と旧い名前が併存するときは、新しい名前を優先する。書くときは旧い名前の属性を消す

## 項目

日時はエポックミリ秒の数値 (`TTL` だけエポック秒)。`PK`・`SK`・`Type`・`GSI1PK`・`GSI1SK`・`GSI2PK` は上のキー設計のとおり。

### 利用者

| 項目 | 型 | 意味 |
|---|---|---|
| `UserID` | 文字列 | 利用者 ID |
| `Email` | 文字列 | メールアドレス。ログインのとき登録した表記のまま持つ |
| `Name` | 文字列 | 表示名 |
| `Image` | 文字列 | 任意。画像の URL。ないときは属性ごと省く |
| `DefaultListID` | 文字列 | デフォルトの個人リストの ID |
| `CreatedAt`、`UpdatedAt` | 数値 | 作成・更新の日時。`CreatedAt` は変えられない |

### 個人リスト

| 項目 | 型 | 意味 |
|---|---|---|
| `ListID` | 文字列 | リスト ID |
| `UserID` | 文字列 | 持ち主の利用者 ID |
| `Name` | 文字列 | リストの名前 |
| `IsDefault` | 真偽値 | デフォルトのリストか。作成後は変えられない |
| `CreatedAt`、`UpdatedAt` | 数値 | 作成・更新の日時。`CreatedAt` は変えられない |

### グループ

| 項目 | 型 | 意味 |
|---|---|---|
| `GroupID` | 文字列 | グループ ID |
| `Name` | 文字列 | グループの名前 |
| `OwnerUserID` | 文字列 | オーナーの利用者 ID。作成後は変えられない |
| `CreatedAt`、`UpdatedAt` | 数値 | 作成・更新の日時。`CreatedAt` は変えられない |

### メンバーシップ

| 項目 | 型 | 意味 |
|---|---|---|
| `GroupID`、`UserID` | 文字列 | グループと利用者の ID |
| `Role` | 文字列 | `OWNER` か `MEMBER` ([グループの立場](../term/group-role.md)) |
| `Status` | 文字列 | `PENDING`、`ACCEPTED`、`REJECTED` のどれか |
| `InvitedBy` | 文字列 | 任意。招待した利用者の ID |
| `InvitedAt` | 数値 | 任意。招待した日時 |
| `RespondedAt` | 数値 | 任意。応答した日時 |
| `TTL` | 数値 | 任意。招待の期限 (エポック秒)。DynamoDB が自動で消す。消えるまでに遅れることがある。応答すると属性ごと消す |
| `CreatedAt`、`UpdatedAt` | 数値 | 作成・更新の日時。`CreatedAt` は変えられない |

- 任意の項目は、ないときは属性ごと省く
- `GSI1PK` と `GSI1SK` は、更新のたびにキーから付け直す

### 共有リスト

| 項目 | 型 | 意味 |
|---|---|---|
| `ListID`、`GroupID` | 文字列 | リストとグループの ID |
| `Name` | 文字列 | リストの名前 |
| `CreatedBy` | 文字列 | 作った利用者の ID。作成後は変えられない |
| `CreatedAt`、`UpdatedAt` | 数値 | 作成・更新の日時。`CreatedAt` は変えられない |

### ToDo

| 項目 | 型 | 意味 |
|---|---|---|
| `TodoID`、`ListID` | 文字列 | ToDo とリストの ID |
| `Title` | 文字列 | タイトル |
| `IsCompleted` | 真偽値 | 完了しているか |
| `CreatedBy` | 文字列 | 作った利用者の ID。作成後は変えられない |
| `CompletedBy` | 文字列 | 任意。完了にした利用者の ID。未完了のときは属性ごと省く |
| `CreatedAt`、`UpdatedAt` | 数値 | 作成・更新の日時。`CreatedAt` は変えられない |

- グループを削除すると、メンバーシップとグループ自身を消す。共有リストと ToDo は消えずに残る (どこからも読めなくなる)。[グループ API](../api/groups.md)にある

## 理由

- プラットフォームの既存サービスと同じシングルテーブルの型にそろえ、すべての種類を 1 つのテーブルに置く。エンティティごとにテーブルを分ける案は、プラットフォームの標準から外れるため採らない
- インデックス 2 つですべての取得を満たす。取得は、親の ID (利用者・グループ・リスト) を PK に、種類を SK の接頭辞に持たせれば、1 回の Query で引ける。逆向きの取得は、利用者から所属グループと招待を引く `GSI1` と、メールアドレスから利用者を引く `GSI2` で足りる。3 つ目のインデックスは、PK と SK の形を工夫すれば要らない
- 招待を別の種類にせず、状態 `PENDING` のメンバーシップとして持つ ([招待](../term/invitation.md))。受け取った招待は `GSI1` で引ける
- `GSI2PK` はメールアドレスを小文字にして作り、`Email` はログインのとき登録した表記のまま持つ。手で入れるアドレスは表記がゆれ、区別すると登録済みの利用者を見つけられないため ([グループメンバー API](../api/group-members.md))
- `GSI2PK` は、ブラウザのセッションごとに行う利用者の登録の更新 ([起動時の流れ](../flow/session-start.md)) で、`Email` から付け直される。キーの作り方を変えるときは、既存の利用者のキーが付け直されるまで、新しいキーでは引けない。既存データの表記を確かめてから、移行が要るかを決める
