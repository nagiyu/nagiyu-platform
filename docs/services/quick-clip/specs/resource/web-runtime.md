---
sources:
  - infra/quick-clip/lib/lambda-stack.ts
  - infra/quick-clip/bin/quick-clip.ts
  - .github/workflows/quick-clip-deploy.yml
  - services/quick-clip/web/Dockerfile
  - services/quick-clip/web/src/app/jobs/[jobId]/VideoAd.tsx
sources_hash: 22f9cfbb53c2c2884ce3c9fabbaf2147b9d83f97c9b2002b71ff22970621ae9e
---

# Web の実行環境

Next.js の Web を動かす Lambda 関数と、その実行ロール・ロググループ。関数は ECR のイメージから作り、Function URL で公開する。

## リソース

| 名前 | 種類 | 用途 |
|---|---|---|
| `nagiyu-quick-clip-web-{env}` | Lambda 関数 (ECR イメージ) | Web 本体 |
| Function URL | Lambda の Function URL | 関数の公開の入口。前段の CloudFront から呼ばれる ([デプロイ先](../deploy.md)) |
| 実行ロール (名前は CDK が決める) | IAM ロール | 関数の実行ロール |
| `/aws/lambda/nagiyu-quick-clip-web-{env}` | CloudWatch Logs のロググループ | 関数のログ |
| `nagiyu-quick-clip-ecr-{env}` | ECR リポジトリ | Web のイメージの置き場。タグはコミットの SHA |

`{env}` は `dev` か `prod`。スタックは `NagiyuQuickClipLambda{Env}` ([デプロイ先](../deploy.md))。名前と、実行ロールの構成は [Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)のとおり。

## 設定値

| 項目 | 値 |
|---|---|
| メモリ | 1,024 MB |
| タイムアウト | 30 秒 |
| Function URL の認証 | AWS_IAM。直接呼ぶと 403 になる |
| Function URL の CORS の許可するオリジン | この環境のサービスの URL だけ ([デプロイ先](../deploy.md)のホスト名) |
| Function URL の CORS の許可するメソッド・ヘッダー | すべて |
| Function URL の CORS の保持 | 1 日 |

- メモリだけが共通部品の既定 (512 MB) と違う。タイムアウトと、表にない項目 (アーキテクチャ、X-Ray、ログの保持期間、イメージのタグ、タグ、CloudFront からの呼び出しの許可) は、[Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)の既定値のまま
- ロググループは新しく作らず、既存のものを引き継ぐ (`adoptExistingLogGroup`。[Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)の「ロググループ」)
- エラー履歴への書き込みは、共通部品の既定ではなく、このスタックが環境変数と権限を足す

## 環境変数

| 名前 | 意味 | 値の出どころ |
|---|---|---|
| `NODE_ENV` | Node.js と Next.js の最適化の切り替え | `prod` なら `production`、`dev` なら `development` |
| `DEPLOY_ENV` | アプリの中で dev と prod を見分ける環境名 | 環境名 |
| `NAGIYU_ENV` | ログイン用 Cookie のドメインの判定に使う環境名 | 環境名 |
| `AUTH_URL` | Auth サービスの URL | 環境ごとの Auth の URL |
| `NEXT_PUBLIC_AUTH_URL` | ログインのリダイレクト先の Auth の URL | `AUTH_URL` と同じ値 |
| `AUTH_SECRET` | ログインの JWT を検証する鍵 | CDK の context `nextAuthSecret`。なければ仮の値 `PLACEHOLDER` |
| `APP_VERSION` | 死活確認 API が返すバージョン | デプロイ時の環境変数 `APP_VERSION` (ワークフローが `services/quick-clip/web/package.json` の version を渡す)。なければ context `appVersion`、それもなければ `0.1.0` |
| `DYNAMODB_TABLE_NAME` | [ジョブのテーブル](../data/jobs-table.md)の名前 | `nagiyu-quick-clip-jobs-{env}` |
| `S3_BUCKET` | [ストレージ](./storage.md)のバケットの名前 | `nagiyu-quick-clip-storage-{env}` |
| `BATCH_JOB_QUEUE_ARN` | ジョブを投入する[ジョブキュー](./batch-runtime.md)の ARN | 名前 `nagiyu-quick-clip-{env}` から組み立てた ARN |
| `BATCH_JOB_DEFINITION_PREFIX` | ジョブ定義の名前の接頭辞。投入のとき `{接頭辞}-{small, large, xlarge}` にする | `nagiyu-quick-clip-{env}` |
| `CLIP_REGENERATE_FUNCTION_NAME` | クリップを作り直す Lambda の名前 | `nagiyu-quick-clip-clip-regenerate-{env}` ([ワーカーの実行環境](./worker-runtime.md)) |
| `ZIP_GENERATOR_FUNCTION_NAME` | ZIP を作る Lambda の名前 | `nagiyu-quick-clip-zip-generator-{env}` ([ワーカーの実行環境](./worker-runtime.md)) |
| `ERROR_EVENTS_TABLE_NAME` | エラー履歴の書き込み先 | `nagiyu-error-events-{env}` |

