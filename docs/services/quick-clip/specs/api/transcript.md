---
sources:
  - services/quick-clip/web/src/app/api/jobs/[jobId]/transcript/route.ts
  - services/quick-clip/web/src/lib/api-error-reporting.ts
sources_hash: 1274e7c62a90f0bf51c13c11b4fab824d6e6be4a87da4f5423e86acfb84b7492
---

# 文字起こし API

ジョブの[文字起こし](../term/transcript.md)の行を返す。認証は要らない。

## エンドポイント

| メソッド | パス | 権限 |
|---|---|---|
| GET | `/api/jobs/{jobId}/transcript` | なし |

## 入力と出力

- 出力は 200 で `{ segments }`。`segments` は `{ start, end, text }` の配列
- 文字起こしがないときは `{ segments: [] }`。ファイル (`outputs/{jobId}/transcript.json`) がない、または S3 の応答に本文のオブジェクトがない、のときである。AI 解析をしなかったジョブ、文字起こしが 0 行だったジョブは、ファイルがない。本文はあっても中身が空の文字列のときは、JSON として読めず、500 になる
- ファイルの中身は JSON として読み、並びも内容も検査せずにそのまま返す
- ジョブが処理中でも、ジョブがあればファイルを探す
- 期限 (`expiresAt`) を過ぎたジョブは、TTL で消える前でも、ジョブがないときと同じに扱い、ファイルを探さない。TTL の削除は遅れ、期限後は S3 のファイルも消えているため、削除の前後で見え方を変えない

## エラー

本文は `{ error, message }` ([API のエラー応答](../term/api-error.md))。

| 条件 | 状態 | `error` | `message` |
|---|---|---|---|
| ジョブがない、または期限を過ぎている | 404 | `JOB_NOT_FOUND` | 指定されたジョブが見つかりません |
| 想定外の例外 (S3 の失敗で「ない」以外のもの、JSON として読めないなど) | 500 | `INTERNAL_SERVER_ERROR` | 文字起こし情報の取得に失敗しました |

## つながり

```mermaid
flowchart TD
    H[見どころ確認画面] -->|取得| A[文字起こし API]
    A --> D[(ジョブのテーブル)]
    A --> S[(S3 バケット<br/>transcript.json)]
    X[抽出バッチ] -->|保存| S
    A -.->|500 の報告| E[(error-events テーブル)]
```

## 理由

- 文字起こしのファイルは任意のものとして扱い、ないときは 404 にせず空の配列を返す。AI 解析をしなかったジョブには、ファイルがないため ([AI 解析](../term/ai-analysis.md))。画面は、文字起こしを読めなくても何も出さずに続ける ([見どころ確認画面](../screen/highlights.md))
