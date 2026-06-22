---
title: 'AWS Batchで重い処理をサーバーレス化する構成解説'
description: '動画変換・画像処理などの重いバッチ処理をAWS Batchでサーバーレス化する構成を解説。ジョブ定義・ジョブキュー・コンピューティング環境・S3トリガー・コスト最適化まで詳しく説明します。'
slug: 'aws-batch-architecture'
publishedAt: '2026-04-10'
updatedAt: '2026-06-05'
author: 'なぎゆー'
tags: ['AWS', 'AWS Batch', 'サーバーレス']
categories: ['aws']
---

## はじめに

Web アプリケーションを開発していると、動画変換・画像処理・大量データの集計など、処理時間が長くサーバーリソースを大量に消費するタスクに直面することがあります。これらの処理を Web サーバーで同期的に実行すると、タイムアウトやリソース不足が発生しやすく、スケーラビリティにも課題が出てきます。

本記事では、AWS Batch を使ってこのような「重い処理」をサーバーレスアーキテクチャで実装する方法を解説します。

## AWS Batch の基本概念

AWS Batch は、AWS 上でバッチコンピューティングワークロードを実行するためのマネージドサービスです。以下の主要コンポーネントで構成されます。

### ジョブ定義（Job Definition）

ジョブの実行内容を定義するテンプレートです。使用する Docker イメージ・CPU・メモリ・環境変数・コマンドなどを指定します。

```json
{
  "jobDefinitionName": "video-conversion-job",
  "type": "container",
  "containerProperties": {
    "image": "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/video-processor:latest",
    "resourceRequirements": [
      { "type": "VCPU", "value": "4" },
      { "type": "MEMORY", "value": "8192" }
    ],
    "command": ["python", "convert.py"],
    "environment": [{ "name": "AWS_REGION", "value": "ap-northeast-1" }],
    "jobRoleArn": "arn:aws:iam::123456789:role/BatchJobRole"
  }
}
```

### ジョブキュー（Job Queue）

ジョブが実行を待機するキューです。優先度を設定でき、複数のコンピューティング環境に紐付けられます。優先度の高いキューのジョブが先に処理されます。

### コンピューティング環境（Compute Environment）

ジョブを実際に実行するインフラを定義します。EC2 インスタンスタイプや Fargate の設定、最小・最大 vCPU 数などを指定します。

```json
{
  "computeEnvironmentName": "video-processing-env",
  "type": "MANAGED",
  "computeResources": {
    "type": "FARGATE",
    "maxvCpus": 64,
    "subnets": ["subnet-xxxxxxxxx"],
    "securityGroupIds": ["sg-xxxxxxxxx"]
  }
}
```

## アーキテクチャ設計

nagiyu の動画処理サービス（Quick Clip・Codec Converter）では、以下のアーキテクチャで AWS Batch を活用しています。

### 全体フロー

1. ユーザーがブラウザから動画ファイルを S3 にアップロード
2. S3 の PUT イベントが Lambda をトリガー
3. Lambda が AWS Batch にジョブをサブミット
4. AWS Batch が ECS Fargate コンテナを起動して処理を実行
5. 処理完了後、結果を S3 に保存してデータベースを更新
6. ユーザーのブラウザに完了通知を送信

### S3 トリガーによる自動起動

S3 にファイルがアップロードされたときに自動的にバッチジョブを起動する Lambda の例です。

```python
import boto3
import json
import os

batch_client = boto3.client('batch')

def lambda_handler(event, context):
    for record in event['Records']:
        bucket = record['s3']['bucket']['name']
        key = record['s3']['object']['key']

        response = batch_client.submit_job(
            jobName=f'video-convert-{key.replace("/", "-")}',
            jobQueue='video-processing-queue',
            jobDefinition='video-conversion-job',
            containerOverrides={
                'environment': [
                    {'name': 'INPUT_BUCKET', 'value': bucket},
                    {'name': 'INPUT_KEY', 'value': key},
                    {'name': 'OUTPUT_BUCKET', 'value': os.environ['OUTPUT_BUCKET']},
                ]
            }
        )

        print(f"Submitted job: {response['jobId']}")
    return {'statusCode': 200}
```

## ECS との連携

AWS Batch は内部的に Amazon ECS を使ってコンテナを実行します。Fargate タイプを選択するとサーバーレスで動作し、EC2 インスタンスの管理が不要になります。

### Dockerfile の例（FFmpeg 処理）

```dockerfile
FROM public.ecr.aws/amazonlinux/amazonlinux:2023

RUN dnf install -y python3 python3-pip
RUN pip3 install boto3 ffmpeg-python

RUN dnf install -y ffmpeg

WORKDIR /app
COPY convert.py .

CMD ["python3", "convert.py"]
```

### 処理スクリプトの例

```python
import boto3
import ffmpeg
import os

def main():
    s3 = boto3.client('s3')
    input_bucket = os.environ['INPUT_BUCKET']
    input_key = os.environ['INPUT_KEY']
    output_bucket = os.environ['OUTPUT_BUCKET']

    # S3からダウンロード
    s3.download_file(input_bucket, input_key, '/tmp/input.mp4')

    # FFmpegで変換
    (
        ffmpeg
        .input('/tmp/input.mp4')
        .output('/tmp/output.mp4', vcodec='libx264', crf=23)
        .run(overwrite_output=True)
    )

    # S3にアップロード
    output_key = input_key.replace('uploads/', 'processed/')
    s3.upload_file('/tmp/output.mp4', output_bucket, output_key)
    print(f"Completed: s3://{output_bucket}/{output_key}")

if __name__ == '__main__':
    main()
```

