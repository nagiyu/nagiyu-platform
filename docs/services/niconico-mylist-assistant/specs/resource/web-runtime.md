---
sources:
  - infra/niconico-mylist-assistant/lib/lambda-stack.ts
  - infra/niconico-mylist-assistant/lib/policies/web-runtime-policy.ts
  - infra/niconico-mylist-assistant/bin/niconico-mylist-assistant.ts
  - infra/common/src/functions/ecr-image-function.ts
  - infra/common/src/constants/defaults.ts
  - infra/common/src/grants/error-events-writer.ts
sources_hash: 556ccb3ec0fd6c78397d834206b683bd2547f742202ab54a37ef4cc4192e4d0f
---

# Web の実行環境

Next.js の Web を動かす Lambda 関数と、その実行ロール・ロググループ。関数は ECR のイメージから作り、Function URL で公開する。

## リソース

| 名前 | 種類 | 用途 |
|---|---|---|
| `nagiyu-niconico-mylist-assistant-web-{env}` | Lambda 関数 (ECR イメージ) | Web 本体 |
| Function URL | Lambda の Function URL | 関数の公開の入口 |
| `nagiyu-niconico-mylist-assistant-web-execution-role-{env}` | IAM ロール | 関数の実行ロール |
| `niconico-mylist-assistant-web-runtime-{env}` | IAM マネージドポリシー | 実行ロールが持つ業務の権限 |
| `/aws/lambda/nagiyu-niconico-mylist-assistant-web-{env}` | CloudWatch Logs のロググループ | 関数のログ |

`{env}` は `dev` か `prod`。

## 設定値

| 項目 | 値 |
|---|---|
| メモリ | 1,024 MB |
| タイムアウト | 30 秒 |
| アーキテクチャ | X86_64 |
| X-Ray トレーシング | 有効 |
| ログの保持期間 | 1 か月 |
| イメージのタグ | デプロイ時の環境変数 `IMAGE_TAG` で渡す。なければデプロイが失敗する |
| Function URL の認証 | なし |
| Function URL の CORS | すべてのオリジン・メソッド・ヘッダーを許可。プリフライトの結果を 86,400 秒保持する |

- タグは `Application` が `nagiyu`、`Service` が `niconico-mylist-assistant`、`Environment` が環境名

## 環境変数

| 名前 | 意味 | 値の出どころ |
|---|---|---|
| `NODE_ENV` | 実行環境の名前 | 環境名 (`dev` / `prod`) |
| `NAGIYU_ENV` | ログイン用クッキーのドメインの判定に使う環境名 | 環境名 |
| `APP_VERSION` | 死活確認 API が返すバージョン | デプロイ時の環境変数 `APP_VERSION`。なければ `1.0.0` |
| `DYNAMODB_TABLE_NAME` | [単一テーブル](../data/main-table.md)の名前 | テーブルの名前 |
| `AUTH_URL`、`NEXT_PUBLIC_AUTH_URL` | Auth サービスの URL | 環境ごとの Auth サービスの URL |
| `APP_URL` | このサービスの URL | 環境ごとのこのサービスの URL |
| `AUTH_SECRET` | ログインのセッションの署名に使う値 | Auth サービスのシークレット。デプロイ時に Secrets Manager から取り出して渡す |
| `BATCH_JOB_QUEUE` | ジョブを投入するキューの ARN | [バッチの実行環境](./batch-runtime.md)のジョブキュー |
| `BATCH_JOB_DEFINITION` | ジョブ定義の ARN (リビジョンなし) | [バッチの実行環境](./batch-runtime.md)のジョブ定義 |
| `ENCRYPTION_SECRET_NAME` | セッションの暗号化キーのシークレット名 | [シークレット](./secrets.md)の暗号化キー |
| `AWS_REGION_FOR_SDK` | AWS SDK のリージョン | スタックのリージョン |
| `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY` | Web Push の署名キー | [シークレット](./secrets.md)の VAPID キー。デプロイ時に取り出して渡す |
| `ERROR_EVENTS_TABLE_NAME` | エラー履歴の書き込み先 | `nagiyu-error-events-{env}` |

## 権限

実行ロールは、次の 3 つを持つ。

| 権限 | 対象 | 内容 |
|---|---|---|
| AWS 管理ポリシー `AWSLambdaBasicExecutionRole` | ロググループ | ログの書き込み |
| エラー履歴の書き込み | `nagiyu-error-events-{env}` テーブル | `dynamodb:PutItem` |
| マネージドポリシー `niconico-mylist-assistant-web-runtime-{env}` | 下の表 | 業務の権限 |

| 対象 | 許可する操作 |
|---|---|
| 単一テーブルとそのインデックス | `Query`、`GetItem`、`PutItem`、`UpdateItem`、`DeleteItem`、`Scan`、`BatchGetItem`、`BatchWriteItem` |
| AWS Batch のジョブキューとジョブ定義 | `batch:SubmitJob`。ジョブ定義は、リビジョンなしの ARN と、リビジョン付き (`:*`) の両方 |
| 暗号化キーと VAPID キーのシークレット | `secretsmanager:GetSecretValue` |

- VAPID キーのシークレットの読み取りを許可しているが、Web は VAPID キーを環境変数から読む

## 理由

- `NAGIYU_ENV` を別に持つのは、`NODE_ENV` が Next.js のビルド時に `production` へ置き換えられ、デプロイしたあとの dev と prod の判定に使えないため
- ジョブ定義の ARN を、リビジョンなしと `:*` の両方で許可するのは、`SubmitJob` にリビジョンなしの ARN を渡すと IAM もその ARN で判定し、リビジョン付きの ARN を渡すと `name:N` の形で判定するため
- ジョブキューとジョブ定義の ARN は、命名規則から組み立てて渡し、CloudFormation の出力の参照 (Export / Import) に頼らない。ジョブ定義を更新するとリビジョンが変わり、Export の値が変わると CloudFormation が更新を拒むため
- ロググループは新しく作らず、CloudFormation の管理外にある同名のものを引き継ぎ、保持期間だけを設定する。同名のロググループを作ると名前が衝突してデプロイが失敗するため。この指定は既存の関数だけが使う
- マネージドポリシーの説明文は変えない。変えるとポリシーが置き換えになり、固定の名前が衝突してデプロイが失敗するため
