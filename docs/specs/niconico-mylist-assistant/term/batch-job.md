---
id: niconico-mylist-assistant/term/batch-job
title: マイリスト登録ジョブ
kind: term
service: niconico-mylist-assistant
sources:
  - services/niconico-mylist-assistant/core/src/types/index.ts
  - services/niconico-mylist-assistant/core/src/entities/batch-job.entity.ts
  - services/niconico-mylist-assistant/core/src/mappers/batch-job.mapper.ts
  - services/niconico-mylist-assistant/batch/src/lib/job-status.ts
sources_hash: 8f2fcd465ade781220d4982d7397945f3c71d7c120ee1e85abdcb93364190ca6
related_cards: [niconico-mylist-assistant/api/batch-jobs, niconico-mylist-assistant/api/mylist-register, niconico-mylist-assistant/screen/job-status, niconico-mylist-assistant/batch/mylist-register, niconico-mylist-assistant/flow/mylist-registration]
---

# マイリスト登録ジョブ

マイリストの登録を 1 回依頼したときに作る、進み具合と結果の記録。AWS Batch のジョブ 1 件に対応し、画面はこの記録を読んで状態を見せる。

## 説明

| 項目 | 内容 |
|---|---|
| `jobId` | AWS Batch のジョブ ID |
| `userId` | 依頼した利用者。記録は利用者ごとに分かれ、自分の分だけ読める |
| `status` | 下の表 |
| `result` | 結果。`registeredCount` (成功)、`failedCount` (失敗)、`totalCount`、`errorMessage` (あれば) |
| `createdAt` / `updatedAt` / `completedAt` | 作成・更新・完了の日時 |
| `pushSubscription` | 完了を知らせる Web Push の宛先。依頼のときに添えられたときだけある |
| `twoFactorAuthCode` | 二段階認証のコード。今のバッチは読まない |

| `status` | 意味 |
|---|---|
| `SUBMITTED` | 依頼を受けて Batch に投入した。画面での表示は「投入済み」 |
| `RUNNING` | バッチが動いている。「実行中」 |
| `WAITING_FOR_2FA` | 二段階認証のコード待ち。「二段階認証待ち」。今のバッチはこの状態にしない |
| `SUCCEEDED` | 完了。「完了」 |
| `FAILED` | 失敗。「失敗」 |

- 完了の判定は、バッチが決める。全件の登録に失敗した (成功が 0 件で失敗が 1 件以上) ときだけ `FAILED`、それ以外 (全件成功、一部失敗) は `SUCCEEDED`。一部失敗かどうかは `result.failedCount` で見分ける
- 記録は、作成の 7 日後以降に自動で消える (DynamoDB の TTL。消えるまでに遅れることがある)

## 関連するカード

- [ジョブ API](../api/batch-jobs.md): 記録の読み取り
- [マイリスト登録バッチ](../batch/mylist-register.md): 記録を更新する