## Lambda との比較・使い分け

| 項目         | Lambda       | AWS Batch                   |
| ------------ | ------------ | --------------------------- |
| 最大実行時間 | 15 分        | 無制限（実質無制限）        |
| メモリ上限   | 10 GB        | インスタンスタイプに依存    |
| 起動時間     | 数秒         | 1〜2 分（コールドスタート） |
| コスト       | 実行時間課金 | EC2/Fargate 課金            |
| 適した処理   | 軽量・短時間 | 重処理・長時間バッチ        |

動画変換・機械学習の推論・大量データ処理など、15 分を超えるか大量のリソースを必要とする処理には AWS Batch が適しています。

## コスト最適化

### スポットインスタンスの活用

EC2 タイプのコンピューティング環境では、スポットインスタンスを使うことでコストを最大 70〜90% 削減できます。ただし、スポットインスタンスは中断される可能性があるため、ジョブのリトライ設定を適切に行う必要があります。

```json
{
  "computeResources": {
    "type": "SPOT",
    "bidPercentage": 60,
    "instanceTypes": ["m5", "c5", "r5"],
    "minvCpus": 0,
    "maxvCpus": 256
  }
}
```

### 最小 vCPU を 0 に設定する

コンピューティング環境の `minvCpus` を 0 に設定することで、ジョブがない間はインスタンスが起動せず、コストが発生しません。

## 実装ノート

ここまでは一般論として書きましたが、nagiyu-platform では実際に「Lambda で始めて 15 分の壁にぶつかり、Batch/Fargate へ逃がす」という移行を Quick Clip・Codec Converter・niconico-mylist-assistant の 3 サービスで踏んでいます。私が一番割り切れたのは Quick Clip の動画解析で、入力ファイルサイズから `selectJobDefinition` でジョブ定義を出し分ける構成にしました。1 GiB 未満は small（1 vCPU・メモリ 4 GB・タイムアウト 1 時間）、4 GiB 未満は large（8 vCPU・メモリ 16 GB・一時ストレージ 30 GiB・3 時間）、それ以上は xlarge（一時ストレージ 60 GiB・8 時間）と、3 段階で確保するリソースを変えています。FFmpeg の一時ファイルが大きいので `ephemeralStorage` を明示的に積んでいるのが、自分のハマりを反映した設計です。

niconico-mylist-assistant の Batch は Playwright でブラウザを自動操作するワークロードで、こちらも Fargate（1.0 vCPU・メモリ 2 GB）に載せ、タイムアウトは 30 分（1800 秒）に設定しています。ブラウザ操作は待ち時間が読みにくく、Lambda の 15 分では到底収まらないと判断しました。

## ハマったポイント

逆に「Batch に逃がさなかった」判断で苦労したのが Stock Tracker の分次バッチです。これは 1 分間隔・高頻度なので Lambda のまま据え置いたのですが、Lambda タイムアウト 50 秒との戦いになりました。当初はアラートを `for...of` で逐次処理していて、TradingView API の遅延が連鎖すると処理が 50 秒を超え、Lambda がハードキルされてエラー率アラームが鳴る、という事故を起こしました（commit `a8d4505`）。

対策として、私は逐次ループを並列実行ユーティリティに置き換え、`MINUTE_BATCH_CONCURRENCY` で並列度（現在は 3）を、`MINUTE_BATCH_TIME_BUDGET_MS` で時間予算（30 秒）を環境変数として外出しにしました。あわせて `memorySize` を 512 → 1024 MB に増やし、`reservedConcurrentExecutions: 1` で多重起動も止めています。その後 TradingView の単発タイムアウトを 5s → 8s に緩めつつ時間予算を 38s → 30s に締め直し（commit `7a57635`）、ようやく 50 秒以内に安定して収まるようになりました。「重い処理は Batch、高頻度・短時間は Lambda を並列で殴る」という今の住み分けは、この失敗から学んだものです。

## 現在の運用

現在は「処理特性で実行基盤を分ける」方針で落ち着いています。動画変換（Quick Clip）やブラウザ自動操作（niconico-mylist-assistant）のように 15 分を超えうる重処理は AWS Batch on Fargate に、1 分間隔の株価アラート（Stock Tracker）のように短時間・高頻度なものは Lambda の並列実行に寄せています。Batch 側はいずれも `assignPublicIp: ENABLED` の Fargate、ログは awslogs で CloudWatch に集約、リトライは `attempts: 1`（無闇に再実行してコストと副作用を膨らませない）という共通設定にしてあります。スポットインスタンスは使わず、ジョブ単発の確実性を優先しているのが、今の自分の選択です。

## まとめ

AWS Batch は重い処理をサーバーレスで実行するための強力なサービスです。S3 トリガーと組み合わせることで、ファイルアップロードに連動した自動処理パイプラインを構築できます。Lambda との使い分けを理解して、処理の特性に合ったアーキテクチャを選択しましょう。nagiyu の動画処理サービスでも、この構成によって大容量ファイルの処理を効率的に実現しています。
