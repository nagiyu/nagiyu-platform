---
title: 'EventBridge Scheduler で定期バッチを置き換える'
description: 'AWS EventBridge Scheduler を使って cron / 定期バッチを移行する方法を解説。Schedule Expression・Target・Dead Letter Queue・既存 EventBridge Rules との違いまで実例で示します。'
slug: 'eventbridge-scheduler'
publishedAt: '2026-04-29'
updatedAt: '2026-05-01'
author: 'なぎゆー'
tags: ['AWS', 'EventBridge', 'スケジューラ']
---

## はじめに

「毎晩 3 時にバッチを動かしたい」「5 分ごとに API を叩きたい」といった定期実行は、サーバーレス時代でも日常的に発生します。AWS には EventBridge Rules（旧 CloudWatch Events）と EventBridge Scheduler の 2 つが存在しますが、新規実装は **Scheduler の方が強力**です。本記事では使い分けと実装を整理します。

## EventBridge Rules vs Scheduler

| 項目                      | EventBridge Rules              | EventBridge Scheduler                         |
| ------------------------- | ------------------------------ | --------------------------------------------- |
| スケジュール数            | 1 アカウント 300 件まで        | 1 アカウント数百万件まで                      |
| One-time（特定時刻 1 回） | 不可（cron でも繰り返し前提）  | 可能（`at(2026-12-31T15:00:00)`）             |
| タイムゾーン              | UTC のみ                       | 任意（`Asia/Tokyo` など）                     |
| Flexible time window      | 不可                           | 可能（負荷分散用）                            |
| DLQ サポート              | EventBridge イベント送信時のみ | スケジュール毎に DLQ 設定可能                 |
| ターゲット数              | 5 まで                         | 1 つ（だが汎用 API 経由で 270+ サービス対応） |

スケジュール本数が多い、タイムゾーン指定したい、特定時刻 1 回だけ実行したい、というニーズは Scheduler が断然優れます。**新規は Scheduler 一択**と考えて良いです。

## Schedule Expression の書き方

### 1) cron 式

```
cron(0 3 * * ? *)        // 毎日 3:00（UTC）
cron(0 18 ? * MON-FRI *) // 平日 18:00（UTC）= 日本 朝 3:00
cron(*/5 * * * ? *)      // 5 分ごと
```

タイムゾーンを指定すれば日本時間で書けます:

```hcl
schedule_expression          = "cron(0 3 * * ? *)"
schedule_expression_timezone = "Asia/Tokyo"
```

### 2) rate 式

```
rate(5 minutes)
rate(1 hour)
rate(7 days)
```

「定期間隔で実行」という意味で書きやすい。最小単位は 1 分。

### 3) at 式（One-time）

```
at(2026-12-31T15:00:00)
```

特定時刻に **1 回だけ**実行。「明日午前 9 時にメール送信」のような使い方ができます。

## ターゲットの種類

### 1) Lambda 関数

```hcl
resource "aws_scheduler_schedule" "nightly_batch" {
  name       = "nightly-stock-snapshot"
  group_name = "default"

  flexible_time_window { mode = "OFF" }

  schedule_expression          = "cron(0 3 * * ? *)"
  schedule_expression_timezone = "Asia/Tokyo"

  target {
    arn      = aws_lambda_function.batch.arn
    role_arn = aws_iam_role.scheduler.arn

    input = jsonencode({ jobType = "snapshot" })
  }
}
```

`input` がそのまま Lambda の event として渡されます。

### 2) Step Functions

複数ステップのワークフローを起動する場合:

```hcl
target {
  arn      = aws_sfn_state_machine.daily_aggregation.arn
  role_arn = aws_iam_role.scheduler.arn
}
```

`StartExecution` API が呼ばれます。長時間処理は Step Functions に任せて、Scheduler は起点だけ担当する形が綺麗です。

### 3) ECS Run Task

定期 Fargate ジョブとして任意のコンテナを動かせます:

```hcl
target {
  arn      = aws_ecs_cluster.main.arn
  role_arn = aws_iam_role.scheduler.arn

  ecs_parameters {
    task_definition_arn = aws_ecs_task_definition.batch.arn
    launch_type         = "FARGATE"
    network_configuration {
      subnets         = var.subnets
      security_groups = [var.sg]
    }
  }
}
```

「重いバッチを 1 日 1 回」のような用途で、Lambda の 15 分制限を超える処理に向きます。

### 4) Universal Targets（任意の AWS API）

ほぼあらゆる AWS API を呼べます:

```hcl
target {
  arn      = "arn:aws:scheduler:::aws-sdk:s3:putObject"
  role_arn = aws_iam_role.scheduler.arn

  input = jsonencode({
    Bucket = "nagiyu-archive"
    Key    = "daily-marker.txt"
    Body   = "marker"
  })
}
```

「DynamoDB にレコード書く」「SNS で通知出す」などを Lambda 経由せず直接できます。

## flexible_time_window で負荷分散

「3:00 ジャストでなくても、3:00 ± 15 分の間ならいつでもいい」という設定が可能:

```hcl
flexible_time_window {
  mode                      = "FLEXIBLE"
  maximum_window_in_minutes = 15
}
```

大量のスケジュールが同時刻に集中するとダウンストリーム（Lambda の同時実行数など）が逼迫しますが、これを使うと **AWS 側がランダムに散らして実行**してくれます。

## DLQ で失敗時のリトライ

ターゲット起動に失敗したときの再実行・退避先を指定:

```hcl
target {
  # ...
  dead_letter_config {
    arn = aws_sqs_queue.scheduler_dlq.arn
  }
  retry_policy {
    maximum_event_age_in_seconds = 86400
    maximum_retry_attempts       = 5
  }
}
```

5 回リトライしても失敗したら DLQ に送られ、別 Lambda で復旧処理（Slack 通知 / 手動再実行）を組めます。

## Schedule Group で整理

スケジュールが多くなったらグループで分類:

```hcl
resource "aws_scheduler_schedule_group" "batch" {
  name = "nightly-batch"
}

resource "aws_scheduler_schedule" "snapshot" {
  group_name = aws_scheduler_schedule_group.batch.name
  # ...
}
```

タグや IAM 権限をグループ単位で管理できるので、サービス別 / 環境別に分けるのが運用しやすいパターンです。

## ハマりどころ

- **タイムゾーンを書き忘れる**: 既定 UTC なので「3:00 と書いたつもりが日本時間 12:00」事故が起きる。常に明示する。
- **IAM ロールの信頼関係**: Scheduler の信頼ポリシーは `scheduler.amazonaws.com` を Principal に持たせる必要がある。
- **同時実行に注意**: 5 分ごとのジョブが前回完了前に発火すると重複実行になる。Lambda 側で重複検知（DynamoDB の Conditional Put 等）。
- **At 式の過去指定**: 過去日時を指定するとスケジュールがすぐ削除される（実行されない）。
- **既存 EventBridge Rules との混在**: 1 サービスで両方使うと運用が混乱する。新規は Scheduler に寄せる。

## まとめ

EventBridge Scheduler は、cron 系ニーズに対して旧 EventBridge Rules よりほぼ全面的に優れた選択肢です。タイムゾーン対応・大量スケジュール・One-time 実行・DLQ などの実運用ニーズが揃っていて、CDK / Terraform でも素直に書けます。新規プロジェクトは最初からこちらを採用するのが得策です。
