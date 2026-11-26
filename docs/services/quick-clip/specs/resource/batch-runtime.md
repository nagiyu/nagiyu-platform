---
sources:
  - infra/quick-clip/lib/batch-stack.ts
  - infra/quick-clip/lib/monitoring-stack.ts
  - infra/quick-clip/bin/quick-clip.ts
  - services/quick-clip/batch/Dockerfile
  - services/quick-clip/web/src/lib/server/submit-extract-job.ts
sources_hash: e39490389763a1973673c6ea79e8fda1b633e91cffbb2d7f20b52a8143897dbf
---

# バッチの実行環境

抽出バッチを動かす AWS Batch (Fargate) の計算環境・ジョブキュー・ジョブ定義 3 つと、そのロール・ロググループ・セキュリティグループ。Batch のジョブの失敗を Admin のアラームのトピックへ流す EventBridge のルールも含む。

## リソース

| 名前 | 種類 | 用途 |
|---|---|---|
| `nagiyu-quick-clip-{env}` | AWS Batch の計算環境 (Fargate) | ジョブを動かす |
| `nagiyu-quick-clip-{env}` | AWS Batch のジョブキュー | Web がジョブを投入する先 ([ジョブ API](../api/jobs.md)) |
| `nagiyu-quick-clip-{env}-small` | AWS Batch のジョブ定義 | 小さいジョブ |
| `nagiyu-quick-clip-{env}-large` | AWS Batch のジョブ定義 | 中くらいのジョブ |
| `nagiyu-quick-clip-{env}-xlarge` | AWS Batch のジョブ定義 | 大きいジョブ |
| セキュリティグループ | EC2 のセキュリティグループ | ジョブのタスクに付ける。外向きの通信はすべて許可し、内向きは許可しない |
| (CDK が決める名前) | IAM ロール (タスク実行ロール) | イメージの取得とログの出力 |
| (CDK が決める名前) | IAM ロール (ジョブロール) | コンテナの中のコードが持つ権限 |
| `/aws/batch/nagiyu-quick-clip-{env}` | CloudWatch Logs のロググループ | ジョブのログ |
| `nagiyu-quick-clip-batch-ecr-{env}` | ECR リポジトリ | ジョブのイメージの置き場 |
| `nagiyu-quick-clip-batch-job-failed-{env}` | EventBridge のルール | ジョブの失敗を Admin のアラームのトピックへ流す |

`{env}` は `dev` か `prod`。Batch のリソースのスタックは `NagiyuQuickClipBatch{Env}`、EventBridge のルールのスタックは `NagiyuQuickClipMonitoring{Env}` ([デプロイ先](../deploy.md))。どのジョブ定義を選ぶかは[ジョブ定義のサイズ](../term/job-definition-size.md)にある。

## 設定値

### 計算環境とジョブキュー

| 項目 | 値 |
|---|---|
| 計算環境の種類 | マネージド、Fargate |
| 計算環境の最大 vCPU | 32 |
| 計算環境の置き場所 | 共有 VPC ([共有 VPC](../../../../platform/specs/resource/vpc.md)) のパブリックサブネット |
| ジョブキューの優先度 | 1 (計算環境は 1 つ) |
| ロググループの保持期間 | 1 週間。スタックを削除すると一緒に消える |

### ジョブ定義

3 つのジョブ定義で違うのは、次の値だけである。

| 項目 | `small` | `large` | `xlarge` |
|---|---|---|---|
| vCPU | 4 | 8 | 8 |
| メモリ | 8,192 MiB | 16,384 MiB | 16,384 MiB |
| 一時ストレージ | 指定なし (Fargate の既定) | 30 GiB | 60 GiB |
| タイムアウト (1 試行あたり) | 2 時間 | 3 時間 | 8 時間 |
| 試行回数 | 1 (Batch は再試行しない) | 1 | 1 |

3 つに共通する値は次のとおり。

| 項目 | 値 |
|---|---|
| プラットフォーム | Fargate |
| イメージ | `{アカウント}.dkr.ecr.{リージョン}.amazonaws.com/nagiyu-quick-clip-batch-ecr-{env}:{IMAGE_TAG}`。`IMAGE_TAG` はデプロイ時の環境変数 (コミットの SHA) で、なければ合成が失敗する |
| 起動のコマンド | `node services/quick-clip/batch/dist/src/index.js` |
| パブリック IP | 付ける |
| ログの出力先 | 上のロググループ。ストリームの接頭辞は `batch` |
| タスク実行ロール・ジョブロール | 3 つで同じロール |

- イメージは Debian (`node:26-slim`) に、apt で入れた FFmpeg を足したもの
- Batch のスタックはタグを付けない。EventBridge のルールのスタックには、`Application` が `nagiyu`、`Service` が `quick-clip`、`Component` が `monitoring`、`Environment` が環境名のタグが付く

