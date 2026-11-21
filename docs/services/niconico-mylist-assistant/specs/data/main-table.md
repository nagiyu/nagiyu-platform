---
sources:
  - infra/niconico-mylist-assistant/lib/dynamodb-stack.ts
  - infra/common/src/utils/naming.ts
  - services/niconico-mylist-assistant/core/src/mappers/video.mapper.ts
  - services/niconico-mylist-assistant/core/src/mappers/user-setting.mapper.ts
  - services/niconico-mylist-assistant/core/src/mappers/batch-job.mapper.ts
  - services/niconico-mylist-assistant/core/src/mappers/niconico-credential.mapper.ts
  - services/niconico-mylist-assistant/core/src/entities/video.entity.ts
  - services/niconico-mylist-assistant/core/src/entities/user-setting.entity.ts
  - services/niconico-mylist-assistant/core/src/entities/batch-job.entity.ts
  - services/niconico-mylist-assistant/core/src/entities/niconico-credential.entity.ts
  - services/niconico-mylist-assistant/core/src/repositories/dynamodb-video.repository.ts
  - services/niconico-mylist-assistant/core/src/repositories/dynamodb-user-setting.repository.ts
  - services/niconico-mylist-assistant/core/src/types/index.ts
sources_hash: 9e0bb98816696c66d5f91e7948fb464ad3634a7dc5bfc2d7cd3693a54ba2edcd
---

# 単一テーブル

サービスのデータをすべて保存する DynamoDB の 1 つのテーブル。動画の基本情報、利用者ごとの動画の設定、バッチのジョブ、ニコニコのセッション (暗号化) の 4 種を、キーの形で分けて入れる。

## テーブル

| 項目 | 内容 |
|---|---|
| 名前 | `nagiyu-niconico-mylist-assistant-dynamodb-{env}` (`{env}` は `dev` か `prod`) |
| 課金 | オンデマンド |
| 暗号化 | AWS 管理のキー |
| バックアップ | ポイントインタイムリカバリを有効にする |
| 有効期限 (TTL) | 属性 `TTL` (エポック秒)。バッチのジョブだけが持つ |

| 環境 | スタックを削除したときのテーブル |
|---|---|
| dev | 削除する |
| prod | 残す |

- 本番の動画基本情報は、定期的に dev へ複写される ([同期バッチ](../../../../specs/dev-sync/batch/sync.md))

## キー設計

| 種類 | `Type` | PK | SK |
|---|---|---|---|
| [動画基本情報](../term/video-basic-info.md) | `VIDEO` | `VIDEO#{動画 ID}` | `VIDEO#{動画 ID}` |
| [ユーザー設定](../term/video-setting.md) | `USER_SETTING` | `USER#{利用者 ID}` | `VIDEO#{動画 ID}` |
| [バッチジョブ](../term/batch-job.md) | `BATCH_JOB` | `USER#{利用者 ID}` | `BATCH_JOB#{ジョブ ID}` |
| ニコニコのセッション ([user_session](../term/user-session.md)) | `NICONICO_CREDENTIAL` | `USER#{利用者 ID}` | `CREDENTIAL#niconico` |

どの取得に使うか。

| 取得 | 方法 |
|---|---|
| 動画基本情報の全件 (動画の一覧・登録する動画の選択) | テーブル全体の Scan。PK と SK がどちらも `VIDEO#` で始まるものに絞る |
| 動画基本情報の 1 件 | PK と SK を指定した GetItem |
| 動画基本情報の複数件 (検索結果の既登録の判定) | PK と SK を指定した BatchGetItem |
| 利用者の動画の設定の全件 | PK が `USER#{利用者 ID}` で、SK が `VIDEO#` で始まるものの Query |
| 動画の設定の 1 件 | PK と SK を指定した GetItem |
| ジョブの 1 件 | PK と SK を指定した GetItem |
| ニコニコのセッション | PK と `CREDENTIAL#niconico` を指定した GetItem |

