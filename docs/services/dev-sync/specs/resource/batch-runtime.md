---
sources:
  - infra/dev-sync/lib/dev-sync-stack.ts
  - infra/dev-sync/lib/manifest.ts
  - infra/dev-sync/bin/dev-sync.ts
  - services/dev-sync/batch/src/lib/types.ts
sources_hash: c75b7eb7503372dc3bd650c04a5a71963e1525437648ad7944177a70915e80a2
---

# 同期の実行環境

prod のテーブルを dev へコピーする Lambda 関数と、その実行ロール、ジョブごとに関数を起動する EventBridge Scheduler のスケジュール。ジョブはマニフェストに並べて宣言する。

## リソース

| 名前 | 種類 | 用途 |
|---|---|---|
| `nagiyu-dev-sync-{env}` | Lambda 関数 (ECR イメージ) | [同期バッチ](../batch/sync.md)。1 回の起動で 1 ジョブを処理する |
| `nagiyu-dev-sync-{env}-execution` | IAM ロール | 関数の実行ロール |
| 名前は CDK が決める | IAM ロール | Scheduler が関数を起動するためのロール |
| `dev-sync-{safeName}-{添字}` | EventBridge Scheduler のスケジュール | ジョブ 1 件につき 1 つ。`safeName` と添字は「スケジュール」にある |
| `/aws/lambda/nagiyu-dev-sync-{env}` | CloudWatch Logs のロググループ | 関数のログ |

- `{env}` は `dev` か `prod`。メインのスタックは `NagiyuDevSync{Env}`。リージョンは、環境変数 `CDK_DEFAULT_REGION` がなければ `us-east-1`
- 関数の名前は、スタックが `nagiyu-dev-sync-{env}` と明示する。関数の設定のうち、下で触れないものは [Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)のとおり。関数のイメージの置き場 (ECR) は別のスタックで、[デプロイ先](../deploy.md)にある。ワークフローが dev にしかデプロイしないので、実際に存在するのは dev のスタックだけである
- スタックの Output は、`SyncFunctionArn`、`SyncFunctionName`、`ManifestEntryCount` (マニフェストのジョブ数)

## 設定値

### Lambda 関数

[Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)の既定値との差分は次のとおり。

| 項目 | 値 |
|---|---|
| メモリ | 256 MB |
| タイムアウト | 15 分 |
| 起動するハンドラー (`cmd`) | `services/dev-sync/batch/dist/src/sync-handler.handler` |
| 実行ロール | このスタックで作る (下の「権限」) |
| ロググループ | 新しく作らず、既存のものを引き継ぐ (`adoptExistingLogGroup`) |

- 表にない項目は、共通部品の既定のまま。タグの `Service` は `dev-sync`
- ロググループを引き継ぐのは、CloudFormation の管理外に同名のロググループがすでにあり、作ると名前が衝突するため
- エラー履歴への書き込みは、共通部品の既定のまま有効 ([エラーイベントのテーブル](../../../../platform/specs/data/error-events.md))。失敗は [同期バッチ](../batch/sync.md)の「失敗したとき」のとおり報告される

### スケジュール

| 項目 | 値 |
|---|---|
| 名前 | `dev-sync-{safeName}-{添字}`。`safeName` はコピー先テーブル名の、英数字・`-`・`_` 以外を `-` に置き換えたもの。添字はマニフェストでの位置 (0 から) |
| 式 | マニフェストの `schedule` |
| `flexibleTimeWindow` | OFF |
| 状態 | ENABLED |
| 起動先 | 同期の Lambda 関数 (Scheduler のロールで起動する) |
| input | ジョブ設定の JSON。`sourceTable`、`destTable`、`strategy`、`delete`、と、あれば `scope`、`gsi` |

### ジョブ

マニフェスト (`infra/dev-sync/lib/manifest.ts`) に、今は 3 件ある。いずれも戦略は `mirror`、削除は `on`、スケジュールは `rate(1 day)`。戦略の意味は[同期戦略](../term/sync-strategy.md)にある。

| コピー元 (prod) | コピー先 (dev) | 対象の PK |
|---|---|---|
| `nagiyu-niconico-mylist-assistant-dynamodb-prod` | `nagiyu-niconico-mylist-assistant-dynamodb-dev` | `VIDEO#` で始まる |
| `nagiyu-stock-tracker-main-prod` | `nagiyu-stock-tracker-main-dev` | `EXCHANGE#` で始まる |
| `nagiyu-stock-tracker-main-prod` | `nagiyu-stock-tracker-main-dev` | `TICKER#` で始まる |

- niconico は、動画の基本情報 (`VIDEO#`) だけを対象にする。ユーザーごとのデータ (`USER#` 系) は対象外
- stock-tracker は、人が管理する共有マスタの取引所 (`EXCHANGE#`) と銘柄 (`TICKER#`) だけを対象にする。ユーザーごとのデータ (`USER#` 系) は対象外
- 削除 `on` は、prod で削除された取引所・銘柄・動画を、dev からも消すため
- 同じコピー先に対するジョブを、プレフィックスごとに分けているので、削除の範囲も、それぞれのプレフィックスの中に限られる
- `gsiWindow` のジョブは、今は登録されていない

