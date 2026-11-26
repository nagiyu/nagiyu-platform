---
sources:
  - infra/tools/lib/lambda-stack.ts
  - infra/tools/bin/tools.ts
  - services/tools/public/ads.txt
sources_hash: 0eaf1776c760a138098deeecbd38719dbc03b8558e310e0d397718a6eb8ad177
---

# Web の実行環境

Next.js の Web を動かす Lambda 関数と、その実行ロール・ロググループ。関数は ECR のイメージから作り、Function URL で公開する。データベースとシークレットは持たない。

## リソース

| 名前 | 種類 | 用途 |
|---|---|---|
| `nagiyu-tools-lambda-{env}` | Lambda 関数 (ECR イメージ) | Web 本体 |
| Function URL | Lambda の Function URL | 関数の公開の入口。前段の CloudFront から呼ばれる ([デプロイ先](../deploy.md)) |
| 実行ロール (名前は CDK が決める) | IAM ロール | 関数の実行ロール |
| `/aws/lambda/nagiyu-tools-lambda-{env}` | CloudWatch Logs のロググループ | 関数のログ |

`{env}` は `dev` か `prod`。スタックは `NagiyuToolsLambda{Env}`。名前と、実行ロールの構成は [Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)のとおり。

## 設定値

| 項目 | 値 |
|---|---|
| メモリ | 1,024 MB (既定値は 512 MB) |
| タイムアウト | 30 秒 |
| Function URL の認証 | AWS_IAM。直接呼ぶと 403 になる |
| Function URL の CORS | すべてのオリジン・メソッド・ヘッダーを許可 |

- タイムアウト・Function URL の認証と CORS は、[Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)の既定値と同じ。メモリだけが既定値と違う。表にない項目 (アーキテクチャ、X-Ray、ログの保持期間、イメージのタグ、タグ、CloudFront からの呼び出しの許可) も既定値のまま
- ロググループは新しく作らず、既存のものを引き継ぐ (`adoptExistingLogGroup`。[Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)の「ロググループ」)

## 環境変数

| 名前 | 意味 | 値の出どころ |
|---|---|---|
| `NODE_ENV` | 実行環境の名前 | 環境名 (`dev` / `prod`) |
| `APP_VERSION` | 死活確認 API ([システム系の API](../api/system.md)) と、画面のフッターが出すバージョン | デプロイ時の環境変数 `APP_VERSION`。なければ `1.0.0` |

## 権限

実行ロールは、共通部品の既定で付くもの (ログの書き込みなど) だけを持つ。Tools が足す権限はない。

- DynamoDB や Secrets Manager を使うコードを持たないので、足す権限がない
- エラー履歴の書き込みも持たない。共通部品の `LambdaStackBase` が、使うサービスだけが足す形にしているため

## 広告の宣言ファイル

`/ads.txt` を、`services/tools/public/ads.txt` から配っている。広告のスクリプトは今は読み込んでおらず、広告は出していない。

## 理由

- ロググループを引き継ぐのは、CloudFormation の管理外に同名のロググループがすでにあり、スタックで作ると名前が衝突するため。この関数が既存だから付けているもので、新しい関数では付けない
