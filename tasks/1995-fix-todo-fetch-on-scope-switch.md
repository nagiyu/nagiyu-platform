# ToDo 一覧の取得に失敗することがある（スコープ切り替え時）

## 概要

Share Together のリスト画面で、表示範囲を「共有」→「個人」へ切り替えた際に
`ToDo一覧の取得に失敗しました。` エラーが表示される。

## 関連情報

- Issue: #1995
- 関連タスクドキュメント Issue: #1996
- タスクタイプ: サービスタスク（share-together/web）

## 再現手順

1. リスト画面を開く
2. 表示範囲を「共有」にする
3. ToDo リストが正しく表示されることを確認する
4. 表示範囲を「個人」に戻す
5. `ToDo一覧の取得に失敗しました。` が表示される

## 根本原因の調査結果

### 該当ファイル

- `services/share-together/web/src/components/ListWorkspace.tsx`
- `services/share-together/web/src/components/TodoList.tsx`

### 原因

`ListWorkspace` コンポーネントでは、個人・共有の両スコープに対して
単一の `selectedListId` 状態を使用している。

スコープを「共有」→「個人」へ切り替える際の処理（`onChange` ハンドラ）では、
`nextLists` が空配列になるため `setSelectedListId()` が呼ばれず、
`selectedListId` が共有リストの `listId` のまま残る。

```typescript
// scope 変更ハンドラ（ListWorkspace.tsx 153-166 行）
onChange={(event) => {
    const nextScope = event.target.value as 'personal' | 'shared';
    setScope(nextScope);
    let nextLists: readonly { listId: string; name: string }[] = [];
    if (nextScope === 'shared') {
        nextLists = sharedLists;               // ← 共有への切り替え時のみ設定
    }
    if (nextLists.length > 0) {
        setSelectedListId(nextLists[0].listId); // ← 個人への切り替え時は実行されない
    }
}}
```

`scope === 'personal'` の場合、`currentListId = selectedListId` となるため、
`TodoList` に共有リストの `listId` が渡される。

その結果、`/api/lists/{shared-list-id}/todos` を呼び出すと、
`listService.getPersonalListById(userId, listId)` が 404 を返し、
フロントエンドでエラーが表示される。

### シナリオ詳細

| ステップ | 状態 | selectedListId |
|---------|------|----------------|
| 初期状態（個人） | scope=personal | personal-list-id |
| 共有に切り替え | scope=shared | shared-list-id-1（リセット済） |
| 個人に切り替え | scope=personal | shared-list-id-1（**リセットされない**） |
| API 呼び出し | /api/lists/shared-list-id-1/todos | → 404 Not Found → エラー表示 |

### `useEffect` による自動補正が効かない理由

`ListWorkspace.tsx` 97-121 行の `useEffect` はスコープ変更時にも実行されるが、
`selectedListId` のリセット処理は `scope === 'shared'` の条件下でのみ行われており、
個人スコープへの切り替え後は補正が行われない。

## 対応方針（採用: 案 B）

### 案 B: スコープ切り替え時に `selectedListId` をリセットする

スコープ切り替えハンドラで、個人に戻る際に `initialListId`（もしくは空文字列）へリセットする。
`ListSidebar` が API 経由で個人リストを取得し、最初のリストを選択状態にする動作に委ねる。

実装が簡易で変更範囲が最小限に抑えられる。
スコープを何度も切り替えると個人側の選択状態が毎回リセットされるが、
現状のユースケースでは許容範囲とする。

### ~~案 A: スコープ別に selectedListId を管理する~~（不採用）

個人用と共有用で選択中の `listId` を別々の状態として保持する案。
変更範囲が大きくなるため不採用。

## タスク

- [ ] T001: `ListWorkspace.tsx` のスコープ切り替えハンドラを修正する
    - `onChange` ハンドラで個人スコープへ切り替える際に `setSelectedListId(initialListId)` を呼ぶ
- [ ] T002: ユニットテストの追加・更新
    - スコープ切り替え後に正しい API パスが呼ばれることをテストする
- [ ] T003: E2E テストの追加・更新
    - `tests/e2e/personal-lists.spec.ts` または `tests/e2e/group-shared-todo.spec.ts` に
      スコープ切り替えシナリオのテストケースを追加する

## 参考ドキュメント

- `docs/services/share-together/` - サービス仕様
- `docs/development/rules.md` - コーディング規約