### 合成時の検査

マニフェストの `destTable` が `-dev` で終わらないジョブがあると、CDK の合成 (synth) を中止する。同じ検査を、関数の実行時にも行う ([同期バッチ](../batch/sync.md))。

検査を合成時と実行時の多層にする理由は次のとおり。

- 合成時に止めるのは、prod のテーブルへの書き込み権限が、合成の時点で発行されること自体を防ぐため
- 実行時にも止めるのは、ジョブ設定を手で渡して関数を呼ばれたときに、合成時の検査では防げないため

## 環境変数

| 名前 | 意味 | 値の出どころ |
|---|---|---|
| `NODE_ENV` | 実行環境の名前 | 環境名 (`dev` / `prod`) |
| `SOURCE_READER_ROLE_ARN` | prod のテーブルを読むために引き受けるロールの ARN | `nagiyu-dev-sync-source-reader` の ARN。prod アカウントの ID とロール名の定数から、スタックが組み立てる |
| `ERROR_EVENTS_TABLE_NAME` | エラー履歴の書き込み先 | `nagiyu-error-events-{env}`。共通部品が設定する |

- prod アカウントの ID とロール名は、`infra/shared` の側と値を手で合わせている (パッケージをまたぐ import をしないため)。読み取りロールの詳細は[dev-sync の読み取りロール](../../../../platform/specs/resource/dev-sync-source-reader.md)にある

## 権限

### 実行ロール

`nagiyu-dev-sync-{env}-execution`。Lambda が引き受ける。

| 対象 | 許可する操作 |
|---|---|
| prod の読み取りロール (`SOURCE_READER_ROLE_ARN`) | `sts:AssumeRole` だけ。prod のテーブルへ直接の権限はない |
| コピー先テーブル (マニフェストの `destTable`) | `dynamodb:PutItem` |
| コピー先テーブルのうち、削除 `on` のジョブのもの | `dynamodb:DeleteItem`、`dynamodb:Scan` |
| エラーイベントのテーブル | `dynamodb:PutItem` (共通部品の既定) |
| ログ | AWS 管理ポリシー `AWSLambdaBasicExecutionRole` |

- 権限はコピー先のテーブル単位 (インデックスは含まない) で、マニフェストの内容から決まる。マニフェストにないテーブルへ手で書き込むジョブは、権限エラーになる
- ロール名は、prod の読み取りロールの信頼ポリシーが `nagiyu-dev-sync-dev-execution` と決め打ちで参照する。名前を変えると、AssumeRole できなくなる

### Scheduler のロール

`scheduler.amazonaws.com` が引き受ける。許可する操作は、同期の Lambda 関数への `lambda:InvokeFunction` だけ。

## 理由

- ジョブをマニフェストで宣言するのは、サービスを同期に載せる作業を、マニフェストへの追加で終わらせるため。コピーの処理はサービスの内部表現に依存しない汎用の処理で ([同期バッチ](../batch/sync.md)の「理由」)、スケジュールと権限は、マニフェストから生成される
- 権限を次のように分けて、prod を壊さないことを最優先にしている。
    - prod には読むだけにする。実行ロールは、prod のテーブルへの権限を持たず、prod 側の読み取りロールの引き受けだけを持つ。prod への書き込みの権限は、そもそも発行しない。入口を 1 ロールに絞る理由は [dev-sync の読み取りロール](../../../../platform/specs/resource/dev-sync-source-reader.md)にある
    - コピー先は dev のテーブルに限る。合成時と実行時の両方で `-dev` で終わることを検査する (理由は「合成時の検査」)
    - 削除の権限は、削除するジョブのコピー先にだけ付ける。削除しないジョブのコピー先に、余計な権限を与えない

## 手順

### 同期の対象を足す

1. `infra/dev-sync/lib/manifest.ts` の `MANIFEST` に、ジョブ (コピー元・コピー先・戦略・削除・スケジュール) を足す。コピー先は `-dev` で終わるテーブルにする。戦略は[同期戦略](../term/sync-strategy.md)の「選び方」で決める
    - `mirror` の `scope.pkPrefix` は、マニフェストの型では省略できるが、実行時の検証 (zod) では必須である。省略すると検証で失敗する。PK で絞らないときは、空文字を指定する
2. コピー元が、まだ読み取りロールの対象にないテーブルなら、`infra/shared/lib/iam/dev-sync-source-reader-stack.ts` の `SOURCE_TABLE_NAMES` にも足し、prod へリリースする。一覧に足してリリースするまで、そのジョブの読み取りは権限エラーになる ([dev-sync の読み取りロール](../../../../platform/specs/resource/dev-sync-source-reader.md))
3. `gsiWindow` で、対象のパーティション (取引所など) が増えたときは、増えた分のジョブを足す。足さないと無音で欠ける ([同期戦略](../term/sync-strategy.md)の「gsiWindow の制約」)
4. develop・`integration/**` に push する。メインのスタックは、ワークフローが dev にデプロイする ([デプロイ先](../deploy.md))。ジョブを足した直後は、スケジュールを待たずに[同期バッチ](../batch/sync.md)の「手順」で手で流して確かめられる
