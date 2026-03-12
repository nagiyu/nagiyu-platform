# 共有リストを作成できない手順がある

## 概要

Share Together のリスト画面で、表示範囲を「共有」に切り替えてグループを選択し、
「共有リストを作成」ボタンから作成しようとすると、実際には作成されず
`共有リスト「hoge」を作成しました（モック）。` と表示される。

## 関連情報

- Issue: #1998
- 関連タスクドキュメント Issue: #1999
- タスクタイプ: サービスタスク（share-together/web）

## 再現手順

1. リスト画面を開く
2. 表示範囲を「共有」に変え、任意のグループを選択する
3. 「共有リストを作成」ボタンを押下する
4. リスト名を入力し、「作成」ボタンを押下する
5. `共有リスト「hoge」を作成しました（モック）。` と表示される（実際には作成されていない）

## 根本原因の調査結果

### 該当ファイル

- `services/share-together/web/src/components/ListWorkspace.tsx`

### 原因

`ListWorkspace` コンポーネントの `handleCreateList` 関数が、リスト名を受け取って
モックメッセージを表示するだけで、API を呼び出していない。

```typescript
// ListWorkspace.tsx（現状）
const handleCreateList = (name: string) => {
  setSnackbarMessage(
    scope === 'personal'
      ? `個人リスト「${name}」を作成しました（モック）。`
      : `共有リスト「${name}」を作成しました（モック）。`
  );
};
```

`createDialogOpen` は共有スコープ時にのみ `setCreateDialogOpen(true)` でダイアログを開くが、
`CreateItemDialog` の `onCreate` コールバックは `handleCreateList` に接続されており、
実際の API 呼び出しが行われていない。

### 比較: 動作している実装（GroupDetailClient）

`GroupDetailClient.tsx` には共有リスト作成の実装があり、
`POST /api/groups/{groupId}/lists` を呼び出している。
`ListWorkspace.tsx` の共有リスト作成も同じ API エンドポイントを使うべきである。

### API エンドポイント

- `POST /api/groups/{groupId}/lists`
- リクエストボディ: `{ "name": "リスト名" }`
- レスポンス: `{ "data": { "listId": "uuid", "groupId": "...", "name": "...", ... } }`

## 対応方針

`handleCreateList` を非同期関数に変更し、共有スコープの場合に
`POST /api/groups/{selectedGroupId}/lists` を呼び出す実装に置き換える。

- 成功時: `sharedListsByGroup` の該当グループのリスト一覧に新規リストを追加し、
  `selectedListId` を新規リストの `listId` に更新する
- 失敗時: エラーメッセージをスナックバーで表示する
- `ERROR_MESSAGES` に `SHARED_LIST_CREATE_FAILED` 定数を追加する

なお、個人リスト作成は `ListSidebar`（`apiEnabled={true}`）側で処理されており、
`handleCreateList` からは共有スコープのみ呼ばれる想定だが、
既存の個人スコープ分岐はそのままモックから実装に置き換えるか、
共有スコープのみを対象として整理する。

## タスク

- [x] T001: `ListWorkspace.tsx` の `handleCreateList` を実装する
  - 非同期関数に変更する
  - `POST /api/groups/${selectedGroupId}/lists` を呼び出す
  - 成功時: `sharedListsByGroup` を更新し、`selectedListId` を新規 `listId` にセットする
  - 失敗時: エラーメッセージをスナックバーで表示する
  - `ERROR_MESSAGES` に `SHARED_LIST_CREATE_FAILED` 定数を追加する
- [x] T002: ユニットテストの追加・更新
  - 共有リスト作成時に `POST /api/groups/{groupId}/lists` が呼ばれることをテストする
  - 成功時にリスト一覧が更新されることをテストする
  - 失敗時にエラーメッセージが表示されることをテストする
- [x] T003: E2E テストの追加・更新
  - `tests/e2e/group-management.spec.ts` または新規ファイルに
    共有リスト作成のシナリオを追加する

## 参考ドキュメント

- `docs/services/share-together/` - サービス仕様
- `docs/development/rules.md` - コーディング規約
- `services/share-together/web/src/components/GroupDetailClient.tsx` - 動作している実装の参考
