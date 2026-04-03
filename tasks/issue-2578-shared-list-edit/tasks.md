# 共有リスト編集機能 - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-2578-shared-list-edit/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/issue-2578-shared-list-edit/requirements.md — 受け入れ条件・ユースケース
    - tasks/issue-2578-shared-list-edit/design.md — API 仕様・コンポーネント設計
-->

## Phase 1: `ListSidebar` コンポーネントの拡張

<!-- 共有リスト向けの編集・削除コールバック props を追加する -->

- [ ] T001: `ListSidebarProps` に `onRenameList?: (list: SidebarList) => void` を追加する（依存: なし）
- [ ] T002: `ListSidebarProps` に `onDeleteList?: (list: SidebarList) => void` を追加する（依存: なし）
- [ ] T003: `secondaryAction` の表示条件を変更し、`!hasExternalLists` に加えて `onRenameList` または `onDeleteList` が存在する場合にもアイコンボタンを表示する（依存: T001, T002）
- [ ] T004: 編集ボタンのクリックハンドラを変更し、`onRenameList` が渡されている場合はコールバックを呼び出し、なければ既存の `handleRenameList` を呼び出す（依存: T003）
- [ ] T005: 削除ボタンのクリックハンドラを変更し、`onDeleteList` が渡されている場合はコールバックを呼び出し、なければ既存の `handleDeleteList` を呼び出す（依存: T003）
- [ ] T006: `ListSidebar` の既存テスト (`tests/unit/components/ListSidebar.test.tsx`) が引き続き通ることを確認する（依存: T001〜T005）
- [ ] T007: `onRenameList`・`onDeleteList` を渡した場合のテストケースを追加する（依存: T006）

## Phase 2: `ListWorkspace` への共有リスト編集ロジック追加

<!-- 共有スコープでの名前変更・削除ロジックを実装し、ListSidebar に渡す -->

- [ ] T008: `handleRenameSharedList(list)` 関数を実装する（`window.prompt` → `PUT /api/groups/{groupId}/lists/{listId}` → ステート更新）（依存: Phase 1）
- [ ] T009: `handleDeleteSharedList(list)` 関数を実装する（`window.confirm` → `DELETE /api/groups/{groupId}/lists/{listId}` → ステート更新・遷移）（依存: Phase 1）
- [ ] T010: 共有スコープの `ListSidebar` に `onRenameList={handleRenameSharedList}` を渡す（依存: T008）
- [ ] T011: 共有スコープの `ListSidebar` に `onDeleteList={handleDeleteSharedList}` を渡す（依存: T009）
- [ ] T012: `ListWorkspace` のテストを追加・更新する（依存: T008〜T011）

## Phase 3: 動作確認・最終チェック

- [ ] T013: ローカル環境で共有スコープ切り替え後に編集・削除ボタンが表示されることを確認する
- [ ] T014: 名前変更が正常に反映されることを確認する
- [ ] T015: 削除後に残りのリストへ自動遷移することを確認する（削除後0件時の挙動も確認）
- [ ] T016: 個人スコープで編集・削除ボタンの挙動が従来通りであることを確認する

---

## 完了チェック

- [ ] `requirements.md` の受け入れ基準をすべて満たしている
- [ ] テストカバレッジ 80% 以上（`share-together/web`）
- [ ] Lint・型チェックがすべて通過している
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `docs/services/share-together/` の該当ファイルを更新した
- [ ] `tasks/issue-2578-shared-list-edit/` ディレクトリを削除した
