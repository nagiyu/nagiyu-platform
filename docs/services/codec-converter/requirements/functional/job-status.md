---
sources: []
---

# ジョブの状態

利用者が、依頼したジョブの状態を確かめられるようにする。ユースケースは[変換の結果を受け取る](../use-cases/receive-result.md)。

## 要件

- ジョブは、推測しにくい ID (UUID v4) で識別する
- ジョブは、`PENDING`、`PROCESSING`、`COMPLETED`、`FAILED` の 4 つの状態を持つ。意味と変える主体は[ジョブ](../../specs/term/job.md)にある
- ジョブは、作成から 24 時間で消える ([データの保持](../non-functional/data-retention.md))
- 利用者が、自分の操作でジョブの状態を確かめられる。画面は自動では更新しない
- 失敗したときは、失敗したことと理由を示す。理由の文言は[変換](conversion.md)に従う

画面は[ジョブ詳細画面](../../specs/screen/job-detail.md)、API は[ジョブ API](../../specs/api/jobs.md)にある。

## やらないこと

- **進捗 (%) の表示**: FFmpeg から進捗を取り出す処理が複雑なため
