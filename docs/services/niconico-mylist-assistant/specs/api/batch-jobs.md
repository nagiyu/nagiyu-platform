---
sources:
  - services/niconico-mylist-assistant/web/src/app/api/batch/status/[jobId]/route.ts
  - services/niconico-mylist-assistant/core/src/db/batch-jobs.ts
  - services/niconico-mylist-assistant/core/src/mappers/batch-job.mapper.ts
sources_hash: 8a314f5743928099366136cd15e3cb307b7bfbdb0bf2b84e846628c7de245e2f
---

# ジョブ API

マイリスト登録の[ジョブ](../term/batch-job.md)の状態を読む API。

## エンドポイント

| メソッド | パス | 権限 |
|---|---|---|
| GET | `/api/batch/status/{jobId}` | ログイン |

## 入力と出力

状態の取得 (`GET /api/batch/status/{jobId}`) は、自分が作ったジョブだけを返す。

- 応答は `{ jobId, status, createdAt, updatedAt, result?, completedAt? }`。日時は ISO 8601 の文字列。`result` と `completedAt` は、あるときだけ付く
- ジョブの記録は作成の 7 日後以降に消えるので、消えたあとは 404 になる

## エラー

未ログインと想定外の失敗は形 C、ジョブがないときは形 A ([API のエラー応答](../term/api-error.md))。

| 条件 | 状態 | 応答 |
|---|---|---|
| 未ログイン | 401 | `withAuth` の未認証の応答 ([認証付きルートハンドラ](../../../../platform/specs/lib/nextjs/with-auth.md)) |
| ジョブがない (ほかの利用者のジョブを含む) | 404 | `code` が `NOT_FOUND`、`message` が「バッチジョブが見つかりません」 |
| 想定外の失敗 | 500 | `handleApiError` の 500 の応答 ([エラーレスポンス](../../../../platform/specs/lib/nextjs/error-response.md)) |

## つながり

```mermaid
flowchart TD
    S[ジョブの状態画面] -->|5 秒ごと| A1[ジョブ API<br/>status]
    A1 --> J[(ジョブの記録)]
    B[マイリスト登録バッチ] -->|更新| J
```
