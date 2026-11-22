---
sources:
  - infra/common/src/functions/ecr-image-function.ts
  - infra/common/src/stacks/lambda-stack-base.ts
  - infra/common/src/constants/defaults.ts
  - infra/common/src/utils/image-tag.ts
  - infra/common/src/utils/naming.ts
  - infra/common/src/grants/error-events-writer.ts
sources_hash: 9e807ce3ae6dd14973bfcc80e1850fb59420f1f66a1cd0522bb69a816cf96fc9
---

# Lambda 関数の共通部品

ECR のイメージから Lambda 関数を作る共通部品。関数を作る `createEcrImageFunction` と、関数・実行ロール・Function URL を 1 つにまとめた `LambdaStackBase` がある。サービスの実行環境の文書は、ここの既定値を前提にして、差分だけを書く。

## 既定値

`createEcrImageFunction` が、呼び出し側の指定がなければ使う値。

| 項目 | 既定値 |
|---|---|
| ランタイム | イメージから取る |
| メモリ | 512 MB |
| タイムアウト | 30 秒 |
| アーキテクチャ | X86_64 |
| X-Ray トレーシング | 有効 (`ACTIVE`) |
| ログの保持期間 | 1 か月 |
| ロググループの削除ポリシー | 削除する |
| エラー履歴への書き込み (`enableErrorEvents`) | 有効 |
| 実行ロール | 渡さなければ CDK が作る |

- 予約済み同時実行数、`/tmp` のサイズ、非同期呼び出しの再試行回数、DLQ、`cmd` は、呼び出し側が指定したときだけ設定する
- タグは `Application` が `nagiyu`、`Service` が呼び出し側の指定、`Environment` が環境名

## イメージのタグ

イメージは、ECR のリポジトリと、環境変数 `IMAGE_TAG` のタグで指す。`IMAGE_TAG` がないか空なら、合成が失敗する。

## ロググループ

| 指定 | 作るもの |
|---|---|
| 通常 | `/aws/lambda/{関数名}` のロググループを CloudFormation のリソースとして作る |
| `adoptExistingLogGroup: true` | ロググループは作らず、既存のロググループの保持期間だけを設定する |

`adoptExistingLogGroup` は非推奨で、CloudFormation の管理外に同名のロググループがすでにある関数だけが使う。ロググループを作ると名前が衝突してデプロイが失敗する。新しい関数は使わない。

## エラー履歴

`enableErrorEvents` が有効なとき、次の 2 つを行う。

| 内容 | 値 |
|---|---|
| 環境変数 `ERROR_EVENTS_TABLE_NAME` | `nagiyu-error-events-{env}` |
| 実行ロールの権限 | `dynamodb:PutItem` ([テーブル](../data/error-events.md)) |

呼び出し側が環境変数 `ERROR_EVENTS_TABLE_NAME` を指定しても、この値が優先される。付与する権限の対象は環境ごとにテーブル 1 つに決まっていて、環境変数だけが別のテーブルを指すと、書き込みが権限エラーになるため。

## LambdaStackBase

`LambdaStackBase` は、関数を 1 つ持つスタックの基底。

| 項目 | 内容 |
|---|---|
| 関数名 | 指定がなければ `nagiyu-{サービス名}-lambda-{env}` |
| ECR リポジトリ | 指定がなければ `nagiyu-{サービス名}-ecr-{env}` |
| 実行ロール | `lambda.amazonaws.com` が引き受けるロール。AWS 管理ポリシー `AWSLambdaBasicExecutionRole` を持つ。名前と追加の権限は呼び出し側が渡せる |
| 関数の説明 | `{サービス名} Service Lambda function for {env} environment` |
| エラー履歴 (`enableErrorEvents`) | 無効。使うサービスが自分で足す |
| Function URL | 既定で作る。認証なし |
| Function URL の CORS | すべてのオリジン・メソッド・ヘッダーを許可 |
| Function URL の呼び出し権限 | 誰でも `lambda:InvokeFunctionUrl` できる (認証なしのため) |

- 出力は、関数の名前と ARN、実行ロールの ARN、Function URL
- メモリ・タイムアウト・アーキテクチャは、`lambdaConfig` で変える。環境変数と予約済み同時実行数も `lambdaConfig` で渡す
- CloudFormation の論理 ID の既定は `Function`。既存のスタックと合わせるときだけ変える

## 理由

- `createEcrImageFunction` は Construct で包まず、渡されたスコープに関数を直接作る。包むと、論理 ID にラッパーの ID が前置されて、既存スタックの関数とロールが置き換わる。名前を固定したリソースでは置き換えでデプロイが失敗する
- ロググループを明示的に作る。保持期間をそろえるため。保持期間は全サービス・全環境で同じにし、サービスごとに変えない。変えると、障害を調べるときに遡れる期間がサービスの間でずれる
- アーキテクチャの既定は X86_64。Lambda Web Adapter の標準のイメージは x86_64 のバイナリを含むため、ARM64 の関数で使うと拡張の起動が `exec format error` で失敗し、関数が 502 を返す
- `IMAGE_TAG` を必須にする。タグは 1 回のデプロイで全イメージ共通の値で、無指定を既定のタグに落とすと、渡し忘れたデプロイが古いイメージへ黙って戻る
- `LambdaStackBase` はエラー履歴を既定で付けない。使わないサービス (tools や Portal など) の権限と環境変数が増えるため
- Function URL は認証なしで、前段の CloudFront から呼ぶ。前段の設定は [CloudFront の共通部品](./cloudfront-distribution.md)にある
