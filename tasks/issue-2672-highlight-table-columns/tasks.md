# クリップ一覧の列オプショナル化 - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-2672-highlight-table-columns/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/issue-2672-highlight-table-columns/requirements.md — 受け入れ条件・ユースケース
    - tasks/issue-2672-highlight-table-columns/design.md — データモデル・コンポーネント設計
-->

## Phase 1: 定数・型の追加

<!-- 列定義の基盤を整備する -->

- [x] T001: 列定義定数ファイルの作成（依存: なし）
    - `web/src/constants/highlightTableColumns.ts` を新規作成する
    - `ColumnDefinition` 型（id / label / fixed / defaultVisible）を定義する
    - 固定列（No. / 開始〜終了 / 採否）とオプション列（抽出根拠）の定義配列を作成する

## Phase 2: カスタムフックの実装

<!-- 列表示状態の管理ロジックを hooks に分離する -->

- [ ] T002: `useColumnVisibility` フックの実装（依存: T001）
    - `web/src/hooks/useColumnVisibility.ts` を新規作成する
    - 引数として `ColumnDefinition[]` を受け取る
    - `defaultVisible` を初期値として列表示状態を管理する
    - 列の表示状態トグル関数と現在の表示状態マップを返す
- [ ] T003: `useColumnVisibility` フックの単体テスト（依存: T002）
    - `web/src/hooks/useColumnVisibility.test.ts` を新規作成する
    - `defaultVisible` が初期状態として使用されることをテストする
    - トグル操作後に表示状態が反転することをテストする

## Phase 3: UI コンポーネントの実装

<!-- 列設定ボタン + ポップオーバーコンポーネントを実装する -->

- [ ] T004: `ColumnVisibilityButton` コンポーネントの実装（依存: T001）
    - `web/src/components/highlights/ColumnVisibilityButton.tsx` を新規作成する
    - アイコンボタン（設定アイコン）をクリックするとポップオーバーが開閉する
    - ポップオーバー内にオプション列のチェックボックスリストを表示する
    - チェック変更時にコールバック（トグル関数）を呼び出す
    - ポップオーバー外クリックで閉じる（MUI `Popover` の onClose を利用）

## Phase 4: HighlightsPage への統合

<!-- 既存ページコンポーネントに列表示切り替えを組み込む -->

- [ ] T005: `HighlightsPage` の右パネルテーブルへの統合（依存: T002, T004）
    - `web/src/app/jobs/[jobId]/highlights/page.tsx` を変更する
    - `useColumnVisibility` フックを呼び出し、列表示状態を取得する
    - テーブルヘッダーの右上に `ColumnVisibilityButton` を配置する
    - `TableHead` の各 `TableCell` および `TableBody` の各 `TableCell`（抽出根拠列）を、
      表示状態に応じて条件付きレンダリングする
    - 抽出根拠列の表示値は既存の `HIGHLIGHT_SOURCE_LABELS` 定数を流用する

## Phase 5: 動作確認・品質保証

- [ ] T006: ブラウザでの動作確認（依存: T005）
    - 初回表示時に「抽出根拠」列が非表示であることを確認する
    - 列設定ボタンをクリックしてポップオーバーが開くことを確認する
    - 「抽出根拠」をチェックするとテーブルに列が即座に追加されることを確認する
    - 既存の No. / 開始〜終了 / 採否 列が常時表示であることを確認する
- [ ] T007: Lint・型チェックの通過確認（依存: T005）
    - `pnpm lint` および `pnpm tsc --noEmit` が通過することを確認する

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件をすべて満たしている
- [ ] テストカバレッジ 80% 以上（`useColumnVisibility` フック）
- [ ] Lint・型チェックがすべて通過している
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `docs/services/quick-clip/requirements.md` の F-003 を更新し、F-014 を追記した
- [ ] `docs/services/quick-clip/external-design.md` の SCR-003 を更新した
- [ ] `tasks/issue-2672-highlight-table-columns/` ディレクトリを削除した
