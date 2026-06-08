---
name: pr-create
description: Draft PR を作成する。実装単位の作業ブランチから integration/** または develop へ PR を出すとき、PR テンプレートを埋めて Draft で作成し CI をウォッチするとき。Ready 化・マージ・クローズは人手のため行わない。
---

# PR 作成フロー

オーケストレーターが実装結果を客観信号（テスト / ビルド / diff）で検証したあと、Draft PR を作成する手順。**PR 作成はサブエージェントにさせない**（オーケストレーターの責務）。

## 鉄則

- **必ず Draft で作成する**。Draft → Ready の切替・マージ・クローズは**人手**（Claude は行わない）。
- レビュー対応で追加 push しても **Draft 状態を維持**する。
- `.github/pull_request_template.md` の構造をすべて埋める（変更概要・関連 Issue・変更種別・実装チェックリスト・テスト内容・レビューポイント・UI 変更時はスクリーンショット）。
- 出力（PR タイトル・本文・コメント）は日本語。

## ターゲットブランチの選び方

| 変更の性質 | ターゲット | integration |
|---|---|---|
| dev 環境に資材が出る／多段で積み上げる／完成前に develop を汚したくない | `integration/{issue-number}-{slug}` | 切る（分岐元 develop） |
| 非デプロイの軽量変更（docs / CLAUDE.md / `.claude/skills` / 小さなワークフロー改修） | `develop` 直接 | 切らない |

迷ったら [`docs/branching.md`](../../../docs/branching.md) と CLAUDE.md「integration の考え方」を参照。

## `Closes #` の扱い

- **作業ブランチ → integration の PR**：`Closes #{issue}` を**含めない**（Issue は integration → develop マージ後にクローズ）。
- **integration → develop の PR**：`Closes #{issue}` を含めてよい。**ただし作成前に必ず人へ確認を取る**（MUST NOT: 無断作成）。
- 作業ブランチ → develop 直接で、その PR が Issue を完了させきらない場合（Phase が残る等）は Close せず参照に留める。

## 作成後

- 作成した PR の CI をウォッチし、失敗は autofix する（`subscribe_pr_activity`）。
- 実装単位（サブエージェント 1 回）ごとに**小さい Draft PR**とし、大粒度レビューを避ける。

## やらないこと（MUST NOT）

- Draft → Ready の切替、マージ、クローズ（明示指示がある場合を除く）
- ラベル・マイルストーン・Assignee の付与
- `integration/** → develop` の PR を人の確認なく作成する

## 関連

- [`.github/pull_request_template.md`](../../../.github/pull_request_template.md)
- [`docs/branching.md`](../../../docs/branching.md)