- `AUTH_SECRET` は Auth が作るシークレットを読むだけで、Quick Clip では作らない ([Auth のシークレット](../../../auth/specs/resource/secrets.md)、[認証の規約](../../../../platform/rules/authentication.md))。デプロイのワークフローが Secrets Manager から読み、CDK の context で渡す。実行中に Secrets Manager は読まない
- OpenAI の API キーは Web に渡さない。Batch のジョブ定義だけが持つ ([シークレット](./secrets.md))

### ビルド時に入る値

Web のイメージのビルドで、クライアントのコードに埋め込まれる値。実行中の環境変数では変えられず、変えるにはイメージを作り直す。

| 名前 | 意味 | 値の出どころ |
|---|---|---|
| `NEXT_PUBLIC_VAST_TAG_URL` | 動画広告の VAST タグの URL | Docker のビルド引数。デプロイのワークフローが、prod なら GitHub の Variables `QUICK_CLIP_VAST_TAG_URL_PROD`、それ以外なら `QUICK_CLIP_VAST_TAG_URL_DEV` の値を渡す |
| `APP_VERSION` | イメージに入るバージョン | Docker のビルド引数。ワークフローが web の `package.json` の version を渡す |

- `NEXT_PUBLIC_VAST_TAG_URL` が空のとき、広告を表示せず、再生が終わったものとして先へ進む。値は GitHub の Variables にあり、ここに写しは持たない
- 広告の振る舞いは[処理状況の画面](../screen/job-status.md)にある

## 権限

実行ロールの権限のうち、共通部品の既定で付くもの (ログの書き込み、X-Ray など) は[Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)に従う。Quick Clip が足すのは次のとおり。

| 対象 | 許可する操作 |
|---|---|
| [ジョブのテーブル](../data/jobs-table.md)とそのインデックス | `GetItem`、`PutItem`、`UpdateItem`、`Query` (`DeleteItem` と `Scan` は許可しない) |
| [ストレージ](./storage.md)のバケット | `s3:ListBucket` |
| [ストレージ](./storage.md)のバケットの全オブジェクト | `s3:GetObject`、`s3:PutObject`、`s3:DeleteObject` |
| [ジョブキュー](./batch-runtime.md)と、3 つのジョブ定義 (版つきも含む) | `batch:SubmitJob` |
| すべてのリソース (`*`) | `batch:DescribeJobs` |
| clip-regenerate と zip-generator の 2 つの Lambda 関数 | `lambda:InvokeFunction` ([ワーカーの実行環境](./worker-runtime.md)) |
| [エラーイベントのテーブル](../../../../platform/specs/data/error-events.md) | `dynamodb:PutItem` |

- `batch:SubmitJob` を許可するジョブ定義の ARN は、版なしの名前と、版つき (`:*`) の両方。Web が投入で渡すジョブ定義は、版を付けない名前 (`{接頭辞}-{サイズ}`)
- `batch:DescribeJobs` は、リソースを絞る権限の指定に対応していないため、`*` に許可する
- エラー履歴の `PutItem` は、Web が 500 の例外と、例外を握って続ける箇所の失敗 (warning など) を報告するために持つ ([エラーの報告](../../../../platform/specs/lib/aws/error-reporting.md))
- Secrets Manager を読む権限は持たない。シークレットの値は、デプロイのときに環境変数へ入る

## 理由

- `NAGIYU_ENV` を別に持つのは、`NODE_ENV` が Next.js のビルド時に `production` へ置き換えられ、デプロイしたあとの dev と prod の判定に使えないため
- Batch の ARN は、スタックの出力を参照せず、命名規則から組み立てて渡す ([デプロイ先](../deploy.md)の「理由」)
