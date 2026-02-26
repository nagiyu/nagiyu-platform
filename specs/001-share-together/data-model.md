# データモデル: みんなでシェアリスト (Share Together)

**ブランチ**: `copilot/define-requirements-again` | **日付**: 2025-06-12
**対応する計画**: [plan.md](./plan.md)

---

## 概要

DynamoDB シングルテーブル設計（Single Table Design）を採用する。
テーブル名: `nagiyu-share-together-main-{environment}`

| 属性 | 種別 | 説明 |
|------|------|------|
| `PK` | Partition Key (String) | エンティティの主キー |
| `SK` | Sort Key (String) | エンティティのソートキー |
| `GSI1PK` | GSI1 Partition Key (String) | ユーザー→グループ逆引き用 |
| `GSI1SK` | GSI1 Sort Key (String) | ユーザー→グループ逆引き用 |
| `GSI2PK` | GSI2 Partition Key (String) | メールアドレスによるユーザー検索用 |

---

## エンティティ一覧

### 1. ユーザー (User)

Auth サービスで認証されたユーザー情報。初回ログイン時に自動生成。

#### キー設計

| キー | 値 |
|------|----|
| `PK` | `USER#{userId}` |
| `SK` | `#META#` |
| `GSI2PK` | `EMAIL#{email}` |

#### 属性

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `userId` | String | ✅ | Auth サービスが発行するユーザー ID（UUID） |
| `email` | String | ✅ | Google アカウントのメールアドレス（一意） |
| `name` | String | ✅ | 表示名 |
| `image` | String | | プロフィール画像 URL |
| `defaultListId` | String | ✅ | デフォルト個人リストの ID |
| `createdAt` | String | ✅ | ISO 8601 形式 |
| `updatedAt` | String | ✅ | ISO 8601 形式 |

#### バリデーションルール

- `userId`: 空文字禁止、UUID 形式
- `email`: RFC 5322 メールアドレス形式、空文字禁止
- `name`: 1〜100 文字

#### アクセスパターン

| パターン | 操作 | キー条件 |
|---------|------|---------|
| ユーザー情報取得 | GetItem | `PK = USER#{userId}`, `SK = #META#` |
| メールアドレスでユーザー検索 | Query（GSI2） | `GSI2PK = EMAIL#{email}` |

---

### 2. 個人 ToDo リスト (PersonalList)

ユーザーが所有する個人専用リスト。デフォルトリスト（`isDefault: true`）は削除不可。

#### キー設計

| キー | 値 |
|------|----|
| `PK` | `USER#{userId}` |
| `SK` | `PLIST#{listId}` |

#### 属性

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `listId` | String | ✅ | リスト ID（UUID） |
| `userId` | String | ✅ | 所有者のユーザー ID |
| `name` | String | ✅ | リスト名 |
| `isDefault` | Boolean | ✅ | デフォルトリストかどうか |
| `createdAt` | String | ✅ | ISO 8601 形式 |
| `updatedAt` | String | ✅ | ISO 8601 形式 |

#### バリデーションルール

- `name`: 1〜100 文字
- `isDefault = true` のリストは削除禁止（FR-007）
- 削除操作時は `isDefault` を確認してエラーを返す

#### 状態遷移

```
[作成] → [通常状態] → [削除]（isDefault = false の場合のみ）
                   ↑
              [名前変更]
```

#### アクセスパターン

| パターン | 操作 | キー条件 |
|---------|------|---------|
| ユーザーの個人リスト一覧取得 | Query | `PK = USER#{userId}`, `SK begins_with PLIST#` |
| 特定の個人リスト取得 | GetItem | `PK = USER#{userId}`, `SK = PLIST#{listId}` |

---

### 3. グループ (Group)

複数ユーザーが所属する共有単位。作成者がオーナーとなる。

#### キー設計

| キー | 値 |
|------|----|
| `PK` | `GROUP#{groupId}` |
| `SK` | `#META#` |

#### 属性

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `groupId` | String | ✅ | グループ ID（UUID） |
| `name` | String | ✅ | グループ名 |
| `ownerUserId` | String | ✅ | オーナーのユーザー ID |
| `createdAt` | String | ✅ | ISO 8601 形式 |
| `updatedAt` | String | ✅ | ISO 8601 形式 |

#### バリデーションルール

- `name`: 1〜100 文字
- `ownerUserId`: グループ作成者のユーザー ID
- グループ削除時は全メンバー・全共有リスト・全 ToDo をカスケード削除（FR-015）

