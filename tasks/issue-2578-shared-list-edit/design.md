# 共有リスト編集機能 - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/services/share-together/architecture.md に ADR として抽出し、
    tasks/issue-2578-shared-list-edit/ ディレクトリごと削除します。

    入力: tasks/issue-2578-shared-list-edit/requirements.md
    次に作成するドキュメント: tasks/issue-2578-shared-list-edit/tasks.md
-->

## API 仕様

既存の API エンドポイントを使用する。新規 API の追加は不要。

### ベース URL・認証

- ベース URL: `/api/groups/{groupId}/lists/{listId}`
- 認証: NextAuth v5 セッション Cookie（Auth Consumer パターン）
- 認可: グループの承認済みメンバー（`status = ACCEPTED`）のみ操作可能

### エンドポイント一覧

| メソッド | パス | 説明 | 認証 |
|---------|------|------|------|
| PUT | /api/groups/{groupId}/lists/{listId} | 共有リスト名を更新する | 要（グループメンバー） |
| DELETE | /api/groups/{groupId}/lists/{listId} | 共有リストを削除する（配下 ToDo も削除） | 要（グループメンバー） |

これらのエンドポイントは `services/share-together/web/src/app/api/groups/[groupId]/lists/[listId]/route.ts` に既に実装済み。

---

## データモデル

変更なし。既存の `GroupList` エンティティをそのまま使用する。

---

## コンポーネント設計

### パッケージ責務分担

| パッケージ | 責務 |
|----------|------|
| `share-together/core` | 変更なし |
| `share-together/web` | `ListSidebar` と `ListWorkspace` の UI ロジック変更のみ |

### 実装モジュール一覧

**web**

| モジュール | パス | 役割 |
|----------|------|------|
| `ListSidebar` | `web/src/components/ListSidebar.tsx` | 共有リストの編集・削除コールバック props を受け取り、アイコンボタンを表示する |
| `ListWorkspace` | `web/src/components/ListWorkspace.tsx` | 共有リストの名前変更・削除ロジックを実装し、`ListSidebar` にコールバックを渡す |

### モジュール間インターフェース

#### `ListSidebar` の props 変更

現在の `ListSidebar` は `hasExternalLists`（`lists` が外部から渡されているか）が `true` の場合、編集・削除ボタンを非表示にしている。
共有リストで編集・削除を可能にするため、以下の props を追加する。

| prop | 型 | 説明 |
|------|----|------|
| `onRenameList` | `((list: SidebarList) => void) \| undefined` | 編集ボタンクリック時に呼び出すコールバック |
| `onDeleteList` | `((list: SidebarList) => void) \| undefined` | 削除ボタンクリック時に呼び出すコールバック |

- `onRenameList` または `onDeleteList` が渡されている場合は、当該ボタンを表示する
- `!hasExternalLists` の場合は、従来通り `ListSidebar` 内部の個人リスト操作ロジックを使用する
- `hasExternalLists && onRenameList` の場合は、渡されたコールバックを呼び出す

#### `ListWorkspace` での追加ロジック

共有スコープで `ListSidebar` に渡す新しいコールバック:

**名前変更 (`handleRenameSharedList`)**

1. `window.prompt` で新しいリスト名を取得する
2. `PUT /api/groups/{groupId}/lists/{listId}` を呼び出す
3. 成功時: `sharedListsByGroup` のステートを更新し、スナックバーで通知する
4. 失敗時: スナックバーにエラーメッセージを表示する

**削除 (`handleDeleteSharedList`)**

1. `window.confirm` で削除を確認する
2. `DELETE /api/groups/{groupId}/lists/{listId}` を呼び出す
3. 成功時: `sharedListsByGroup` のステートからリストを除去し、別リストに遷移、スナックバーで通知する
4. 失敗時: スナックバーにエラーメッセージを表示する

---

## 実装上の注意点

### 依存関係・前提条件

- `services/share-together/web/src/app/api/groups/[groupId]/lists/[listId]/route.ts` の `PUT` と `DELETE` が既に実装済みであること（確認済み）
- 個人リスト操作の既存テスト (`tests/unit/components/ListSidebar.test.tsx`) を壊さないこと

### パフォーマンス考慮事項

- 操作ごとに `sharedListsByGroup` ステートをイミュータブルに更新する（再フェッチは不要）

### セキュリティ考慮事項

- API 側でメンバーシップチェックが実装済みのため、フロントエンドで追加の権限チェックは不要
- エラーレスポンス (403, 404) は適切なユーザーメッセージに変換してスナックバーで表示する

---

## docs/ への移行メモ

<!-- 開発完了後にここを確認し、docs/ を更新してからこのディレクトリを削除する -->

- [ ] `docs/services/share-together/requirements.md` に統合すること：
      <!-- UC-001・UC-002 および F-001・F-002 を既存の機能一覧に追記する -->
- [ ] `docs/services/share-together/architecture.md` に ADR として追記すること（重要な設計決定があれば）：
      <!-- ADR: 共有リスト編集の権限を全承認済みメンバーに付与する（外部設計書 ADR-001 参照） -->
