# Admin ワークフロー改善 - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/services/admin/deployment.md に統合し、
    tasks/issue-2405-admin-workflow/ ディレクトリごと削除します。

    入力: tasks/issue-2405-admin-workflow/requirements.md
    次に作成するドキュメント: tasks/issue-2405-admin-workflow/tasks.md
-->

## 現状の問題

`admin-deploy.yml` の `deploy` ジョブでは以下の順で処理が行われている：

1. Secrets Manager からシークレットを取得（`aws-secretsmanager-get-secrets`）
2. CDK で全スタックをデプロイ（`--all`）

初回デプロイ時、Secrets Manager のシークレット（`nagiyu-admin-vapid-{env}`）は未作成のため、手順1で `ResourceNotFoundException` が発生しデプロイが失敗する。

---

## API 仕様

<!-- 外部公開 API の変更なし -->

---

## データモデル

<!-- データモデルの変更なし -->

---

## コンポーネント設計

### ワークフロー構成の変更方針

現在の `admin-deploy.yml` のジョブ依存関係：

```
infrastructure (ECR のみ)
    └── build (Docker image)
            └── deploy (Secrets 取得 → --all デプロイ)
                    └── cloudfront-invalidation
```

変更後のジョブ依存関係：

```
infrastructure (ECR + AdminInfra スタック)
    └── build (Docker image)
            └── deploy (Secrets 取得 → Lambda + CloudFront デプロイ)
                    └── cloudfront-invalidation
```

### `infrastructure` ジョブへの追加ステップ

既存の ECR デプロイステップの後に、AdminInfra スタックのデプロイステップを追加する。

| スタック名                   | 内容                                  | 追加タイミング     |
| ---------------------------- | ------------------------------------- | ------------------ |
| `NagiyuAdminECR{Suffix}`     | ECR リポジトリ（既存）                | 既存ステップ       |
| `NagiyuAdminInfra{Suffix}`   | SNS + DynamoDB + Secrets Manager      | **新規追加ステップ** |

`NagiyuAdminInfra{Suffix}` スタックは `AdminStack` で定義されており、内部で `SecretsStack`（VAPID シークレット）を作成する。
CDK は冪等性があるため、2回目以降のデプロイでも安全に実行できる。

### `deploy` ジョブの `--all` からの変更

`deploy` ジョブは現在 `--all` を使って全スタックをデプロイしている。
`NagiyuAdminInfra{Suffix}` が `infrastructure` ジョブで事前デプロイされる場合、`deploy` ジョブでは Lambda と CloudFront のみデプロイすれば十分である。

ただし、`--all` のままでも CDK の冪等性により安全に動作する（既存リソースは変更なし）ため、変更の影響範囲を最小化する観点では `--all` のままでもよい。

推奨: `infrastructure` ジョブでの追加デプロイのみを行い、`deploy` ジョブの `--all` はそのまま維持する（変更最小化）。

### 実装対象ファイル

| ファイル                              | 変更内容                                       |
| ------------------------------------- | ---------------------------------------------- |
| `.github/workflows/admin-deploy.yml`  | `infrastructure` ジョブに AdminInfra スタックのデプロイステップを追加 |

---

## 実装上の注意点

### 依存関係・前提条件

- `NagiyuAdminInfra{Suffix}` は `@nagiyu/infra-admin` ワークスペースで定義されている
- `infrastructure` ジョブには既に CDK のビルドと AWS 認証設定が含まれており、追加ステップはそれらを再利用できる
- CDK の cdk.json に `NagiyuAdminInfra{Suffix}` スタックが正しく定義されていること（`infra/admin/bin/admin.ts` で確認済み）

### パフォーマンス考慮事項

- AdminInfra スタックのデプロイは初回数分程度かかるが、2回目以降は変更がなければ数秒で完了する

### セキュリティ考慮事項

- `SecretsStack` が作成するシークレットの初期値は `REPLACE_ME` プレースホルダーである
- 実際の VAPID キー値は初回デプロイ後に手動で Secrets Manager を更新して設定する（既存運用に変更なし）
- `deploy` ジョブで Secrets Manager からの取得値が `REPLACE_ME` の場合でも Lambda デプロイは完了するが、Web Push 通知は機能しない（これは既存の制約）

---

## docs/ への移行メモ

<!-- 開発完了後にここを確認し、docs/ を更新してからこのディレクトリを削除する -->

- [ ] `docs/services/admin/deployment.md` の「初回セットアップ」セクションを更新すること：
      初回デプロイ時の前提条件として「`infrastructure` ジョブで AdminInfra スタックが自動作成される」旨を追記する
- [ ] `docs/services/admin/deployment.md` の CI/CD パイプライン説明（ジョブ構成）を実態に合わせて更新すること
