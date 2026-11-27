---
sources:
  - infra/codec-converter/lib/codec-converter-stack.ts
  - services/codec-converter/core/src/mappers/job.mapper.ts
  - services/codec-converter/core/src/repositories/dynamodb-job.repository.ts
  - services/codec-converter/core/src/types.ts
  - services/codec-converter/core/src/constants.ts
  - services/codec-converter/batch/src/index.ts
  - services/codec-converter/web/src/app/api/jobs/route.ts
  - services/codec-converter/web/src/app/api/jobs/[jobId]/route.ts
  - libs/aws/src/dynamodb/validators.ts
  - libs/aws/src/dynamodb/store/dynamodb-entity-store.ts
  - libs/aws/src/dynamodb/store/entity-store-support.ts
sources_hash: 75fc282f91f06dc6f75108bdba087d70d60b84f91bb9456463b12b55a6cf3b35
---

# ジョブのテーブル

変換の依頼 ([ジョブ](../term/job.md)) を保存する DynamoDB のテーブル。ジョブ 1 件が 1 項目で、ステータスと、入出力の S3 キーなどを持つ。Web が作って読み、ステータスは変換バッチが更新する。

## テーブル

| 項目 | 内容 |
|---|---|
| 名前 | `nagiyu-codec-converter-jobs-{env}` (`{env}` は `dev` か `prod`) |
| 課金 | オンデマンド |
| 有効期限 (TTL) の属性 | `TTL` |
| バックアップ | ポイントインタイムリカバリは有効にしない |
| 暗号化 | 指定しない (DynamoDB の既定) |
| ストリーム | なし |
| スタックを削除したとき | テーブルも削除する (`DESTROY`)。dev と prod の両方 |

- 名前は、[Web の実行環境](../resource/web-runtime.md)と[Batch の実行環境](../resource/batch-runtime.md)の環境変数 `DYNAMODB_TABLE_NAME` で渡す
- スタックは `NagiyuCodecConverter{Env}`。[ストレージ](../resource/storage.md)と同じスタックにある

## キー設計

| 種類 | 属性 | 値 |
|---|---|---|
| パーティションキー | `jobId` | ジョブの ID (UUID v4) |
| ソートキー | なし | |

- セカンダリインデックスは持たない
- 取得は、`jobId` を指定した GetItem だけ。一覧や絞り込みの取得はない
- 書き込みは次の 2 つ。
    - 作成: Web が、ジョブ API の `POST /api/jobs` で、`PENDING` の項目を作る
    - ステータスの更新: 変換バッチが、`status`・`outputFile`・`errorMessage` だけを更新する。更新前の状態は条件にしない ([ジョブとステータス](../term/job.md))。項目があること (`attribute_exists(jobId)`) は条件にするので、項目が消えたあとの更新は `EntityNotFoundError` で失敗する。変換バッチは項目を読まず、更新の戻り値 (`ALL_NEW`) で更新後の項目を受け取るだけ
- キーの属性名 `jobId` だけは、先頭が小文字のまま。ほかの属性は先頭が大文字 ([理由](#理由))

## 項目

日時は、特に断りがなければエポックミリ秒の数値。

| 属性 | 型 | 意味 |
|---|---|---|
| `jobId` | 文字列 | ジョブの ID。キー |
| `Type` | 文字列 | 常に `Job` |
| `Status` | 文字列 | `PENDING`、`PROCESSING`、`COMPLETED`、`FAILED`。旧名 `status` |
| `InputFile` | 文字列 | 入力の S3 キー (`uploads/{jobId}/input.mp4`)。旧名 `inputFile` |
| `OutputFile` | 文字列 | 出力の S3 キー (`outputs/{jobId}/output.{mp4 か webm}`)。変換が終わると付く。なければ属性を持たない。旧名 `outputFile` |
| `OutputCodec` | 文字列 | [出力コーデック](../term/output-codec.md) (`h264`、`vp9`、`av1`)。旧名 `outputCodec` |
| `FileName` | 文字列 | 元のファイル名。旧名 `fileName` |
| `FileSize` | 数値 | 申告されたバイト数。0 以上。旧名 `fileSize` |
| `CreatedAt` | 数値 | 作成日時。作成後に変わらない。旧名 `createdAt` |
| `UpdatedAt` | 数値 | 書き込みのたびに更新する日時。旧名 `updatedAt` |
| `TTL` | 数値 | 有効期限。作成から 24 時間後 (86,400 秒) の時刻を、エポック**秒**で書く (切り捨て)。旧名 `expiresAt` |
| `ErrorMessage` | 文字列 | 失敗したときの、利用者向けの決まった文言。なければ属性を持たない。旧名 `errorMessage` |

- `InputFile`・`OutputCodec`・`FileName`・`FileSize`・`CreatedAt` は、作成後に変えない。更新で含めると拒否される
- 読むときは、現在の名前の属性がなければ旧名を読む。新旧が併存するときは新しい名前を優先する。時刻は、数値で `1e11` 未満ならエポック秒とみなして 1,000 倍し、ISO 文字列も受け付ける
- 項目を更新すると、新しい名前で書いた属性の旧名は削除される。更新されない項目は旧形式のまま残る
- 読めない項目 (必須の属性が欠けている、`Status` や `OutputCodec` が許可外の値など) は、読む側が例外にする
- 属性の意味は[ジョブとステータス](../term/job.md)にある

## 理由

- DynamoDB を使う。TTL で作成から 24 時間後にジョブを自動で消せる。取得は `jobId` で引くだけで、複雑な問い合わせが要らない。オンデマンド課金は小規模の運用に合う。RDS は、この用途には過剰で、サーバーの管理が要る
- TTL の削除は遅れうる。DynamoDB は期限を過ぎた項目を、すぐには消さないことがある。API は `TTL` を見て弾かないので、削除されるまでは、期限を過ぎたジョブも読める
- バックアップを取らない (ポイントインタイムリカバリは有効にしない)。理由は[データの保持](../../requirements/non-functional/data-retention.md)の要件にある
- キー属性 `jobId` を camelCase のまま据え置く理由は、[データアクセスの規約](../../../../platform/rules/data-access.md)にある
