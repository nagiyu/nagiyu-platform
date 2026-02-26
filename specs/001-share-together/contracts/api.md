# API コントラクト: みんなでシェアリスト (Share Together)

**ブランチ**: `copilot/define-requirements-again` | **日付**: 2025-06-12
**対応する計画**: [plan.md](../plan.md)

---

## 概要

本ドキュメントは Share Together の Next.js App Router が提供する REST API エンドポイントの仕様を定義する。
すべてのエンドポイントは認証済みユーザーのみがアクセス可能（未認証の場合は `401 Unauthorized`）。

### 共通仕様

#### 認証
- 全エンドポイントで NextAuth v5 のセッション検証を実施する
- セッションなし: `401 Unauthorized`

#### 共通レスポンス形式

成功時:
```json
{
  "data": { ... }
}
```

エラー時:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "エラーメッセージ（日本語）"
  }
}
```

#### 共通エラーコード

| HTTP ステータス | コード | 説明 |
|---------------|--------|------|
| 400 | `VALIDATION_ERROR` | 入力値バリデーションエラー |
| 401 | `UNAUTHORIZED` | 未認証 |
| 403 | `FORBIDDEN` | アクセス権限なし |
| 404 | `NOT_FOUND` | リソースが存在しない |
| 409 | `CONFLICT` | 競合（重複招待等） |
| 500 | `INTERNAL_SERVER_ERROR` | サーバー内部エラー |

---

## ユーザー API

### `POST /api/users`

初回ログイン時のユーザー登録（デフォルト個人リスト自動生成含む）。
Auth サービスから戻ってきた際にフロントエンドが自動的に呼び出す。

**リクエスト**: なし（セッションからユーザー情報を取得）

**レスポンス** `200 OK`（既存ユーザーの場合も同じ）:

```json
{
  "data": {
    "userId": "string (UUID)",
    "email": "string",
    "name": "string",
    "image": "string | null",
    "defaultListId": "string (UUID)",
    "createdAt": "string (ISO 8601)",
    "updatedAt": "string (ISO 8601)"
  }
}
```

**処理フロー**:
1. セッションから `userId`, `email`, `name`, `image` を取得
2. DynamoDB に User レコードが存在しない場合は新規作成
3. 新規作成時はデフォルト個人リストも同時に作成（`isDefault: true`）
4. 既存ユーザーの場合はプロフィール情報を更新してそのまま返す

---

## 個人 ToDo リスト API

### `GET /api/lists`

ログインユーザーの個人 ToDo リスト一覧を取得する。

**レスポンス** `200 OK`:

```json
{
  "data": {
    "lists": [
      {
        "listId": "string (UUID)",
        "name": "string",
        "isDefault": "boolean",
        "createdAt": "string (ISO 8601)",
        "updatedAt": "string (ISO 8601)"
      }
    ]
  }
}
```

---

### `POST /api/lists`

新しい個人 ToDo リストを作成する。

**リクエスト**:

```json
{
  "name": "string (1〜100文字)"
}
```

**レスポンス** `201 Created`:

```json
{
  "data": {
    "listId": "string (UUID)",
    "name": "string",
    "isDefault": false,
    "createdAt": "string (ISO 8601)",
    "updatedAt": "string (ISO 8601)"
  }
}
```

---

### `PUT /api/lists/{listId}`

個人 ToDo リストの名前を変更する。

**パスパラメータ**:
- `listId`: リスト ID

**リクエスト**:

```json
{
  "name": "string (1〜100文字)"
}
```

**レスポンス** `200 OK`:

```json
{
  "data": {
    "listId": "string",
    "name": "string",
    "isDefault": "boolean",
    "updatedAt": "string (ISO 8601)"
  }
}
```

**エラー**:
- `403 FORBIDDEN`: 他人のリストへのアクセス
- `404 NOT_FOUND`: リストが存在しない

---

### `DELETE /api/lists/{listId}`

個人 ToDo リストを削除する。デフォルトリストは削除不可。

**パスパラメータ**:
- `listId`: リスト ID

**レスポンス** `204 No Content`

**エラー**:
- `400 VALIDATION_ERROR`: デフォルトリストの削除試行（`code: "DEFAULT_LIST_NOT_DELETABLE"`）
- `403 FORBIDDEN`: 他人のリストへのアクセス
- `404 NOT_FOUND`: リストが存在しない

---

## ToDo アイテム API（個人・共有共通）

### `GET /api/lists/{listId}/todos`

指定リスト内の ToDo 一覧を取得する（個人リスト専用）。

**パスパラメータ**:
- `listId`: リスト ID

**レスポンス** `200 OK`:

```json
{
  "data": {
    "todos": [
      {
        "todoId": "string (UUID)",
        "title": "string",
        "isCompleted": "boolean",
        "createdBy": "string (userId)",
        "completedBy": "string (userId) | null",
        "createdAt": "string (ISO 8601)",
        "updatedAt": "string (ISO 8601)"
      }
    ]
  }
}
```

**エラー**:
- `403 FORBIDDEN`: 他人のリストへのアクセス
- `404 NOT_FOUND`: リストが存在しない

---

### `POST /api/lists/{listId}/todos`

ToDo アイテムを作成する（個人リスト専用）。

**パスパラメータ**:
- `listId`: リスト ID

**リクエスト**:

```json
{
  "title": "string (1〜200文字)"
}
```

**レスポンス** `201 Created`:

```json
{
  "data": {
    "todoId": "string (UUID)",
    "title": "string",
    "isCompleted": false,
    "createdBy": "string (userId)",
    "completedBy": null,
    "createdAt": "string (ISO 8601)",
    "updatedAt": "string (ISO 8601)"
  }
}
```

---

### `PUT /api/lists/{listId}/todos/{todoId}`

ToDo アイテムを更新する（タイトル変更・完了状態変更）（個人リスト専用）。

**パスパラメータ**:
- `listId`: リスト ID
- `todoId`: ToDo ID

**リクエスト**（変更したいフィールドのみ送信）:

```json
{
  "title": "string (1〜200文字, optional)",
  "isCompleted": "boolean (optional)"
}
```

**レスポンス** `200 OK`:

```json
{
  "data": {
    "todoId": "string",
    "title": "string",
    "isCompleted": "boolean",
    "completedBy": "string (userId) | null",
    "updatedAt": "string (ISO 8601)"
  }
}
```

---

### `DELETE /api/lists/{listId}/todos/{todoId}`

ToDo アイテムを削除する（個人リスト専用）。

**パスパラメータ**:
- `listId`: リスト ID
- `todoId`: ToDo ID

**レスポンス** `204 No Content`

---

## グループ API

### `GET /api/groups`

ログインユーザーが所属するグループ一覧を取得する（承認済みメンバーシップのみ）。

**レスポンス** `200 OK`:

```json
{
  "data": {
    "groups": [
      {
        "groupId": "string (UUID)",
        "name": "string",
        "ownerUserId": "string",
        "isOwner": "boolean",
        "createdAt": "string (ISO 8601)"
      }
    ]
  }
}
```

---

### `POST /api/groups`

新しいグループを作成する。作成者がオーナーになる。

**リクエスト**:

```json
{
  "name": "string (1〜100文字)"
}
```

**レスポンス** `201 Created`:

```json
{
  "data": {
    "groupId": "string (UUID)",
    "name": "string",
    "ownerUserId": "string",
    "createdAt": "string (ISO 8601)",
    "updatedAt": "string (ISO 8601)"
  }
}
```

---

### `PUT /api/groups/{groupId}`

グループ情報を更新する（名前変更）。オーナーのみ実行可能。

**パスパラメータ**:
- `groupId`: グループ ID

**リクエスト**:

```json
{
  "name": "string (1〜100文字)"
}
```

**レスポンス** `200 OK`:

```json
{
  "data": {
    "groupId": "string",
    "name": "string",
    "updatedAt": "string (ISO 8601)"
  }
}
```

**エラー**:
- `403 FORBIDDEN`: オーナー以外が操作（`code: "OWNER_ONLY"`）

---

### `DELETE /api/groups/{groupId}`

グループを削除する。オーナーのみ実行可能。グループ・全メンバーシップ・全共有リスト・全 ToDo をカスケード削除。

**パスパラメータ**:
- `groupId`: グループ ID

**レスポンス** `204 No Content`

**エラー**:
- `403 FORBIDDEN`: オーナー以外が操作（`code: "OWNER_ONLY"`）

---

## グループメンバー API

### `GET /api/groups/{groupId}/members`

グループのメンバー一覧を取得する（承認済みメンバーのみ、オーナー含む）。

**パスパラメータ**:
- `groupId`: グループ ID

**レスポンス** `200 OK`:

```json
{
  "data": {
    "members": [
      {
        "userId": "string",
        "name": "string",
        "email": "string",
        "image": "string | null",
        "role": "OWNER | MEMBER",
        "joinedAt": "string (ISO 8601)"
      }
    ]
  }
}
```

**エラー**:
- `403 FORBIDDEN`: グループメンバー以外がアクセス

---

### `POST /api/groups/{groupId}/members`

グループにメンバーを招待する。オーナーのみ実行可能。

**パスパラメータ**:
- `groupId`: グループ ID

**リクエスト**:

```json
{
  "email": "string (メールアドレス)"
}
```

または:

```json
{
  "userId": "string (UUID)"
}
```

**処理フロー**:
1. `email` または `userId` でユーザーを検索
2. 対象ユーザーが見つからない場合は `404 NOT_FOUND`
3. 既にメンバーまたは `PENDING` の招待が存在する場合は `409 CONFLICT`
4. GroupMembership（`status: PENDING`、`groupName`・`inviterName` のスナップショット付き）を作成

**レスポンス** `201 Created`:

```json
{
  "data": {
    "groupId": "string",
    "inviteeUserId": "string",
    "inviteeName": "string",
    "status": "PENDING",
    "createdAt": "string (ISO 8601)"
  }
}
```

**エラー**:
- `403 FORBIDDEN`: オーナー以外が操作（`code: "OWNER_ONLY"`）
- `404 NOT_FOUND`: 招待対象ユーザーが存在しない
- `409 CONFLICT`: 重複招待（`code: "ALREADY_INVITED"`）または既にメンバー（`code: "ALREADY_MEMBER"`）

---

### `DELETE /api/groups/{groupId}/members/{userId}`

グループからメンバーを除外する（オーナーによる強制除外）、またはグループから脱退する（本人）。

**パスパラメータ**:
- `groupId`: グループ ID
- `userId`: 対象ユーザー ID

**アクセス制御**:
- `userId` が自分自身: 脱退（全メンバー可能、オーナー除く）
- `userId` が他人: 除外（オーナーのみ可能）

**レスポンス** `204 No Content`

**エラー**:
- `403 FORBIDDEN`:
  - 他人のメンバーを除外しようとしてオーナーでない場合
  - オーナー自身が脱退しようとした場合（`code: "OWNER_CANNOT_LEAVE"`）
- `404 NOT_FOUND`: 対象メンバーが存在しない

---

## 招待通知 API

### `GET /api/invitations`

ログインユーザーへの保留中（`PENDING`）の招待通知一覧を取得する。

**レスポンス** `200 OK`:

```json
{
  "data": {
    "invitations": [
      {
        "groupId": "string",
        "groupName": "string",
        "inviterUserId": "string",
        "inviterName": "string",
        "createdAt": "string (ISO 8601)"
      }
    ]
  }
}
```

---

### `PUT /api/invitations/{groupId}`

招待を承認または拒否する。

**パスパラメータ**:
- `groupId`: 招待対象グループ ID

**リクエスト**:

```json
{
  "action": "ACCEPT | REJECT"
}
```

**処理フロー（ACCEPT 時）**:
1. GroupMembership（`status: PENDING`）を GSI1 経由で取得
2. GroupMembership の `status` を `ACCEPTED` に更新

**処理フロー（REJECT 時）**:
1. GroupMembership（`status: PENDING`）を GSI1 経由で取得
2. GroupMembership の `status` を `REJECTED` に更新

**レスポンス** `200 OK`:

```json
{
  "data": {
    "groupId": "string",
    "status": "ACCEPTED | REJECTED",
    "updatedAt": "string (ISO 8601)"
  }
}
```

**エラー**:
- `403 FORBIDDEN`: 他人の招待を操作しようとした場合
- `404 NOT_FOUND`: 招待が存在しない
- `409 CONFLICT`: 既に応答済み（`code: "ALREADY_RESPONDED"`）

---

## グループ共有 ToDo リスト API

### `GET /api/groups/{groupId}/lists`

グループの共有 ToDo リスト一覧を取得する。

**パスパラメータ**:
- `groupId`: グループ ID

**レスポンス** `200 OK`:

```json
{
  "data": {
    "lists": [
      {
        "listId": "string (UUID)",
        "name": "string",
        "createdBy": "string (userId)",
        "createdAt": "string (ISO 8601)",
        "updatedAt": "string (ISO 8601)"
      }
    ]
  }
}
```

**エラー**:
- `403 FORBIDDEN`: グループメンバー以外がアクセス（FR-020）

---

### `POST /api/groups/{groupId}/lists`

グループに新しい共有 ToDo リストを作成する。

**パスパラメータ**:
- `groupId`: グループ ID

**リクエスト**:

```json
{
  "name": "string (1〜100文字)"
}
```

**レスポンス** `201 Created`:

```json
{
  "data": {
    "listId": "string (UUID)",
    "name": "string",
    "createdBy": "string (userId)",
    "createdAt": "string (ISO 8601)",
    "updatedAt": "string (ISO 8601)"
  }
}
```

**エラー**:
- `403 FORBIDDEN`: グループメンバー以外がアクセス

---

### `PUT /api/groups/{groupId}/lists/{listId}`

グループ共有リストの名前を変更する。

**パスパラメータ**:
- `groupId`: グループ ID
- `listId`: リスト ID

**リクエスト**:

```json
{
  "name": "string (1〜100文字)"
}
```

**レスポンス** `200 OK`:

```json
{
  "data": {
    "listId": "string",
    "name": "string",
    "updatedAt": "string (ISO 8601)"
  }
}
```

**エラー**:
- `403 FORBIDDEN`: グループメンバー以外がアクセス

---

### `DELETE /api/groups/{groupId}/lists/{listId}`

グループ共有リストを削除する（リスト内の全 ToDo もカスケード削除）。

**パスパラメータ**:
- `groupId`: グループ ID
- `listId`: リスト ID

**レスポンス** `204 No Content`

**エラー**:
- `403 FORBIDDEN`: グループメンバー以外がアクセス（FR-021）

---

## グループ共有 ToDo アイテム API

### `GET /api/groups/{groupId}/lists/{listId}/todos`

グループ共有リスト内の ToDo 一覧を取得する。

**パスパラメータ**:
- `groupId`: グループ ID
- `listId`: リスト ID

**レスポンス** `200 OK`:

```json
{
  "data": {
    "todos": [
      {
        "todoId": "string (UUID)",
        "title": "string",
        "isCompleted": "boolean",
        "createdBy": "string (userId)",
        "completedBy": "string (userId) | null",
        "createdAt": "string (ISO 8601)",
        "updatedAt": "string (ISO 8601)"
      }
    ]
  }
}
```

**エラー**:
- `403 FORBIDDEN`: グループメンバー以外がアクセス（FR-020）

---

### `POST /api/groups/{groupId}/lists/{listId}/todos`

グループ共有リストに ToDo を追加する。

**パスパラメータ**:
- `groupId`: グループ ID
- `listId`: リスト ID

**リクエスト**:

```json
{
  "title": "string (1〜200文字)"
}
```

**レスポンス** `201 Created`:

```json
{
  "data": {
    "todoId": "string (UUID)",
    "title": "string",
    "isCompleted": false,
    "createdBy": "string (userId)",
    "completedBy": null,
    "createdAt": "string (ISO 8601)",
    "updatedAt": "string (ISO 8601)"
  }
}
```

**エラー**:
- `403 FORBIDDEN`: グループメンバー以外がアクセス

---

### `PUT /api/groups/{groupId}/lists/{listId}/todos/{todoId}`

グループ共有リストの ToDo を更新する（タイトル変更・完了状態変更）。

**パスパラメータ**:
- `groupId`: グループ ID
- `listId`: リスト ID
- `todoId`: ToDo ID

**リクエスト**（変更したいフィールドのみ送信）:

```json
{
  "title": "string (1〜200文字, optional)",
  "isCompleted": "boolean (optional)"
}
```

**レスポンス** `200 OK`:

```json
{
  "data": {
    "todoId": "string",
    "title": "string",
    "isCompleted": "boolean",
    "completedBy": "string (userId) | null",
    "updatedAt": "string (ISO 8601)"
  }
}
```

**エラー**:
- `403 FORBIDDEN`: グループメンバー以外がアクセス（FR-019）

---

### `DELETE /api/groups/{groupId}/lists/{listId}/todos/{todoId}`

グループ共有リストから ToDo を削除する。

**パスパラメータ**:
- `groupId`: グループ ID
- `listId`: リスト ID
- `todoId`: ToDo ID

**レスポンス** `204 No Content`

**エラー**:
- `403 FORBIDDEN`: グループメンバー以外がアクセス（FR-019）
