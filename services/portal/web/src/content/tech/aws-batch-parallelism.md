---
title: 'AWS Batch ジョブの並列度を制御する：array job と vCPU クォータ'
description: 'AWS Batch でバッチ処理を並列実行する際の並列度制御方法を解説。array job の使い方・compute environment の vCPU 上限・ジョブキューの優先度・依存関係の表現まで実運用ベースで整理します。'
slug: 'aws-batch-parallelism'
publishedAt: '2026-03-22'
updatedAt: '2026-05-01'
author: 'なぎゆー'
tags: ['AWS', 'AWS Batch', '並列処理']
relatedServices: ['quick-clip', 'codec-converter']
---

## はじめに

AWS Batch で大量ジョブを動かすとき、「どれくらい並列に走らせるか」「同時実行数の上限はどう決まるか」が運用上の課題になります。本記事では nagiyu-platform で動画変換・解析バッチを動かしている経験から、並列度の制御方法を整理します。

## 並列度を決める 3 つの値

AWS Batch の並列度は次の 3 つで決まります。

1. **Array job の `arraySize`**: 1 ジョブから子ジョブをいくつ生成するか（最大 10,000）
2. **Compute environment の `maxvCpus`**: その環境全体で同時に使える vCPU 上限
3. **Service Quota の vCPU 上限**: アカウント全体の Fargate / EC2 vCPU 上限（デフォルト 1,000）

たとえば「`arraySize=100`、`maxvCpus=20`、各タスク 2 vCPU」だと、同時実行数は `20 / 2 = 10` 件で頭打ちになります。残り 90 件はキューで順次実行されます。

## array job の基本

同じジョブ定義を一気に大量起動するには `arraySize` を指定します。

```json
{
  "jobName": "video-thumbnail-batch",
  "jobQueue": "nagiyu-batch-queue",
  "jobDefinition": "video-thumbnail:3",
  "arrayProperties": { "size": 100 },
  "containerOverrides": {
    "environment": [
      { "name": "INPUT_BUCKET", "value": "nagiyu-uploads" },
      { "name": "OUTPUT_BUCKET", "value": "nagiyu-thumbs" }
    ]
  }
}
```

各子ジョブには `AWS_BATCH_JOB_ARRAY_INDEX` 環境変数（0〜99）が設定されるので、コンテナ内で対象データを分割します。

```bash
# 例: S3 のファイル一覧を 100 等分して、自分の担当だけ処理
aws s3 ls s3://nagiyu-uploads/ | awk -v idx=$AWS_BATCH_JOB_ARRAY_INDEX 'NR % 100 == idx' | while read line; do
  process_video "$line"
done
```

## compute environment の vCPU 上限

EC2 / Fargate のコストを抑えつつ並列度を確保するには、`maxvCpus` を適切に設定します。

```hcl
resource "aws_batch_compute_environment" "main" {
  compute_environment_name = "nagiyu-fargate-spot"
  type                     = "MANAGED"

  compute_resources {
    type              = "FARGATE_SPOT"
    max_vcpus         = 64    # 全体で 32 タスク分（2 vCPU/タスク）
    subnets           = var.subnet_ids
    security_group_ids = [var.sg_id]
  }
}
```

`FARGATE_SPOT` を使うと最大 70% のコスト削減。ただし途中でタスクが中断される可能性があるので、**冪等性のあるジョブだけ**に使います（再実行しても結果が同じ処理）。

## ジョブキューの優先度

複数ワークロードが共存するときは、優先度の異なるジョブキューを複数持ちます。

```hcl
resource "aws_batch_job_queue" "high" {
  name      = "nagiyu-high-priority"
  state     = "ENABLED"
  priority  = 100
  compute_environments = [aws_batch_compute_environment.main.arn]
}

resource "aws_batch_job_queue" "low" {
  name      = "nagiyu-low-priority"
  state     = "ENABLED"
  priority  = 10
  compute_environments = [aws_batch_compute_environment.main.arn]
}
```

ユーザー操作起因のジョブは high、夜間バッチは low、と分けると、夜間ジョブが詰まっていても緊急ジョブは即時実行されます。

## ジョブ依存関係

「変換 → サムネイル生成 → アップロード」のように複数ジョブを連結する場合、`dependsOn` で順序を表現できます。

```typescript
import { BatchClient, SubmitJobCommand } from '@aws-sdk/client-batch';

const client = new BatchClient({ region: 'ap-northeast-1' });

const convert = await client.send(
  new SubmitJobCommand({
    jobName: 'convert-001',
    jobQueue: 'nagiyu-batch-queue',
    jobDefinition: 'video-convert:5',
  })
);

const thumb = await client.send(
  new SubmitJobCommand({
    jobName: 'thumb-001',
    jobQueue: 'nagiyu-batch-queue',
    jobDefinition: 'video-thumbnail:3',
    dependsOn: [{ jobId: convert.jobId!, type: 'SEQUENTIAL' }],
  })
);
```

`SEQUENTIAL` は単一ジョブ依存、`N_TO_N` は array job 同士のインデックス連動依存。後者は「変換 array job の index=5 が終わったらサムネ array job の index=5 が動く」という対応を組めます。

## リトライとタイムアウト

```json
{
  "retryStrategy": { "attempts": 3 },
  "timeout": { "attemptDurationSeconds": 1800 }
}
```

- **`retryStrategy.attempts`**: 失敗時のリトライ回数。Spot 中断対策で 2〜3 が定番
- **`timeout.attemptDurationSeconds`**: ジョブ単体の最大実行時間。長すぎると Spot 中断に弱くなり、短すぎると正常完了する前に kill される

ジョブの実測時間を CloudWatch で確認し、その 1.5〜2 倍を timeout に設定するのが安全です。

## CloudWatch でのモニタリング

メトリクス `JobsInState` でステータス別の件数が見えます。CloudWatch Alarm を仕込んでおくと、ジョブ詰まりに気づきやすくなります。

```
- RUNNABLE > 50 が 10 分続いたら通知
- FAILED の合計が 1 時間で 10 件超えたら通知
```

通知先は SNS → Slack Webhook が簡単。ジョブログは CloudWatch Logs に流れるので、特定ジョブの失敗原因も追跡可能です。

## ハマりどころ

- **Service Quota の vCPU 上限**: アカウント全体で 1,000 vCPU が初期値。大規模並列実行を想定するなら事前に引き上げ申請。
- **VPC のサブネット容量**: Fargate タスクが ENI を消費する。/24 サブネットだと 250 タスクで枯渇。/22 や /20 を切る。
- **NAT Gateway 経由の通信コスト**: 大量データを S3 に書き込む場合、NAT 経由だとデータ転送料が嵩む。VPC Endpoint で S3 / DynamoDB にショートカット。
- **コンテナイメージの pull**: ECR から毎回 pull するので、イメージサイズが大きいとジョブ起動が遅い。multi-stage build でスリム化。
- **タイムゾーン**: コンテナはデフォルト UTC。ログのタイムスタンプ統一のために `TZ` を明示する。

## まとめ

AWS Batch の並列度は array job + compute environment の vCPU 上限 + ジョブキュー優先度 で柔軟に制御できます。Spot を活用したコスト最適化、依存関係による多段ワークフロー、CloudWatch によるモニタリングを組み合わせれば、大量データ処理を効率的かつ低コストに回せます。
