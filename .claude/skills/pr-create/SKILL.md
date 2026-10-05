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
- タイトルは「何を変えるか」を文で書き、種別プレフィックスは付けない。

## ターゲットブランチの選び方

| 変更の性質 | ターゲット | integration |
|---|---|---|
| dev 環境に資材が出る／多段で積み上げる／完成前に develop を汚したくない | `integration/{issue-number}-{slug}` | 切る（分岐元 develop） |
| 非デプロイの軽量変更（docs / CLAUDE.md / `.claude/skills` / 小さなワークフロー改修） | `develop` 直接 | 切らない |

迷ったら [`docs/branching.md`](../../../docs/branching.md) と CLAUDE.md「integration の考え方」を参照。

## 関連 Issue とクローズ

- `Closes #` 等の closing keyword は**書かない**。関連 Issue は `#番号` で参照するだけにする。
- Issue は完了した時点で、開いていれば Claude が手動でクローズする。
    - 親（メイン）Issue: 全資材が develop に載ってから（integration → develop マージ後）。
    - サブ Issue: integration 取り込み + dev 反映確認後。進捗の可視化が目的。
- integration → develop の PR は、**作成前に必ず人へ確認を取る**（MUST NOT: 無断作成）。

## 作成後

- 作成した PR の CI をウォッチし、失敗は autofix する（`subscribe_pr_activity`）。
- 実装単位（サブエージェント 1 回）ごとに**小さい Draft PR**とし、大粒度レビューを避ける。
    - 目安は差分 1000 行程度（追加 + 削除。画像などのバイナリと、`package-lock.json` などの自動生成ファイルは数えない）。
    - 分割はビルド・動作が壊れない単位で行う。壊さずに分割するのが難しい場合は超えてよい。

## やらないこと（MUST NOT）

- Draft → Ready の切替、マージ、クローズ（明示指示がある場合を除く）
- ラベル・マイルストーン・Assignee の付与
- `integration/** → develop` の PR を人の確認なく作成する

## 関連

- [`.github/pull_request_template.md`](../../../.github/pull_request_template.md)
- [`docs/branching.md`](../../../docs/branching.md)
