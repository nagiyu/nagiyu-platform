---
sources:
  - infra/quick-clip/lib/lambda-stack.ts
  - infra/quick-clip/bin/quick-clip.ts
  - services/quick-clip/lambda/clip/Dockerfile
  - services/quick-clip/lambda/zip/Dockerfile
  - services/quick-clip/web/src/app/api/jobs/[jobId]/highlights/[highlightId]/route.ts
  - services/quick-clip/web/src/app/api/jobs/[jobId]/highlights/[highlightId]/regenerate/route.ts
  - services/quick-clip/web/src/app/api/jobs/[jobId]/download/route.ts
sources_hash: 254a37d961443e7cc9317cda15e6ebd73a434ff828978ee61bcec26ac42e92d5
---

# ワーカーの実行環境

Web から非同期で起動する 2 つの Lambda 関数 (clip-regenerate と zip-generator) と、その実行ロール・ロググループ。関数はどちらも ECR のイメージから作る。Function URL は持たない。

## リソース

| 名前 | 種類 | 用途 |
|---|---|---|
| `nagiyu-quick-clip-clip-regenerate-{env}` | Lambda 関数 (ECR イメージ) | [clip-regenerate](../batch/clip-regenerate.md)。見どころのクリップを切り出し直す |
| `nagiyu-quick-clip-zip-generator-{env}` | Lambda 関数 (ECR イメージ) | [zip-generate](../batch/zip-generate.md)。採用したクリップを ZIP にする |
| 実行ロール 2 つ (名前は CDK が決める) | IAM ロール | 各関数の実行ロール |
| `/aws/lambda/nagiyu-quick-clip-clip-regenerate-{env}`、`/aws/lambda/nagiyu-quick-clip-zip-generator-{env}` | CloudWatch Logs のロググループ | 各関数のログ |
| `nagiyu-quick-clip-lambda-clip-ecr-{env}`、`nagiyu-quick-clip-lambda-zip-ecr-{env}` | ECR リポジトリ | 各関数のイメージの置き場。タグはコミットの SHA |

`{env}` は `dev` か `prod`。スタックは Web と同じ `NagiyuQuickClipLambda{Env}` ([デプロイ先](../deploy.md))。名前と、関数の既定値は [Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)のとおり。起動する側は[Web の実行環境](./web-runtime.md)で、どちらも Web が結果を待たない呼び出し (`Event`) で起動する。

## 設定値

| 項目 | clip-regenerate | zip-generator |
|---|---|---|
| メモリ | 2,048 MB | 1,024 MB |
| タイムアウト | 300 秒 | 120 秒 |
| 一時ストレージ (`/tmp`) | 10,240 MiB | 指定なし (既定) |
| 非同期呼び出しの再試行 | 0 回 | 指定なし (AWS の既定) |
| エラー履歴への書き込み | 既定のまま (有効) | 既定のまま (有効) |

- 表にない項目 (アーキテクチャ、X-Ray、ログの保持期間、イメージのタグ、DLQ なし) は、[Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)の既定値のまま。タグの `Service` は `quick-clip`
- ロググループは、どちらも新しく作らず、既存のものを引き継ぐ (`adoptExistingLogGroup`。[Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)の「ロググループ」)
- 実行ロールは渡さず、CDK が作る。ログの書き込みなどの権限は共通部品に従う
- clip-regenerate のイメージは、Lambda の Node.js 26 のベースイメージに、静的ビルドの FFmpeg 6.1.1 (ダイジェストで固定) を足したもの
- zip-generator のイメージは、Lambda の Node.js 26 のベースイメージだけ

## 環境変数

| 名前 | 意味 | clip-regenerate | zip-generator | 値の出どころ |
|---|---|---|---|---|
| `NODE_ENV` | 実行環境の名前 | あり | あり | `prod` なら `production`、`dev` なら `development` |
| `DEPLOY_ENV` | アプリの中で dev と prod を見分ける環境名 | あり | あり | 環境名 |
| `DYNAMODB_TABLE_NAME` | [ジョブのテーブル](../data/jobs-table.md)の名前 | あり | なし | `nagiyu-quick-clip-jobs-{env}` |
| `S3_BUCKET` | [ストレージ](./storage.md)のバケットの名前 | あり | あり | `nagiyu-quick-clip-storage-{env}` |
| `ERROR_EVENTS_TABLE_NAME` | エラー履歴の書き込み先 | あり | あり | `nagiyu-error-events-{env}` (共通部品が設定する) |

## 権限

実行ロールの権限のうち、共通部品の既定で付くもの (エラー履歴への `dynamodb:PutItem` など) は[Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)に従う。Quick Clip が足すのは次のとおり。

| ロール | 対象 | 許可する操作 |
|---|---|---|
| clip-regenerate | [ジョブのテーブル](../data/jobs-table.md)とそのインデックス | `GetItem`、`UpdateItem` |
| clip-regenerate | [ストレージ](./storage.md)のバケット | `s3:ListBucket` |
| clip-regenerate | [ストレージ](./storage.md)のバケットの全オブジェクト | `s3:GetObject`、`s3:PutObject` |
| zip-generator | [ストレージ](./storage.md)のバケット | `s3:ListBucket` |
| zip-generator | [ストレージ](./storage.md)のバケットの全オブジェクト | `s3:GetObject`、`s3:PutObject` |

- zip-generator は DynamoDB の権限を持たない。ジョブのテーブルに触れない
- どちらも `s3:DeleteObject` は持たない。前の ZIP を消すのは Web である ([Web の実行環境](./web-runtime.md))

## 理由

- clip-regenerate の非同期呼び出しの再試行を 0 回にする理由は、[見どころとクリップの状態](../term/highlight.md)の「理由」にある