#### アクセスパターン

| パターン | 操作 | キー条件 |
|---------|------|---------|
| グループ情報取得 | GetItem | `PK = GROUP#{groupId}`, `SK = #META#` |

---

### 4. グループメンバーシップ (GroupMembership)

ユーザーとグループの紐付け。招待の承認・拒否状態を管理する。

#### キー設計

| キー | 値 |
|------|----|
| `PK` | `GROUP#{groupId}` |
| `SK` | `MEMBER#{userId}` |
| `GSI1PK` | `USER#{userId}` |
| `GSI1SK` | `GROUP#{groupId}` |

#### 属性

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `groupId` | String | ✅ | グループ ID |
| `userId` | String | ✅ | ユーザー ID |
| `role` | String | ✅ | `OWNER` または `MEMBER` |
| `status` | String | ✅ | `PENDING`（招待中）、`ACCEPTED`（承認済み）、`REJECTED`（拒否済み） |
| `groupName` | String | ✅ | グループ名（招待通知表示用スナップショット） |
| `invitedBy` | String | | 招待者のユーザー ID（オーナー作成時は null） |
| `inviterName` | String | | 招待者の表示名（招待通知表示用スナップショット） |
| `invitedAt` | String | | 招待日時（ISO 8601） |
| `respondedAt` | String | | 応答日時（ISO 8601） |
| `createdAt` | String | ✅ | ISO 8601 形式 |
| `updatedAt` | String | ✅ | ISO 8601 形式 |

#### バリデーションルール

- `role`: `OWNER` または `MEMBER` のみ
- `status`: `PENDING`, `ACCEPTED`, `REJECTED` のみ
- 同一ユーザーへの重複招待は禁止（既存レコードが `PENDING` の場合はエラー、仕様エッジケース）
- オーナー（`role = OWNER`）は脱退不可（グループ削除のみ可）

#### 状態遷移

```
PENDING（招待中）
  │
  ├─→ ACCEPTED（承認済み） → グループアクセス権付与
  └─→ REJECTED（拒否済み） → グループアクセス権なし
```

#### アクセスパターン

| パターン | 操作 | キー条件 |
|---------|------|---------|
| グループのメンバー一覧取得 | Query | `PK = GROUP#{groupId}`, `SK begins_with MEMBER#` |
| 特定メンバーの取得 | GetItem | `PK = GROUP#{groupId}`, `SK = MEMBER#{userId}` |
| ユーザーが所属するグループ一覧 | Query（GSI1） | `GSI1PK = USER#{userId}` |
| ユーザーへの保留中招待一覧 | Query（GSI1） | `GSI1PK = USER#{userId}`, filter `status = PENDING` |

---

### 5. グループ共有 ToDo リスト (GroupList)

グループに紐づく共有リスト。グループメンバー全員が操作可能。

#### キー設計

| キー | 値 |
|------|----|
| `PK` | `GROUP#{groupId}` |
| `SK` | `GLIST#{listId}` |

#### 属性

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `listId` | String | ✅ | リスト ID（UUID） |
| `groupId` | String | ✅ | 所属グループ ID |
| `name` | String | ✅ | リスト名 |
| `createdBy` | String | ✅ | 作成者のユーザー ID |
| `createdAt` | String | ✅ | ISO 8601 形式 |
| `updatedAt` | String | ✅ | ISO 8601 形式 |

#### バリデーションルール

- `name`: 1〜100 文字
- 作成・編集・削除はグループメンバー全員が可能（FR-019、FR-021）
- グループ削除時はカスケード削除（FR-015）

#### アクセスパターン

| パターン | 操作 | キー条件 |
|---------|------|---------|
| グループの共有リスト一覧取得 | Query | `PK = GROUP#{groupId}`, `SK begins_with GLIST#` |
| 特定の共有リスト取得 | GetItem | `PK = GROUP#{groupId}`, `SK = GLIST#{listId}` |

---

### 6. ToDo アイテム (TodoItem)

個人リストまたはグループ共有リストに属するタスク単位。

#### キー設計

| キー | 値 |
|------|----|
| `PK` | `LIST#{listId}` |
| `SK` | `TODO#{todoId}` |

**注記**: 個人リストの `listId` とグループ共有リストの `listId` は同一のキー空間を使用する（UUID で一意）。

