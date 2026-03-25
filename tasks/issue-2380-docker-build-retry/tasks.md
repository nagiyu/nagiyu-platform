<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-2380-docker-build-retry/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/issue-2380-docker-build-retry/requirements.md — 受け入れ条件・ユースケース
    - tasks/issue-2380-docker-build-retry/design.md — 設計方針
-->

# Docker ビルド失敗の抑制 - 実装タスク

## Phase 1: リトライロジックの実装

- [ ] T001: `.github/actions/build-docker-image/action.yml` の「Build Docker image」ステップを修正し、`toomanyrequests` エラー検知とリトライループを組み込む（依存: なし）
    - `MAX_RETRIES=5`、`RETRY_WAIT_SECONDS=60` を定数として定義する
    - `docker build` の標準エラー出力を一時ファイルに保存し、終了コード失敗時に `toomanyrequests` を検知する
    - 検知時は待機後にリトライ、それ以外のエラーは即座に失敗させる
    - リトライ発生時のログメッセージを日本語で出力する

## Phase 2: 動作確認

- [ ] T002: ローカル環境でシェルスクリプトの分岐ロジックを単体で確認する（依存: T001）
    - `toomanyrequests` を含む出力をモックして、リトライが発生することを確認する
    - それ以外のエラーでは即座に失敗することを確認する
    - リトライ上限（5 回）超過で失敗することを確認する

- [ ] T003: CI でデプロイワークフローを手動実行（`workflow_dispatch`）し、Docker ビルドが正常に通ることを確認する（依存: T002）

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件をすべて満たしている
- [ ] Lint・シェルスクリプトの構文チェックが通過している（`shellcheck` 等）
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `tasks/issue-2380-docker-build-retry/` ディレクトリを削除した
