# Admin ワークフロー改善 - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-2405-admin-workflow/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/issue-2405-admin-workflow/requirements.md — 受け入れ条件・ユースケース
    - tasks/issue-2405-admin-workflow/design.md — ワークフロー変更設計
-->

## Phase 1: ワークフロー修正

<!-- admin-deploy.yml の infrastructure ジョブに AdminInfra スタックのデプロイを追加する -->

- [x] T001: `.github/workflows/admin-deploy.yml` の `infrastructure` ジョブに「Deploy Infrastructure (AdminInfra)」ステップを追加する（依存: なし）
    - 既存の「Deploy Infrastructure (ECR)」ステップの後に追加
    - `NagiyuAdminInfra${envSuffix}` スタックを `npm run deploy --workspace=@nagiyu/infra-admin` で指定してデプロイ
    - `--context env=` と `--require-approval never` を付与

## Phase 2: 動作確認

<!-- 新規環境への初回デプロイを想定した確認 -->

- [ ] T002: ワークフローを手動実行（`workflow_dispatch`）して `infrastructure` ジョブが正常完了することを確認する（依存: T001）
- [ ] T003: `deploy` ジョブの Secrets Manager 取得ステップが `ResourceNotFoundException` を発生させずに完了することを確認する（依存: T002）
- [ ] T004: Lambda および CloudFront のデプロイが正常完了し、ヘルスチェックが通ることを確認する（依存: T003）

## Phase 3: ドキュメント更新

- [x] T005: `docs/services/admin/deployment.md` の「初回セットアップ」セクションに AdminInfra スタックが `infrastructure` ジョブで自動デプロイされる旨を追記する（依存: T002）
- [x] T006: `docs/services/admin/deployment.md` の CI/CD パイプライン説明（ジョブ構成）を最新の状態に更新する（依存: T005）

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件（UC-001 正常フロー）をすべて満たしている
- [ ] 初回デプロイ時に手動介入なしでワークフローが完了する
- [ ] 既存の再デプロイ（2回目以降）に影響がない
- [ ] Lint・型チェックがすべて通過している（ワークフロー YAML の構文エラーなし）
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `docs/services/admin/deployment.md` を更新した
- [ ] `tasks/issue-2405-admin-workflow/` ディレクトリを削除した
