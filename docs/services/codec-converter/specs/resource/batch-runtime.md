---
sources:
  - infra/codec-converter/lib/codec-converter-stack.ts
  - infra/codec-converter/lib/ecr-stacks.ts
  - infra/codec-converter/lib/roles/batch-job-role.ts
  - infra/common/src/grants/error-events-writer.ts
  - infra/common/src/utils/image-tag.ts
  - infra/common/src/utils/naming.ts
  - infra/common/src/utils/vpc.ts
  - services/codec-converter/batch/src/index.ts
sources_hash: 3133c5f11de1a473f54644354af2f6c906d3074df6139e50d6c0d6aa07d9d0ac
---

# Batch の実行環境

[変換バッチ](../batch/convert.md)を動かす AWS Batch の構成。Fargate のコンピュート環境、ジョブキュー、ジョブ定義 4 つ、2 つの IAM ロール、ログのロググループ。

## リソース

| 名前 | 種類 | 用途 |
|---|---|---|
| `nagiyu-codec-converter-{env}` | Batch のコンピュート環境 (Fargate) | 変換のコンテナを動かす |
| `nagiyu-codec-converter-{env}` | Batch のジョブキュー | 投入されたジョブを順に処理する |
| `nagiyu-codec-converter-{env}-{サイズ}` | Batch のジョブ定義 (4 つ) | サイズごとの CPU・メモリを持つ。サイズは `small`、`medium`、`large`、`xlarge` |
| セキュリティグループ (名前は CDK が決める) | EC2 のセキュリティグループ | コンピュート環境のタスクにつける |
| タスク実行ロール、ジョブロール (名前は CDK が決める) | IAM ロール | コンテナの起動と、コンテナの中の処理 |
| `/aws/batch/nagiyu-codec-converter-{env}` | CloudWatch Logs のロググループ | 変換バッチのログ |

`{env}` は `dev` か `prod`。スタックは `NagiyuCodecConverter{Env}` で、[Web の実行環境](./web-runtime.md)や[ストレージ](./storage.md)と同じスタックにある。ワーカーのイメージの置き場 (ECR) は[デプロイ先](../deploy.md)の「スタック」にある。

## 設定値

### コンピュート環境とジョブキュー

| 項目 | 値 |
|---|---|
| 種類 | 管理型 (`MANAGED`) の Fargate |
| 最大 vCPU | 16 |
| サブネット | [共有 VPC](../../../../platform/specs/resource/vpc.md) のパブリックサブネット (SSM パラメータから取り込む、2 つの AZ) |
| セキュリティグループ | このスタックが作る。インバウンドの許可はなく、アウトバウンドはすべて許可する |
| パブリック IP | 割り当てる (ジョブ定義の `assignPublicIp`)。共有 VPC に NAT ゲートウェイはない |
| ジョブキューの優先度 | 1 |
| ジョブキューが使うコンピュート環境 | 上の 1 つだけ |

### ジョブ定義

4 つのジョブ定義は、サイズ以外の設定が同じ。サイズごとの vCPU・メモリと、投入時の選び方は[ジョブ定義のサイズ](../term/job-definition-size.md)にある。

| 項目 | 値 |
|---|---|
| 実行基盤 | Fargate |
| イメージ | ワーカー用の ECR リポジトリ (`nagiyu-codec-converter-batch-ecr-{env}`) の、環境変数 `IMAGE_TAG` のタグ。Web の関数と同じタグ。`IMAGE_TAG` がないか空なら、合成が失敗する |
| 試行の回数 | 2 (リトライは 1 回) |
| 試行ごとのタイムアウト | 7,200 秒 |
| ログの出力先 | ロググループ `/aws/batch/nagiyu-codec-converter-{env}` ([ロググループ](#ロググループ))。ストリームの接頭辞は `batch` (`awslogs`) |
| タスク実行ロール | 下の「権限」のタスク実行ロール |
| ジョブロール | 下の「権限」のジョブロール |

### ロググループ

| 項目 | 値 |
|---|---|
| 名前 | `/aws/batch/nagiyu-codec-converter-{env}` |
| 保持期間 | 1 週間 |
| 削除ポリシー | 削除する (`DESTROY`)。スタックを削除すると、ログも消える |

## 環境変数

ジョブ定義が持つ値。起動ごとに変わる `JOB_ID` と `OUTPUT_CODEC` は、投入時に渡す ([変換バッチ](../batch/convert.md)の「起点」)。

| 名前 | 意味 | 値 |
|---|---|---|
| `DYNAMODB_TABLE_NAME` | [ジョブのテーブル](../data/jobs.md)の名前 | `nagiyu-codec-converter-jobs-{env}` |
| `S3_BUCKET` | [ストレージ](./storage.md)のバケット名 | `nagiyu-codec-converter-storage-{env}` |
| `AWS_REGION` | リージョン | スタックのリージョン |
| `ERROR_EVENTS_TABLE_NAME` | エラー履歴の書き込み先 | `nagiyu-error-events-{env}` |

- `JOB_DEFINITION_NAME` は、変換バッチがあればログに出すだけの値で、ジョブ定義はこの環境変数を設定しない。そのため、ログでは `unknown` になる
- `NODE_ENV` は設定しない

## 権限

| ロール | 対象 | 許可する操作 |
|---|---|---|
| タスク実行ロール | ECS のタスクの実行 | AWS 管理ポリシー `AmazonECSTaskExecutionRolePolicy` (イメージの取得とログの書き込み) |
| タスク実行ロール | ワーカーの ECR リポジトリ | イメージの取得 (`grantPull`) |
| ジョブロール | [ストレージ](./storage.md)のバケットと、その中のオブジェクト | 読み取りと書き込み (CDK の `grantReadWrite`) |
| ジョブロール | [ジョブのテーブル](../data/jobs.md) | 項目の読み取りと書き込み (CDK の `grantReadWriteData`) |
| ジョブロール | [エラーイベントのテーブル](../../../../platform/specs/data/error-events.md) | `dynamodb:PutItem` (共通部品の `grantErrorEventsWrite`) |

- どちらのロールも `ecs-tasks.amazonaws.com` が引き受ける
- ジョブロールは、署名付き URL を使わずに、S3 を直接読み書きする。入力を取り、出力を置くのは変換バッチ自身だから
- Web の側の権限は[Web の実行環境](./web-runtime.md)にある

## 理由

- 変換に AWS Batch を使う。変換は最大 2 時間かかり、Lambda の上限 (15 分) を超えるため。ECS のサービスは、ジョブのキューを自前で作る必要があり、Batch はキューを持つ
- コンピュート環境の最大 vCPU を 16 にする。小さいサイズのジョブは複数、大きいサイズのジョブは少数を同時に動かせる。上限を超えた分は、ジョブキューで待つ