#### 属性

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `todoId` | String | ✅ | ToDo ID（UUID） |
| `listId` | String | ✅ | 所属リスト ID |
| `title` | String | ✅ | ToDo タイトル |
| `isCompleted` | Boolean | ✅ | 完了状態（`false` = 未完了） |
| `createdBy` | String | ✅ | 作成者のユーザー ID |
| `completedBy` | String | | 完了にしたユーザー ID |
| `createdAt` | String | ✅ | ISO 8601 形式 |
| `updatedAt` | String | ✅ | ISO 8601 形式 |

#### バリデーションルール

- `title`: 1〜200 文字、空文字禁止
- MVP では期限（`dueDate`）・詳細説明（`description`）は対象外

#### アクセスパターン

| パターン | 操作 | キー条件 |
|---------|------|---------|
| リスト内の ToDo 一覧取得 | Query | `PK = LIST#{listId}`, `SK begins_with TODO#` |
| 特定の ToDo 取得 | GetItem | `PK = LIST#{listId}`, `SK = TODO#{todoId}` |

---

## GSI 設計まとめ

### GSI1: UserGroupIndex

ユーザーが所属するグループを逆引きする。

| 属性 | 説明 |
|-----|------|
| `GSI1PK` | `USER#{userId}` |
| `GSI1SK` | `GROUP#{groupId}` |
| 対象エンティティ | GroupMembership |
| Projection | ALL |
| 利用クエリ | `GSI1PK = USER#{userId}` → ユーザーの所属グループ一覧 |

### GSI2: EmailIndex

メールアドレスからユーザーを一意検索する。

| 属性 | 説明 |
|-----|------|
| `GSI2PK` | `EMAIL#{email}` |
| 対象エンティティ | User |
| Projection | ALL |
| 利用クエリ | `GSI2PK = EMAIL#{email}` → ユーザー情報取得（招待時の検索） |

---

## CDK テーブル定義イメージ

```typescript
// テーブル名: nagiyu-share-together-main-{environment}
// PK: STRING, SK: STRING
// GSI1: UserGroupIndex (GSI1PK STRING, GSI1SK STRING) - Projection: ALL
// GSI2: EmailIndex (GSI2PK STRING) - Projection: ALL
// BillingMode: PAY_PER_REQUEST
// PointInTimeRecovery: true
// TimeToLiveAttribute: 'TTL'
// Encryption: AWS_MANAGED
```

---

## アクセスパターン全体まとめ

| # | アクセスパターン | 操作 | テーブル/インデックス | キー条件 |
|---|----------------|------|---------------------|---------|
| 1 | ユーザー情報取得 | GetItem | メインテーブル | `PK=USER#{userId}`, `SK=#META#` |
| 2 | メールアドレスでユーザー検索 | Query | GSI2 | `GSI2PK=EMAIL#{email}` |
| 3 | ユーザーの個人リスト一覧 | Query | メインテーブル | `PK=USER#{userId}`, `SK begins_with PLIST#` |
| 4 | 特定個人リスト取得 | GetItem | メインテーブル | `PK=USER#{userId}`, `SK=PLIST#{listId}` |
| 5 | リスト内 ToDo 一覧 | Query | メインテーブル | `PK=LIST#{listId}`, `SK begins_with TODO#` |
| 6 | 特定 ToDo 取得 | GetItem | メインテーブル | `PK=LIST#{listId}`, `SK=TODO#{todoId}` |
| 7 | グループ情報取得 | GetItem | メインテーブル | `PK=GROUP#{groupId}`, `SK=#META#` |
| 8 | グループのメンバー一覧 | Query | メインテーブル | `PK=GROUP#{groupId}`, `SK begins_with MEMBER#` |
| 9 | 特定メンバーシップ取得 | GetItem | メインテーブル | `PK=GROUP#{groupId}`, `SK=MEMBER#{userId}` |
| 10 | ユーザーの所属グループ一覧 | Query | GSI1 | `GSI1PK=USER#{userId}` |
| 11 | ユーザーへの保留中招待一覧 | Query | GSI1 | `GSI1PK=USER#{userId}`, filter `status=PENDING` |
| 12 | グループの共有リスト一覧 | Query | メインテーブル | `PK=GROUP#{groupId}`, `SK begins_with GLIST#` |
| 13 | 特定共有リスト取得 | GetItem | メインテーブル | `PK=GROUP#{groupId}`, `SK=GLIST#{listId}` |