## 環境変数

ジョブ定義が渡す値。3 つとも同じ。

| 名前 | 意味 | 値の出どころ |
|---|---|---|
| `DYNAMODB_TABLE_NAME` | [ジョブのテーブル](../data/jobs-table.md)の名前 | `nagiyu-quick-clip-jobs-{env}` |
| `S3_BUCKET` | [ストレージ](./storage.md)のバケットの名前 | `nagiyu-quick-clip-storage-{env}` |
| `AWS_REGION` | リージョン | スタックのリージョン |
| `OPENAI_API_KEY` | OpenAI の API キー | CDK の context `openAiApiKey`。デプロイのワークフローが[シークレット](./secrets.md)から取り出して渡す。なければ仮の値 `PLACEHOLDER` |
| `ERROR_EVENTS_TABLE_NAME` | エラー履歴の書き込み先 | `nagiyu-error-events-{env}` |

投入のたびに変わる値 (`BATCH_COMMAND`、`JOB_ID`、`EMOTION_FILTER`、`AI_ANALYSIS`) は、Web が投入のときに渡す。ジョブ名は `quick-clip-extract-{jobId}` (128 文字まで)。

## 権限

| ロール | 対象 | 許可する操作 |
|---|---|---|
| タスク実行ロール | AWS 管理ポリシー `AmazonECSTaskExecutionRolePolicy` | イメージの取得とログの出力に必要な操作 |
| ジョブロール | [ストレージ](./storage.md)のバケットとそのオブジェクト | CDK の `grantReadWrite` が付ける、読み取り・一覧・書き込み・削除 |
| ジョブロール | [ジョブのテーブル](../data/jobs-table.md) | CDK の `grantReadWriteData` が付ける、読み取りと書き込み (削除を含む) |
| ジョブロール | [エラーイベントのテーブル](../../../../platform/specs/data/error-events.md) | `dynamodb:PutItem` |

- ジョブロールは Secrets Manager を読む権限を持たない。OpenAI の API キーは、デプロイのときにジョブ定義の環境変数へ入る
- ジョブ定義の環境変数は平文でジョブ定義に残るため、ジョブ定義を読める人は OpenAI の API キーも読める

## Batch の失敗の通知

ジョブが `FAILED` になったとき、EventBridge のルールが Admin のアラームのトピックへ転送する。

| 項目 | 値 |
|---|---|
| ルール | `nagiyu-quick-clip-batch-job-failed-{env}` |
| イベントのパターン | source が `aws.batch`、detail-type が `Batch Job State Change`、detail の `status` が `FAILED`、`jobQueue` が上のジョブキューの ARN |
| ターゲット | Admin のアラームのトピック ([アラームのトピック](../../../admin/specs/resource/alarm-topic.md)。名前から組み立てた ARN で参照する) |

- 転送先の alarm-ingest が、汎用の変換でエラー履歴の項目にして書く。Quick Clip 固有の変換は持たない。そこから通知が出るまでの流れは[エラー通知の経路](../../../admin/specs/flow/error-notification.md)にある
- EventBridge からトピックへの `sns:Publish` の許可は、Admin のスタックがトピックのリソースポリシーで持つ。このスタックでは付けない (インポートしたトピックには CDK からポリシーを付けられない)
- ジョブキューの ARN は、命名規則から組み立てて渡す ([デプロイ先](../deploy.md)の「理由」)

## 理由

- 失敗の通知を EventBridge のルールで行うのは、アプリの報告だけではタイムアウトの失敗を拾えないため。アプリは例外を受けて Admin へ報告するが、Batch のタイムアウトは SIGKILL (exit 137) で、プロセスがその場で終わり、報告が走らない。プロセスが生きているかに依存しない経路で、Batch の状態の変化を見る
- ジョブの vCPU は FFmpeg の並列数に合わせる。解析は、動きの検出 (4 並列)、一様な区間の検出 (2)、音量の検出 (4 並列) で、最大 10 の FFmpeg のプロセスが同時に動く。`large` と `xlarge` を 8 vCPU にするのはこのため。`small` も、1 vCPU では長尺の動画が時間内に終わらなかった実測があり、4 vCPU にしている ([ジョブ定義のサイズ](../term/job-definition-size.md))
- メモリは Fargate の組み合わせの制約で決まる。4 vCPU は 8 GiB 以上、8 vCPU は 16 GiB 以上が要る
- 計算環境の最大 32 vCPU は、8 vCPU のジョブを同時に 4 つ、4 vCPU のジョブを同時に 8 つ動かせる大きさ
- 共有 VPC は NAT を持たず、パブリックサブネットだけなので、タスクにパブリック IP を付けて外へ通信する
