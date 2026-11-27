---
sources:
  - infra/quick-clip/lib/batch-stack.ts
  - infra/quick-clip/lib/monitoring-stack.ts
  - infra/quick-clip/bin/quick-clip.ts
  - services/quick-clip/batch/Dockerfile
  - services/quick-clip/web/src/lib/server/submit-extract-job.ts
  - services/quick-clip/core/src/libs/quick-clip-batch-runner.ts
  - services/quick-clip/core/src/libs/motion-highlight.service.ts
  - services/quick-clip/core/src/libs/volume-highlight.service.ts
  - services/quick-clip/core/src/libs/ffmpeg-video-analyzer.ts
  - services/quick-clip/core/src/libs/transcription.service.ts
sources_hash: f3e1c82e5f5c79647beb7a037a2ff07b7977576ab9784bd0e83e393c79ae58b7
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

- 計算環境の最大 32 vCPU は、8 vCPU のジョブを同時に 4 つ、4 vCPU のジョブを同時に 8 つ動かせる大きさ

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
- ジョブの vCPU は、解析で同時に動く FFmpeg の本数に合わせて選ぶ
    - AI 解析なしでは、最大 10 本が並ぶ。映像のチャンクが 4、暗転・白転の検出が 2、音量のチャンクが 4
    - AI 解析ありでは、これに文字起こしの FFmpeg が並走する。文字起こしの FFmpeg は、音声の抽出、無音の検出、発話の区間の切り出しの順に動き、区間の切り出しは最大 5 並列。合わせて最大 15 本ほどになる
    - `large` と `xlarge` の 8 vCPU は、AI 解析なしの 10 本を基準に選んだ値
- 今の vCPU とタイムアウトは、dev の実測 (1 vCPU や 2 vCPU では時間内に終わらなかった) を踏まえて選んでいる ([ジョブ定義のサイズ](../term/job-definition-size.md)の「理由」)
- メモリは Fargate の vCPU とメモリの組み合わせの制約で決まる。4 vCPU は 8 GiB 以上、8 vCPU は 16 GiB 以上が要る
- 共有 VPC は NAT を持たず、パブリックサブネットだけなので、タスクにパブリック IP を付けて外へ通信する
