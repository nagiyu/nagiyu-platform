# 週次ドキュメントレビュー 第13週（2026-03-30） - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/weekly-docs-review-w13-2026/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/weekly-docs-review-w13-2026/requirements.md — 受け入れ条件・ユースケース
    - tasks/weekly-docs-review-w13-2026/design.md — 調査結果・修正対象ファイル
-->

## Phase 1: Priority 1 チェック（必須・確認完了）

<!-- 二重管理ドキュメントの整合性確認。design.md の調査で整合性確認済み。 -->

- [x] Copilot Instructions ⇄ rules.md の整合性確認（整合性あり、修正不要）
- [x] Jest coverageThreshold ⇄ testing.md の整合性確認（整合性あり、修正不要）
- [x] Issue Template ⇄ rules.md の整合性確認（整合性あり、修正不要）
- [x] PR Template ⇄ development ドキュメントの整合性確認（整合性あり、修正不要）

## Phase 2: Priority 2 チェック（推奨）

<!-- 構造的整合性の確認と修正 -->

- [x] Branch Strategy 整合性確認（整合性あり、修正不要）
- [ ] `docs/development/monorepo-structure.md` の `libs/nextjs/` 追加（F-004）
    - 「対象」リストに `libs/nextjs/` を追記する
    - ディレクトリツリー（`libs/` 配下）に `libs/nextjs/` エントリを追加する
    - 依存関係ルールセクションに `libs/nextjs → libs/common` を追記する
    - 他の libs/nextjs の記述と整合するよう内容を確認する（`shared-libraries.md` を参照）
- [x] Test Device Configuration 整合性確認（整合性あり、修正不要）

## Phase 3: Priority 3 チェック（推奨・確認完了）

<!-- ドキュメント間の広範な整合性確認。design.md の調査で完了。 -->

- [x] テストカバレッジ 80% 記載一貫性確認（整合性あり、修正不要）
- [x] ライブラリ依存方向の記載一貫性確認（F-004 の修正で対応）
- [x] MUST/SHOULD ルール重複・矛盾チェック（整合性あり、修正不要）
- [x] ドキュメント間のリンク切れチェック（リンク切れなし）
- [x] ドキュメント間の重複記述チェック（整合性あり、修正不要）

## Phase 4: Priority 4 チェック（任意・スキップ）

<!-- 実装との乖離チェック。今週の変更範囲外のためスキップ。 -->

- [x] 実装との乖離チェック（スキップ）
- [x] 方針変更の追従漏れチェック（整合性あり、修正不要）

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件をすべて満たしている
- [ ] `docs/development/monorepo-structure.md` の `libs/nextjs/` 追加が完了した
- [ ] Lint・型チェックがすべて通過している（Markdown の場合は Prettier のみ）
- [ ] Issue #2474 の「発見した問題」セクションに修正内容を記録した
- [ ] `tasks/weekly-docs-review-w13-2026/` ディレクトリを削除した
