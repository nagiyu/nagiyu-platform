---
sources:
  - infra/quick-clip/lib/dynamodb-stack.ts
  - services/quick-clip/core/src/mappers/job.mapper.ts
  - services/quick-clip/core/src/mappers/highlight.mapper.ts
  - services/quick-clip/core/src/mappers/usage-keys.ts
  - services/quick-clip/core/src/mappers/daily-salt.mapper.ts
  - services/quick-clip/core/src/repositories/dynamodb-job.repository.ts
  - services/quick-clip/core/src/repositories/dynamodb-highlight.repository.ts
  - services/quick-clip/core/src/repositories/dynamodb-usage.repository.ts
  - services/quick-clip/core/src/repositories/counting-usage.repository.ts
  - services/quick-clip/core/src/libs/job.service.ts
  - services/quick-clip/core/src/libs/usage.service.ts
sources_hash: 450659994d11eeea673696998a445504706c6b58c48b8557e728e47b7541225e
---

# ジョブのテーブル

Quick Clip が持つ、ジョブ・見どころ・利用回数・日ごとの塩・IP ごとの日次のジョブ数を保存する DynamoDB のテーブル。1 つのテーブルに、キーの接頭辞で種類を分けて置く。Web・抽出バッチ・clip-regenerate が読み書きする。

## テーブル

| 項目 | 内容 |
|---|---|
| 名前 | `nagiyu-quick-clip-jobs-{env}` (`{env}` は `dev` か `prod`) |
| 課金 | オンデマンド |
| 有効期限 (TTL) | 属性 `TTL` (エポック秒) |
| ポイントインタイムリカバリ | 有効にしない |
| インデックス | なし |

| 操作 | 起きること |
|---|---|
| スタックの削除 (dev・prod とも) | テーブルとデータを削除する (削除ポリシーが削除) |
| TTL の期限切れ | DynamoDB が項目を削除する |

- 名前は、[Web の実行環境](../resource/web-runtime.md)、[バッチの実行環境](../resource/batch-runtime.md)、[ワーカーの実行環境](../resource/worker-runtime.md)の環境変数 `DYNAMODB_TABLE_NAME` で渡す。ワーカーのうち clip-regenerate だけが読み書きし、zip-generator は触れない
- スタックは `NagiyuQuickClipDynamoDB{Env}` ([デプロイ先](../deploy.md))
- 項目を消すのは TTL だけ。コードにテーブルの項目を消す操作はない
- TTL の削除は、期限の直後とは限らない

## キー設計

主キーは `PK` (パーティションキー) と `SK` (ソートキー) で、どちらも文字列。種類ごとのキーは次のとおり。

| 種類 | `PK` | `SK` | `Type` |
|---|---|---|---|
| ジョブ | `JOB#{jobId}` | `JOB#{jobId}` | `JOB` |
| 見どころ | `JOB#{jobId}` | `HIGHLIGHT#{highlightId}` | `HIGHLIGHT` |
| 利用回数 (月ごと) | `USAGE#USER#{利用者の ID}` (ログイン中) または `USAGE#ANON#{匿名の ID}` (未ログイン) | `MONTH#{YYYYMM}` | `USAGE_COUNTER` |
| 日ごとの塩 | `USAGE_SALT#{YYYYMMDD}` | `PK` と同じ値 | `USAGE_SALT` |
| IP ごとの日次のジョブ数 | `USAGE_IP#{YYYYMMDD}` | `IP#{IP のハッシュ}` | `USAGE_IP` |

- 月 (`YYYYMM`) と日 (`YYYYMMDD`) は日本時間の暦 ([日本時間の期間](../../../../platform/specs/lib/common/jst-period.md))
- 見どころは、ジョブと同じ `PK` に載る。ジョブの見どころを `PK` の Query 1 回で引くため
- 利用回数・塩・IP の項目は接頭辞が `USAGE` で始まり、ジョブ (`JOB#`)・見どころ (`HIGHLIGHT#`) のキーと衝突しない

どの取得に使うか。

| 取得 | 方法 |
|---|---|
| ジョブ 1 件 | `PK` と `SK` を指定した GetItem |
| ジョブの更新 | `PK` と `SK` を指定した UpdateItem (Batch のジョブ ID、段階、動画の長さ、エラー、進捗、利用回数の記録を書く) |
| 利用回数の戻し済み・付け替え済みの印 | UpdateItem。印の属性 (`UsageReleased`、`UsageSwitched`) が未設定のときだけ書く条件つき。条件に負けたら書かない |
| ジョブの見どころの一覧 | `PK` が `JOB#{jobId}` で、`SK` が `HIGHLIGHT#` で始まるものの Query。アプリの側で `Order` の昇順に並べる |
| 見どころ 1 件 | `PK` と `SK` を指定した GetItem |
| 見どころの保存・更新 | 抽出バッチは見どころをまとめて PutItem で書く (既存があれば置き換える)。更新は UpdateItem |
| 利用回数の加算・戻し | [回数カウンター](../../../../platform/specs/lib/aws/usage-counter.md)の DynamoDB 版が、条件つきの UpdateItem で行う |
| 利用回数の取得 | 回数カウンターの読み取り (強い整合性)。AI 解析あり・なしの 2 つの属性を読む |
| 日ごとの塩の取得 | 強い整合性の GetItem |
| 日ごとの塩の作成 | その日になければ作る条件つきの書き込み。同時に別のリクエストが先に作っていたら、その塩を使う |

