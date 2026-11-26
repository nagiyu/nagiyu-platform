---
sources:
  - infra/stock-tracker/lib/lambda-stack.ts
  - infra/stock-tracker/lib/policies/web-runtime-policy.ts
  - infra/stock-tracker/bin/stock-tracker.ts
  - services/stock-tracker/web/app/api/summaries/refresh/route.ts
---

# Web の実行環境

Next.js の Web を動かす Lambda 関数と、その実行ロール・マネージドポリシー。関数は ECR のイメージから作り、Function URL で公開する。

## リソース

| 名前 | 種類 | 用途 |
|---|---|---|
| `nagiyu-stock-tracker-web-{env}` | Lambda 関数 (ECR イメージ) | Web 本体 |
| Function URL | Lambda の Function URL | 関数の公開の入口。前段の CloudFront から呼ばれる ([デプロイ先](../deploy.md)) |
| `nagiyu-stock-tracker-web-execution-role-{env}` | IAM ロール | 関数の実行ロール |
| `stock-tracker-web-runtime-{env}` | IAM マネージドポリシー | 実行ロールの権限 (下の「権限」) |
| `/aws/lambda/nagiyu-stock-tracker-web-{env}` | CloudWatch Logs のロググループ | 関数のログ |

`{env}` は `dev` か `prod`。スタックは `NagiyuStockTrackerLambda{Env}`。名前と、実行ロールの構成は [Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)のとおり。

## 設定値

| 項目 | 値 |
|---|---|
| メモリ | 1024 MB |
| タイムアウト | 30 秒 |
| Function URL の認証 | AWS_IAM。直接呼ぶと 403 になる |
| Function URL の CORS | すべてのオリジン・メソッド・ヘッダーを許可。プリフライトの結果の保持は 86400 秒 |

- メモリは既定 (512 MB) から 1024 MB に上げている。タイムアウトと、表にない項目 (アーキテクチャ、X-Ray、ログの保持期間、イメージのタグ、CloudFront からの呼び出しの許可) は、[Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)の既定値のまま
- ロググループは新しく作らず、既存のものを引き継ぐ (`adoptExistingLogGroup`。[Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)の「ロググループ」)
- 実行ロールは、AWS 管理ポリシー `AWSLambdaBasicExecutionRole` と、`stock-tracker-web-runtime-{env}` を持つ
- 共通部品の既定どおり、エラー履歴への書き込みが有効で、`ERROR_EVENTS_TABLE_NAME` と `dynamodb:PutItem` ([エラーイベントのテーブル](../../../../platform/specs/data/error-events.md)) が付く

## 環境変数

| 名前 | 意味 | 値の出どころ |
|---|---|---|
| `NODE_ENV` | 実行環境の名前 | 環境名 (`dev` / `prod`) |
| `NAGIYU_ENV` | ログイン用 Cookie のドメインの判定に使う環境名 | 環境名 |
| `APP_VERSION` | 死活確認 API が返すバージョン | デプロイ時の環境変数 `APP_VERSION`。なければ `1.0.0` |
| `DYNAMODB_TABLE_NAME` | [メインのテーブル](../data/main-table.md)の名前 | `nagiyu-stock-tracker-main-{env}` |
| `VAPID_PUBLIC_KEY` | Web Push の公開鍵 | CDK の context `vapidPublicKey`。なければ仮の値 `PLACEHOLDER` |
| `VAPID_PRIVATE_KEY` | Web Push の秘密鍵 | CDK の context `vapidPrivateKey`。なければ仮の値 `PLACEHOLDER` |
| `AUTH_SECRET` | ログインの JWT を検証する鍵 | CDK の context `nextAuthSecret`。なければ仮の値 `PLACEHOLDER` |
| `AUTH_URL`、`NEXT_PUBLIC_AUTH_URL` | ログインのリダイレクト先の Auth の URL | 環境ごとの Auth の URL |
| `APP_URL` | このサービスの公開 URL | 環境ごとのこのサービスの URL ([デプロイ先](../deploy.md)のホスト名) |
| `STOCK_TRACKER_SUMMARY_BATCH_FUNCTION_NAME` | サマリーバッチを手動で起動するときの関数名 | `nagiyu-stock-tracker-batch-summary-{env}` |

- `AUTH_SECRET` は Auth が作るシークレットを読むだけで、Stock Tracker では作らない ([シークレット](./secrets.md)、[認証の規約](../../../../platform/rules/authentication.md))
- VAPID 鍵の値の出どころと、変えたときの反映は[シークレット](./secrets.md)にある。Finnhub の API キーは Web に渡さない
- 実行中に Secrets Manager は読まない

## 権限

実行ロールの権限のうち、共通部品の既定で付くもの (ログの書き込み、X-Ray、エラー履歴への書き込み) は[Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)に従う。マネージドポリシー `stock-tracker-web-runtime-{env}` が足すのは次の 2 つ。

| Sid | 対象 | 許可する操作 |
|---|---|---|
| `DynamoDBTableAccess` | [メインのテーブル](../data/main-table.md)とそのインデックス | `Query`、`GetItem`、`PutItem`、`UpdateItem`、`DeleteItem`、`Scan` |
| `InvokeSummaryBatchFunction` | サマリーバッチの関数 `nagiyu-stock-tracker-batch-summary-{env}` | `lambda:InvokeFunction` |

- `Scan` は、取引所とティッカーの一覧の取得に使う
- サマリーバッチを呼べるのは、サマリーの手動更新のため。呼び出しは非同期 (`InvocationType: Event`) で、Web は結果を待たない ([サマリー API](../api/summaries.md))
- サマリーバッチの関数は、このポリシーより後に同じスタックで作られる。関数の参照ではなく、固定名から組み立てた ARN を使う
- Secrets Manager を読む権限は持たない。シークレットの値は、デプロイのときに環境変数へ入る