- インデックス `GSI1` (PK が `GSI1PK`、SK が `GSI1SK`、すべての項目を射影) を持つが、このサービスのコードは `GSI1PK` と `GSI1SK` をどの項目にも書かず、`GSI1` を使う取得もない
- 読むときは、現在の名前の属性がなければ、旧い形式の属性名 (先頭が小文字の `videoId` など) も受け付ける

## 項目

日時はエポックミリ秒の数値。表に書かない `PK`・`SK`・`Type` は上のキー設計のとおり。

### 動画基本情報

| 項目 | 型 | 意味 |
|---|---|---|
| `VideoID` | 文字列 | [動画 ID](../term/video-id.md) |
| `Title` | 文字列 | タイトル |
| `ThumbnailURL` | 文字列 | サムネイルの URL |
| `Length` | 文字列 | 長さ (`分:秒`) |
| `CreatedAt` | 数値 | このサービスに登録した日時 |
| `VideoUpdatedAt` | 数値 | 任意。動画の更新日時。このサービスのコードは書かない |

### ユーザー設定

| 項目 | 型 | 意味 |
|---|---|---|
| `UserID` | 文字列 | 利用者 ID |
| `VideoID` | 文字列 | 動画 ID |
| `IsFavorite` | 真偽値 | お気に入り |
| `IsSkip` | 真偽値 | スキップ |
| `Memo` | 文字列 | 任意。メモ (空の文字列も許す) |
| `CreatedAt`、`UpdatedAt` | 数値 | 作成・更新の日時 |

### バッチジョブ

| 項目 | 型 | 意味 |
|---|---|---|
| `JobID` | 文字列 | AWS Batch のジョブ ID |
| `UserID` | 文字列 | 依頼した利用者 |
| `Status` | 文字列 | `SUBMITTED`、`RUNNING`、`SUCCEEDED`、`FAILED` のどれか |
| `Result` | マップ | 任意。`registeredCount`、`failedCount`、`totalCount`、`errorMessage` (あれば) |
| `PushSubscription` | マップ | 任意。完了通知の宛先。`endpoint` と `keys` (`p256dh`、`auth`) |
| `CreatedAt`、`UpdatedAt` | 数値 | 作成・更新の日時。`CreatedAt` は変えられない |
| `CompletedAt` | 数値 | 任意。完了の日時 |
| `TTL` | 数値 | 作成の 7 日後 (エポック秒)。DynamoDB が自動で消す。消えるまでに遅れることがある |

### ニコニコのセッション

| 項目 | 型 | 意味 |
|---|---|---|
| `UserID` | 文字列 | 利用者 ID |
| `EncryptedUserSession` | 文字列 | 暗号化した `user_session`。`ciphertext`、`iv`、`authTag` の JSON 文字列 |
| `AcquiredAt` | 数値 | 保存した日時 |
| `EstimatedExpiresAt` | 数値 | 推定有効期限 |
| `CreatedAt` | 数値 | `AcquiredAt` と同じ値 |

## 理由

- 動画の基本情報と、利用者ごとの設定を分けて、1 つのテーブルに置く。基本情報は全利用者で共通で、設定は利用者ごとに違う。分けると、同じ動画の基本情報を利用者の数だけ持たずに済み、各利用者は自分の設定だけを持つ。バッチのジョブの状態やセッションも同じテーブルに入れ、利用者の ID を PK にして、利用者ごとに読む
- 動画を削除しても、他の利用者が同じ動画に持つ設定は消えず残る。削除 ([動画 API](../api/videos.md)) は、動画基本情報と、削除した利用者の設定だけを消すため。一覧は動画基本情報を起点にするので、残った設定は他の利用者の一覧に出ず、画面から消せない。同じ動画をあとで取り込み直すと、残った設定が戻る。利用者が今は 1 人でこの状況が起きないため、対処していない