数え方の共通の仕組み (条件つきの加算と戻し、複数の上限を順に数える) は回数カウンターにある。月の回数と IP の日次のジョブ数は、未ログインのとき順に数える (どちらかで断られたら、通ったほうを戻す)。

## 項目

時刻は、特記がなければエポックミリ秒の数値。項目の意味は[ジョブとステータス](../term/job.md)、[見どころとクリップの状態](../term/highlight.md)にある。ここには、保存の形だけを書く。

### ジョブ

| 項目 | 型 | 内容 |
|---|---|---|
| `JobID` | 文字列 | ジョブの ID。キーと同じ値 |
| `OriginalFileName` | 文字列 | 元のファイル名 |
| `FileSize` | 数値 | ファイルのバイト数 |
| `CreatedAt` | 数値 | 作成の日時。変えられない |
| `UpdatedAt` | 数値 | 書き込みのたびにストアが更新する日時 |
| `TTL` | 数値 | 削除予定のエポック秒。作成の 24 時間後 |
| `BatchJobID` | 文字列 | 投入した Batch のジョブの ID。投入するまではない |
| `BatchStage` | 文字列 | `downloading`、`analyzing`、`clipping`、`aggregating` のどれか |
| `DurationSec` | 数値 | 動画の長さ (秒) |
| `ErrorMessage` | 文字列 | 失敗の内容。空の文字列も許す |
| `AnalysisProgress` | マップ | 解析の内訳 (`motion`、`volume`、`transcription`、`emotionScoring`) |
| `Usage` | マップ | 数えた利用回数の記録。`subject` (文字列)、`month` (文字列)、`kind` (`ai` か `noAi`)、`noAiLimit` (数値) |
| `AiAnalysis` | 真偽値 | AI 解析をするか |
| `UsageReleased` | 真偽値 | 数えた回数を戻し済みか |
| `UsageSwitched` | 真偽値 | AI 解析なしへ付け替え済みか |
| `MaxDurationSec` | 数値 | 許される動画の長さの上限 (秒) |

### 見どころ

| 項目 | 型 | 内容 |
|---|---|---|
| `HighlightID` | 文字列 | 見どころの ID。`SK` に含まれる値と同じ。変えられない |
| `JobID` | 文字列 | ジョブの ID。変えられない |
| `Order` | 数値 | 並び順 |
| `StartSec`、`EndSec` | 数値 | 区間の開始と終了 (秒) |
| `Source` | 文字列 | `motion`、`volume`、`emotion`、`both` のどれか |
| `Status` | 文字列 | `accepted`、`rejected`、`unconfirmed` のどれか |
| `ClipStatus` | 文字列 | `PENDING`、`GENERATING`、`GENERATED`、`FAILED` のどれか |
| `ClipGeneratingStartedAt` | 数値 | `ClipStatus` を `GENERATING` にした日時。ないことがある |
| `DominantEmotion` | 文字列 | `laugh`、`excite`、`touch`、`tension` のどれか。ないことがある |
| `UpdatedAt` | 数値 | 書き込みのたびにストアが更新する日時 |
| `TTL` | 数値 | 削除予定のエポック秒。ジョブの `TTL` と同じ値 |

### 利用回数

| 項目 | 型 | 内容 |
|---|---|---|
| `AiCount` | 数値 | その月の AI 解析ありの回数。一度も数えていなければない |
| `NoAiCount` | 数値 | その月の AI 解析なしの回数。一度も数えていなければない |
| `TTL` | 数値 | 削除予定のエポック秒。月ごとの記録の TTL ([日本時間の期間](../../../../platform/specs/lib/common/jst-period.md))。項目を最初に作ったときだけ書く |

### 日ごとの塩

| 項目 | 型 | 内容 |
|---|---|---|
| `Salt` | 文字列 | 利用者の IP をハッシュするときの鍵。作ったあとは変えない |
| `CreatedAt`、`UpdatedAt` | 数値 | 作成の日時と、ストアが書き込みのたびに更新する日時 |
| `TTL` | 数値 | 削除予定のエポック秒。日ごとの記録の TTL ([日本時間の期間](../../../../platform/specs/lib/common/jst-period.md)) |

### IP ごとの日次のジョブ数

| 項目 | 型 | 内容 |
|---|---|---|
| `Count` | 数値 | その日にその IP (のハッシュ) から作ったジョブ数。未ログインだけが数える |
| `TTL` | 数値 | 削除予定のエポック秒。日ごとの塩と同じ値。項目を最初に作ったときだけ書く |

- IP は、そのままは保存しない。日ごとの塩を鍵にした HMAC (SHA-256) の 16 進の文字列を、`SK` に入れる ([利用回数の流れ](../flow/usage-metering.md))
- 利用回数と IP の項目は、回数カウンターが直接書くので、`CreatedAt` と `UpdatedAt` を持たない ([回数カウンター](../../../../platform/specs/lib/aws/usage-counter.md))
- ジョブと見どころは、小文字で始まる旧い属性名 (`jobId`、`expiresAt` など) も読む。書くのは新しい名前だけ

## 理由

- 利用回数・日ごとの塩・IP の項目は、ジョブや見どころと同じテーブルに同居するので、接頭辞を `USAGE` で始まる形にして、キーの衝突を避ける
