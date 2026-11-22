---
sources:
  - infra/shared/lib/error-events-table-stack.ts
  - infra/common/src/grants/error-events-writer.ts
  - libs/aws/src/error-events/mapper.ts
  - libs/aws/src/error-events/dynamodb-writer.ts
  - services/admin/core/src/errors/dynamodb-reader.ts
  - infra/admin/lib/lambda-stack.ts
  - infra/admin/lib/batch-lambda-stack.ts
sources_hash: 979dec932ff365fc5d328e371184dd7f647774a8e60c13c5d08a799c3e47233c
---

# エラーイベントのテーブル

全サービスと CloudWatch Alarm が書き、Admin が読む、エラーイベント ([ErrorEvent](../term/error-event.md)) の保存先。DynamoDB のテーブル 1 つで、スタックは `NagiyuErrorEventsTable{Env}`。

## テーブル

| 項目 | 値 |
|---|---|
| 名前 | `nagiyu-error-events-{env}` (`{env}` は `dev` か `prod`) |
| 課金 | オンデマンド |
| 暗号化 | AWS 管理キー |
| ポイントインタイムリカバリ | 有効 |
| TTL の属性 | `TTL` |
| ストリーム | 有効 (`NEW_IMAGE`) |
| スタックを消したとき | prod はテーブルを残す (`RETAIN`)。dev はテーブルも消す (`DESTROY`) |

タグは `Application` が `nagiyu`、`Service` が `platform`、`Component` が `error-events`、`Environment` が環境名。

### Export

ほかのスタックが `Fn::ImportValue` で参照する。

| Export 名 | 値 |
|---|---|
| `nagiyu-error-events-table-name-{env}` | テーブル名 |
| `nagiyu-error-events-table-arn-{env}` | テーブルの ARN |
| `nagiyu-error-events-table-stream-arn-{env}` | ストリームの ARN |

## キー設計

| 対象 | パーティションキー | ソートキー | 取得に使う場面 |
|---|---|---|---|
| テーブル | `PK`: `ERROR_EVENT#{serviceId}` | `SK`: `OCCURRED#{発生時刻 (ISO 8601)}#{eventId}` | 1 つのサービスのエラーを、新しい順に一覧する |
| `AllByOccurredAt` (GSI) | `GSI1PK`: `ERROR_EVENT_ALL` (固定) | `GSI1SK`: `SK` と同じ値 | 全サービスを横断して、新しい順に一覧する |

- `AllByOccurredAt` は、すべての項目を射影する
- `SK` の時刻は固定長の ISO 文字列で、文字列の並びが時系列になる
- Admin は、サービスを指定した一覧には `PK`、指定しない一覧には `AllByOccurredAt` を引き、どちらも新しい順に並べる

## 項目

意味は[用語](../term/error-event.md)にある。ここには保存の形だけを書く。

| 属性 | 内容 |
|---|---|
| `PK`、`SK`、`GSI1PK`、`GSI1SK` | 上のキー |
| `Type` | `ErrorEvent` 固定 |
| `EventID`、`ServiceID`、`Source`、`Severity`、`Title`、`Message`、`Context` | 用語の各項目 |
| `OccurredAt` | 発生時刻 (epoch ミリ秒の数値) |
| `TTL` | 発生時刻の 180 日後 (epoch 秒) |
| `CreatedAt`、`UpdatedAt` | 書き込み時刻。書いたあとは変えないので同じ値 |

- 読むときは、小文字始まりの旧い属性名 (`eventId` など。`OccurredAt` は ISO 文字列) も受け付ける
- 読んだ項目が不正なとき (欠けている、型が違う、`Source` と `Severity` が一覧にない) は、除外せず例外にする

## 書き込みと読み取り

| 主体 | 操作 | 内容 |
|---|---|---|
| 各サービス (Lambda、ECS タスク、Batch のジョブ) | 書き込み | エラーイベントを 1 件ずつ書く。同じキー (`serviceId`・発生時刻・`eventId` から作る) の項目があれば上書きせず拒否する |
| Admin の alarm-ingest | 書き込み | CloudWatch Alarm の通知を書く |
| Admin の stream-handler | 読み取り | ストリームの INSERT を受け、Web Push を送る |
| Admin の Web | 読み取り | 一覧と詳細 |

- 書いたあとのイベントは変更できない。更新は拒否する

## 権限

書き込みの権限は `grantErrorEventsWrite` (`infra/common/src/grants/error-events-writer.ts`) が付ける。

| ロール | 対象 | 許可する操作 |
|---|---|---|
| `grantErrorEventsWrite` を呼ぶサービスの実行ロール | `nagiyu-error-events-table-arn-{env}` を Import したテーブル | `dynamodb:PutItem` |
| Admin の Web の実行ロール | テーブルとそのインデックス | `dynamodb:GetItem`、`dynamodb:Query`、`dynamodb:PutItem` |
| Admin の stream-handler | テーブルのストリーム | 読み取り (バッチ 100 件、最大待ち 5 秒、再試行 2 回、失敗時はバッチを二分) |

- Import を使うので、テーブルのスタックが先にデプロイされている必要がある
- Lambda の既定は[Lambda 関数の共通部品](../resource/lambda-function.md)の「エラー履歴」にある。ECS や Batch のサービスは、自分のスタックから呼ぶ

## 理由

- Admin 自身のテーブルとは分ける。時系列の取得、TTL、ストリームという要件に合わせたキーにするため
- 全サービス横断の一覧に GSI を使う。パーティションキーが `serviceId` のままでは、サービスをまたぐ時系列の取得ができない。GSI のパーティションキーは固定値にしている
- `SK` に発生時刻を入れる。サービスごとの一覧が、並べ替えなしで時系列になる
- ストリームを有効にし、`NEW_IMAGE` を流す。INSERT をきっかけに Web Push を送るため
- prod でだけテーブルを残すのは、スタックを消したり作り直したりしたときに、prod のエラー履歴を失わないため。dev の履歴は失っても困らないので、スタックと一緒に消して、作り直しを妨げないようにする
- ErrorEvent と DynamoDB の項目の相互の変換 (キーの組み立て、属性名) は、`libs/aws/src/error-events/mapper.ts` の `ErrorEventMapper` だけが持つ。書く側 (各サービスが使う `libs/aws` の書き込み) と読む側 (Admin) は、どちらもこれを使う。変換を書く側と読む側で別々に持つと、項目を足したときに片方だけが直り、Admin が新しい項目を読めなくなるため
