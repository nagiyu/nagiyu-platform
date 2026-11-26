---
sources:
  - infra/codec-converter/bin/codec-converter.ts
  - infra/codec-converter/lib/codec-converter-stack.ts
  - infra/codec-converter/lib/ecr-stacks.ts
  - infra/codec-converter/lib/policies/app-runtime-policy.ts
  - infra/codec-converter/lib/roles/lambda-execution-role.ts
  - infra/common/src/constants/defaults.ts
  - infra/common/src/grants/cloudfront-invoke.ts
  - infra/common/src/grants/error-events-writer.ts
  - infra/common/src/utils/image-tag.ts
  - infra/common/src/utils/naming.ts
sources_hash: 80966edce02646c0e4e485fd50965fb17890f84b137c09a92d02ec6f9353aedb
---

# Web の実行環境

Next.js の Web (画面と [ジョブ API](../api/jobs.md)) を動かす Lambda 関数と、その実行ロール・ロググループ。関数は ECR のイメージから作り、Function URL で公開する。

## リソース

| 名前 | 種類 | 用途 |
|---|---|---|
| `nagiyu-codec-converter-{env}` | Lambda 関数 (ECR イメージ) | Web 本体 |
| Function URL | Lambda の Function URL | 関数の公開の入口。前段の CloudFront から呼ばれる ([デプロイ先](../deploy.md)) |
| 実行ロール (名前は CDK が決める) | IAM ロール | 関数の実行ロール |
| `codec-converter-app-runtime-{env}` | IAM マネージドポリシー (`AppRuntimePolicy`) | 実行ロールに付ける、アプリの権限 |
| `/aws/lambda/nagiyu-codec-converter-{env}` | CloudWatch Logs のロググループ | 関数のログ |

`{env}` は `dev` か `prod`。スタックは `NagiyuCodecConverter{Env}` で、[Batch の実行環境](./batch-runtime.md)や[ストレージ](./storage.md)と同じスタックにある。

このスタックは、共通の Lambda 部品 ([Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)の `createEcrImageFunction` と `LambdaStackBase`) を使わず、`DockerImageFunction` を直接作る。そのため、共通部品の既定値は適用されない。値はすべて下の表のとおり。

## 設定値

| 項目 | 値 |
|---|---|
| イメージ | Web 用の ECR リポジトリ (`nagiyu-codec-converter-ecr-{env}`) の、環境変数 `IMAGE_TAG` のタグ。`IMAGE_TAG` がないか空なら、合成が失敗する |
| メモリ | 1,024 MB |
| タイムアウト | 30 秒 |
| アーキテクチャ | 指定しない (Lambda の既定の x86_64) |
| X-Ray トレーシング | 有効 (`ACTIVE`) |
| ログの保持期間 | 1 か月 |
| ロググループの削除ポリシー | 削除する |
| Function URL の認証 | AWS_IAM。直接呼ぶと 403 になる |
| Function URL の CORS | すべてのオリジン・メソッド・ヘッダーを許可。プリフライトの結果は 1 時間キャッシュする (`maxAge`) |

- ロググループは、このスタックが `/aws/lambda/nagiyu-codec-converter-{env}` を明示的に作る。既存のロググループを引き継ぐことはしない
- ECR リポジトリは別のスタックが作る。このスタックは名前から参照するだけで、スタック間の Export / Import は作らない ([デプロイ先](../deploy.md)の「スタック」)
- 実行ロールは、このスタックが自分で作る (`lambda.amazonaws.com` が引き受ける)。AWS 管理ポリシー `AWSLambdaBasicExecutionRole` (ログの書き込み) と、`AppRuntimePolicy` を付ける
- 関数のタグは付けない

### CloudFront からの呼び出しの許可

関数に、`cloudfront.amazonaws.com` が次の 2 つを呼ぶ許可を付ける (共通部品の `grantCloudFrontInvoke`)。Function URL の認証が AWS_IAM なので、この許可がないと 403 になる。

| 操作 | 条件 |
|---|---|
| `lambda:InvokeFunctionUrl` | 認証が AWS_IAM の Function URL |
| `lambda:InvokeFunction` | Function URL 経由に限る |

許可する呼び出し元は、このスタックの CloudFront ディストリビューションに絞る (ディストリビューションの ARN を `sourceArn` に渡す)。前段の設定は[デプロイ先](../deploy.md)の「スタック」にある。

## 環境変数

| 名前 | 意味 | 値の出どころ |
|---|---|---|
| `APP_VERSION` | 死活確認 API ([システム系の API](../api/system.md)) と画面が出すバージョン | デプロイ時の環境変数 `APP_VERSION`。なければ `1.0.0`。デプロイのワークフローは、Web の `package.json` の `version` を渡す |
| `DYNAMODB_TABLE_NAME` | [ジョブのテーブル](../data/jobs.md)の名前 | `nagiyu-codec-converter-jobs-{env}` |
| `S3_BUCKET` | [ストレージ](./storage.md)のバケット名 | `nagiyu-codec-converter-storage-{env}` |
| `BATCH_JOB_QUEUE` | 変換を投入する Batch のジョブキューの名前 | `nagiyu-codec-converter-{env}` |
| `BATCH_JOB_DEFINITION_PREFIX` | ジョブ定義の名前のプレフィックス。`-{サイズ}` を付けて使う ([ジョブ定義のサイズ](../term/job-definition-size.md)) | `nagiyu-codec-converter-{env}` |
| `ERROR_EVENTS_TABLE_NAME` | エラー履歴の書き込み先 | `nagiyu-error-events-{env}` |

- `AWS_REGION` は Lambda の実行環境が設定する。このスタックは設定しない
- `NODE_ENV` は設定しない

## 権限

実行ロールが持つ権限。

| ロール | 対象 | 許可する操作 |
|---|---|---|
| 実行ロール | CloudWatch Logs | ログの書き込み (AWS 管理ポリシー `AWSLambdaBasicExecutionRole`) |
| 実行ロール (`AppRuntimePolicy`) | [ストレージ](./storage.md)のバケットと、その中のオブジェクト | `s3:GetObject`、`s3:PutObject`、`s3:DeleteObject`、`s3:ListBucket` |
| 実行ロール (`AppRuntimePolicy`) | [ジョブのテーブル](../data/jobs.md) | `GetItem`、`PutItem`、`UpdateItem`、`DeleteItem`、`Query`、`Scan` |
| 実行ロール (`AppRuntimePolicy`) | [Batch のジョブキュー](./batch-runtime.md)と、名前が `nagiyu-codec-converter-{env}-` で始まるジョブ定義 (版つきを含む) | `batch:SubmitJob` |
| 実行ロール (`AppRuntimePolicy`) | すべてのリソース (ジョブの ARN が事前に決まらないため) | `batch:DescribeJobs`、`batch:TerminateJob` |
| 実行ロール | [エラーイベントのテーブル](../../../../platform/specs/data/error-events.md) | `dynamodb:PutItem` (共通部品の `grantErrorEventsWrite`) |

- エラー履歴の `PutItem` は、Web が自分の 500 を報告するために持つ ([エラー報告の経路](../flow/error-reporting.md))
- Secrets Manager を読む権限は持たない

## 理由

- `AppRuntimePolicy` は、固定の名前 (`codec-converter-app-runtime-{env}`) を付けたマネージドポリシーにする。説明文を変えるとポリシーが置き換わり、固定の名前が衝突してデプロイが失敗するので、説明文は据え置く
