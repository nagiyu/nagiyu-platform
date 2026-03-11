# DynamoDBUserRepository の create/update/delete 実装

## 概要

`services/share-together/core/src/repositories/user/dynamodb-user-repository.ts` において、
`create`・`update`・`delete` メソッドが未実装（`throw new Error(ERROR_MESSAGES.NOT_IMPLEMENTED)`）
のため、DynamoDB 環境での `POST /api/users` が必ず 500 エラーになっている。

最低限 `POST /api/users` で使用する `getById` + `create` / `update` が動作するよう、
3メソッドを実装する。

## 関連情報

- Issue: #1933
- タスクタイプ: サービスタスク（Share-Together Core）
- 対象ファイル: `services/share-together/core/src/repositories/user/dynamodb-user-repository.ts`
- 対応テスト: `services/share-together/core/tests/unit/repositories/user/dynamodb-user-repository.test.ts`

## 要件

### 機能要件

- FR1: `create(input: CreateUserInput): Promise<User>` を実装する
    - `PK = USER#{userId}`、`SK = #META#` でアイテムを書き込む
    - `GSI2PK = EMAIL#{email}` を付与し `getByEmail` の GSI クエリに対応する
    - 重複登録は `ConditionExpression: attribute_not_exists(PK) AND attribute_not_exists(SK)` で防止する
    - `createdAt` / `updatedAt` は ISO 8601 文字列を設定する
- FR2: `update(userId, updates: UpdateUserInput): Promise<User>` を実装する
    - 動的 `SET` 式でフィールドを部分更新する
    - `email` が更新される場合は `GSI2PK` も更新する
    - `updatedAt` は常に現在時刻に更新する
    - 存在しないユーザーへの更新は `ConditionExpression` で検出しエラーを投げる
    - 更新後のアイテムを `ReturnValues: 'ALL_NEW'` で取得して返す
- FR3: `delete(userId): Promise<void>` を実装する
    - 対象アイテムを削除する
    - 存在しない場合はエラーにしない（冪等な削除）

### 非機能要件

- NFR1: `DynamoDBListRepository` と同じスタイル・パターンを踏襲する
- NFR2: エラーメッセージは `ERROR_MESSAGES` 定数オブジェクトで日本語管理する
- NFR3: テストカバレッジ 80% 以上を維持する

## DynamoDB アイテム構造

| 属性 | 値 |
|------|----|
| PK | `USER#{userId}` |
| SK | `#META#` |
| GSI2PK | `EMAIL#{email}` |
| userId | ユーザー ID |
| email | メールアドレス |
| name | 表示名 |
| image | プロフィール画像 URL（省略可） |
| defaultListId | デフォルト個人リスト ID |
| createdAt | ISO 8601 文字列 |
| updatedAt | ISO 8601 文字列 |

## 実装のヒント

- `DynamoDBListRepository.createPersonalList` の `PutCommand` パターンを参考にする
- `DynamoDBListRepository.updatePersonalList` の `UpdateCommand` + `ReturnValues: 'ALL_NEW'` パターンを参考にする
- `create` で `ConditionalCheckFailedException` をキャッチしてユーザー重複エラーとして re-throw する
- `update` で `ConditionalCheckFailedException` をキャッチしてユーザー未検出エラーとして re-throw する
- `delete` は `DynamoDBListRepository.deleteGroupList` と同様に条件なし DELETE（冪等）
- `isConditionalCheckFailed` ヘルパー関数を追加し重複判定を共通化する

## タスク

- [x] T001: `DynamoDBUserRepository` の調査・方針策定
- [x] T002: `create` メソッドを実装し、単体テストを追加
- [x] T003: `update` メソッドを実装し、単体テストを追加
- [x] T004: `delete` メソッドを実装し、単体テストを追加
- [x] T005: `npm run test --workspace=@nagiyu/share-together-core` で全テスト通過確認
- [x] T006: `npm run lint --workspace=@nagiyu/share-together-core` で lint 通過確認

## 参考ドキュメント

- `docs/development/rules.md` — コーディング規約
- `services/share-together/core/src/repositories/list/dynamodb-list-repository.ts` — 実装パターン参考
- `services/share-together/core/src/repositories/user/in-memory-user-repository.ts` — 期待動作の参考
