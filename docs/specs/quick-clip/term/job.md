---
id: quick-clip/term/job
title: ジョブとステータス
kind: term
service: quick-clip
sources:
  - services/quick-clip/core/src/types.ts
  - services/quick-clip/core/src/mappers/job.mapper.ts
  - services/quick-clip/core/src/libs/job.service.ts
  - services/quick-clip/web/src/app/api/jobs/[jobId]/route.ts
sources_hash: ceb0118caf842099567c9b8a5d64dcf5cbfbfeeedc459a1c15dc8cbe577e020e
terms: [quick-clip/term/ai-analysis]
related_cards: [quick-clip/api/jobs, quick-clip/batch/extract, quick-clip/flow/extraction, quick-clip/screen/upload, quick-clip/screen/job-status, quick-clip/screen/highlights, quick-clip/term/highlight]
related_adr:
  - services/quick-clip/architecture.md#ADR-011
  - services/quick-clip/architecture.md#ADR-013
---

# ジョブとステータス

1 本の動画のアップロードと見どころ抽出を表す記録。DynamoDB に 1 件で持つ。ステータスは保存せず、AWS Batch の状態から求める。

## 説明

| 項目 | 内容 |
|---|---|
| `jobId` | UUID v4。キーは `PK` と `SK` がどちらも `JOB#{jobId}` |
| `originalFileName`、`fileSize` | 元のファイル名 (前後の空白を除く) と、申告されたバイト数 |
| `durationSec` | ブラウザが申告した動画の長さ (秒)。読めなかったときはない |
| `createdAt`、`expiresAt` | epoch ミリ秒。`expiresAt` は作成の 24 時間後。保存するときは TTL 属性 (`TTL`、epoch 秒) に書く |
| `batchJobId` | 投入した Batch ジョブの ID。投入するまではない |
| `batchStage` | Batch が今いる段階。`downloading`、`analyzing`、`clipping`、`aggregating` |
| `analysisProgress` | 解析の内訳。`motion`、`volume`、`transcription`、`emotionScoring` それぞれが `in_progress`、`done`、`failed` と、チャンクの `completed`、`total` を持つ。文字起こしと感情分析は [AI 解析](./ai-analysis.md)をしたときだけある |
| `errorMessage` | 失敗の内容 |
| `aiAnalysis`、`maxDurationSec` | 作成のときに決めた、AI 解析をするかと、許される動画の長さの上限 (秒)。ないジョブは、AI 解析をするもの、長さを照合しないものとして扱う |
| `usage`、`usageReleased`、`usageSwitched` | 数えた利用回数の記録と、戻し済み、付け替え済みの印 ([利用回数の流れ](../flow/usage-metering.md)) |

- 見どころは同じ `PK` の `HIGHLIGHT#{highlightId}` として、同じテーブルに入る ([見どころ](./highlight.md))
- 旧形式の小文字始まりの属性名も読む。必須項目が欠けたり、`batchStage` が許可外の値だったりすると、読む側が例外にする
- `analysisProgress` と `batchStage` は Batch が書く。`errorMessage` は Batch の失敗か、動画の長さの超過で書く

## ステータスの求め方

`status` は API が、Batch の状態とジョブの記録から返す ([ジョブ API](../api/jobs.md))。

| 条件 | ステータス |
|---|---|
| `batchJobId` がない | `PENDING` |
| Batch が `SUBMITTED`、`PENDING`、`RUNNABLE`、`STARTING` | `PENDING` |
| Batch が `RUNNING` | `PROCESSING` |
| Batch が `SUCCEEDED` で、`errorMessage` がない | `COMPLETED` |
| Batch が `SUCCEEDED` だが、`errorMessage` がある | `FAILED` |
| Batch が `FAILED`、ほかの状態、ジョブを返さない | `FAILED` |

- `batchStage` は `PROCESSING` のときだけ返す。`analysisProgress` は、さらに `batchStage` が `analyzing` のときだけ返す。`errorMessage` は `FAILED` のときだけ返す
- Batch が成功で終えても失敗に見せるのは、動画の長さが上限を超えたジョブのように、障害ではなく利用者側の理由で止めたものがあるため

## 関連するカード

- [ジョブ API](../api/jobs.md)・[抽出バッチ](../batch/extract.md)・[見どころを受け取るまでの経路](../flow/extraction.md)
- [アップロード画面](../screen/upload.md)・[処理状況画面](../screen/job-status.md)・[見どころ確認画面](../screen/highlights.md)
