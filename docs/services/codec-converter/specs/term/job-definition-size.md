---
sources:
  - services/codec-converter/core/src/resource-selector.ts
  - infra/codec-converter/lib/codec-converter-stack.ts
sources_hash: b83d258626af8ae7fe86af6c4a202bd43a1ddcf7f2f1aa34b09baa1798e70224
---

# ジョブ定義のサイズ

変換バッチに割り当てる CPU とメモリの大きさ。AWS Batch のジョブ定義を 4 つ (`small`、`medium`、`large`、`xlarge`) 用意し、ジョブの大きさに合わせて 1 つ選ぶ。

## 説明

ジョブ定義は `{BATCH_JOB_DEFINITION_PREFIX}-{サイズ}` の名前で、インフラが作る (プレフィックスは `nagiyu-codec-converter-{env}`。[Batch の実行環境](../resource/batch-runtime.md))。

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

## 理由

- ファイルサイズとコーデックでサイズを使い分ける。軽い処理に大きな資源を割り当てるとコストが無駄になり、重い処理に小さな資源を割り当てると処理時間が延びるため
- 選べないとき、または選んだ定義での投入に失敗したときは、既定の `medium` で続ける。既存のジョブを失敗させないため
- vCPU とメモリの値は、AWS Fargate の組み合わせの制約 (1 vCPU は 2,048〜8,192 MB、2 vCPU は 4,096〜16,384 MB、4 vCPU は 8,192〜30,720 MB) に収める。参考: https://docs.aws.amazon.com/batch/latest/userguide/fargate.html
- 並行して動かせる量は、コンピュート環境の最大 vCPU で決まる ([Batch の実行環境](../resource/batch-runtime.md))
