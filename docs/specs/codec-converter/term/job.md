---
id: codec-converter/term/job
title: ジョブとステータス
kind: term
service: codec-converter
sources:
  - services/codec-converter/core/src/types.ts
  - services/codec-converter/core/src/constants.ts
  - services/codec-converter/core/src/mappers/job.mapper.ts
  - services/codec-converter/core/src/format.ts
sources_hash: 7d4776fe8c73e97138409d3eb906cba45c58def08d7a2098dc0cb9ba5e385add
related_cards: [codec-converter/api/jobs, codec-converter/batch/convert, codec-converter/flow/conversion, codec-converter/screen/upload, codec-converter/screen/job-detail]
---

# ジョブとステータス

1 本の動画の変換依頼を表す記録。DynamoDB の `jobId` をキーにした 1 件で、変換の進み具合 (ステータス) を持つ。

## 説明

| 項目 | 内容 |
|---|---|
| `jobId` | UUID v4。画面には先頭 8 文字、`...`、末尾 4 文字で出す (12 文字以下はそのまま) |
| `status` | `PENDING`、`PROCESSING`、`COMPLETED`、`FAILED` |
| `inputFile` | 入力の S3 キー。`uploads/{jobId}/input.mp4` |
| `outputFile` | 出力の S3 キー。`outputs/{jobId}/output.{mp4 か webm}`。変換が終わると付く |
| `outputCodec` | [出力コーデック](./output-codec.md) |
| `fileName`、`fileSize` | 元のファイル名と、申告されたバイト数 |
| `createdAt`、`updatedAt` | epoch ミリ秒 |
| `expiresAt` | 作成時刻の 24 時間後 (86,400 秒)。保存するときは TTL 属性 (`TTL`) に epoch 秒で書く |
| `errorMessage` | 失敗したときの内容 |

- ステータスの意味と、変える主体は次のとおり

| ステータス | 意味 | 変える主体 |
|---|---|---|
| `PENDING` | 作成済み。変換の開始を待つ。Batch に投入しても変わらない | [ジョブ API](../api/jobs.md) が作成時に設定する |
| `PROCESSING` | 変換中 | [変換バッチ](../batch/convert.md)が開始時に設定する |
| `COMPLETED` | 変換が終わり、出力がある | 変換バッチ |
| `FAILED` | 変換が失敗した。`errorMessage` に内容が入る | 変換バッチ |

- Batch が再試行すると、`FAILED` のジョブが再び `PROCESSING` になりうる。ステータスの更新に前の状態の条件はない
- 保存する属性名は先頭が大文字 (`Status`、`InputFile` など)。旧形式の小文字始まりの属性 (`status` など) も読める。キーの `jobId` だけは小文字のまま
- 保存した項目の必須項目が欠ける、ステータスやコーデックが許可外の値のときは、読む側が例外にする

## 関連するカード

- [ジョブ API](../api/jobs.md)・[変換バッチ](../batch/convert.md)・[変換の経路](../flow/conversion.md)
- [アップロード画面](../screen/upload.md)・[ジョブ詳細画面](../screen/job-detail.md)
