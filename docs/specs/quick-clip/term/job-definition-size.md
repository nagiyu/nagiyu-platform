---
id: quick-clip/term/job-definition-size
title: Batch ジョブ定義のサイズ
kind: term
service: quick-clip
sources:
  - services/quick-clip/core/src/libs/job-definition-selector.ts
  - services/quick-clip/web/src/lib/server/submit-extract-job.ts
  - infra/quick-clip/lib/batch-stack.ts
sources_hash: 39f82efd24248d6fa91b2ac8b03de407d8e5fd70c019beca4a2193d1046bd62c
related_cards: [quick-clip/api/jobs, quick-clip/batch/extract, quick-clip/flow/extraction]
related_adr:
  - services/quick-clip/architecture.md#ADR-009
  - services/quick-clip/architecture.md#ADR-016
---

# Batch ジョブ定義のサイズ

[抽出バッチ](../batch/extract.md)を動かすときの、Batch のリソースの大きさ。`small`、`large`、`xlarge` の 3 つがあり、ファイルサイズと動画の長さから選ぶ。

## 説明

選び方。ファイルサイズと動画の長さのそれぞれでサイズを決め、重いほうを採る。

| 軸 | `small` | `large` | `xlarge` |
|---|---|---|---|
| ファイルサイズ | 1 GiB 未満 | 1 GiB 以上 4 GiB 未満 | 4 GiB 以上 |
| 動画の長さ | 90 分未満 | 90 分以上 180 分未満 | 180 分以上 |

- 動画の長さを申告していないジョブは、長さの軸を `small` として扱い、ファイルサイズだけで決まる
- 投入するジョブ定義の名前は `{BATCH_JOB_DEFINITION_PREFIX}-{サイズ}`。インフラのプレフィックスは `nagiyu-quick-clip-{env}`

ジョブ定義の中身。イメージ、ログ出力先 (`/aws/batch/nagiyu-quick-clip-{env}`、保持 1 週間)、環境変数は 3 つで共通。

| サイズ | vCPU | メモリ | 一時ストレージ | タイムアウト | 試行 |
|---|---|---|---|---|---|
| `small` | 4 | 8,192 MiB | 指定なし (Fargate の既定) | 2 時間 | 1 回 |
| `large` | 8 | 16,384 MiB | 30 GiB | 3 時間 | 1 回 |
| `xlarge` | 8 | 16,384 MiB | 60 GiB | 8 時間 | 1 回 |

- 共通の環境変数は `DYNAMODB_TABLE_NAME`、`S3_BUCKET`、`AWS_REGION`、`OPENAI_API_KEY`、`ERROR_EVENTS_TABLE_NAME`。起動ごとの値は、投入のときに別に渡す ([抽出バッチ](../batch/extract.md))
- 実行基盤は Fargate。同時に動かせる大きさは、コンピュート環境の最大 32 vCPU で決まる

## 関連するカード

- [ジョブ API](../api/jobs.md): 投入のときにサイズを選ぶ
- [抽出バッチ](../batch/extract.md)・[見どころを受け取るまでの経路](../flow/extraction.md)
