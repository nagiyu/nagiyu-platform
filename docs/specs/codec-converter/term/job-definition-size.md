---
id: codec-converter/term/job-definition-size
title: ジョブ定義のサイズ
kind: term
service: codec-converter
sources:
  - services/codec-converter/core/src/resource-selector.ts
  - infra/codec-converter/lib/codec-converter-stack.ts
sources_hash: b417c90dcf48a7f4deb0ba7f5eac14b5dc810e3bc70f116ce51ee53da4693c56
related_cards: [codec-converter/api/jobs, codec-converter/batch/convert, codec-converter/flow/conversion, codec-converter/term/output-codec]
related_adr:
  - services/codec-converter/architecture.md#動的リソース配分
---

# ジョブ定義のサイズ

変換バッチに割り当てる CPU とメモリの大きさ。AWS Batch のジョブ定義を 4 つ (`small`、`medium`、`large`、`xlarge`) 用意し、ジョブの大きさに合わせて 1 つ選ぶ。

## 説明

ジョブ定義は `{BATCH_JOB_DEFINITION_PREFIX}-{サイズ}` の名前で、インフラが作る (プレフィックスは `nagiyu-codec-converter-{env}`)。

| サイズ | vCPU | メモリ (MB) |
|---|---|---|
| `small` | 1 | 2048 |
| `medium` | 2 | 4096 |
| `large` | 4 | 8192 |
| `xlarge` | 4 | 16384 |

選び方は、ファイルサイズと[出力コーデック](./output-codec.md)で決まる。

| ファイルサイズ | `h264` | `vp9` | `av1` |
|---|---|---|---|
| 100MB 未満 | `small` | `small` | `medium` |
| 100MB 以上 300MB 未満 | `medium` | `large` | `large` |
| 300MB 以上 | `medium` | `large` | `xlarge` |

- 100MB、300MB は 1024 * 1024 バイトの倍数で数える
- ファイルサイズが負、またはコーデックが許可外のときは選べず、呼び出し側は `medium` で続ける ([ジョブ API](../api/jobs.md))
- 選んだ定義で投入に失敗したときも `medium` で再投入する
- 全サイズのジョブ定義は、同じイメージ、タイムアウト (7,200 秒)、リトライ (2 回まで試行) を持つ

## 関連するカード

- [ジョブ API](../api/jobs.md)・[変換バッチ](../batch/convert.md)・[変換の経路](../flow/conversion.md)
