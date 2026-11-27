---
sources:
  - infra/share-together/lib/lambda-stack.ts
  - infra/share-together/lib/policies/web-runtime-policy.ts
  - infra/share-together/bin/share-together.ts
sources_hash: 6a47a555a89dbac4a26be29534f3ac38e8233a6c3ed712be62f0b0758296e993
---

# Web の実行環境

Next.js の Web を動かす Lambda 関数と、その実行ロール・管理ポリシー・ロググループ。関数は ECR のイメージから作り、Function URL で公開する。

## リソース

| 名前 | 種類 | 用途 |
|---|---|---|
| `nagiyu-share-together-lambda-{env}` | Lambda 関数 (ECR イメージ) | Web 本体 |
| Function URL | Lambda の Function URL | 関数の公開の入口。前段の CloudFront から呼ばれる ([デプロイ先](../deploy.md)) |
| 実行ロール (名前は CDK が決める) | IAM ロール | 関数の実行ロール |
| `share-together-web-runtime-{env}` | IAM の管理ポリシー | Web が使う DynamoDB の権限。実行ロールに付ける。ARN はスタックの出力 `WebRuntimePolicyArn` |
| `/aws/lambda/nagiyu-share-together-lambda-{env}` | CloudWatch Logs のロググループ | 関数のログ |

`{env}` は `dev` か `prod`。スタックは `NagiyuShareTogetherLambda{Env}`。名前と、実行ロールの構成は [Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)のとおり。

## 設定値

| 項目 | 値 |
|---|---|
| メモリ | 1024 MB |
| タイムアウト | 30 秒 |
| Function URL の認証 | AWS_IAM。直接呼ぶと 403 になる |
| Function URL の CORS | すべてのオリジン・メソッド・ヘッダーを許可 |

- タイムアウト・Function URL の認証と CORS は、[Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)の既定値と同じ。メモリだけが既定 (512 MB) と違う。表にない項目 (アーキテクチャ、X-Ray、ログの保持期間、イメージのタグ、タグ、CloudFront からの呼び出しの許可) も既定値のまま
- ロググループは新しく作らず、既存のものを引き継ぐ (`adoptExistingLogGroup`。[Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)の「ロググループ」)

## 環境変数

| 名前 | 意味 | 値の出どころ |
|---|---|---|
| `NODE_ENV` | 実行環境の名前 | 環境名 (`dev` / `prod`) |
| `NAGIYU_ENV` | ログイン用 Cookie のドメインの判定に使う環境名 | 環境名 |
| `APP_VERSION` | 死活確認 API とフッターが出すバージョン | デプロイ時の環境変数 `APP_VERSION`、なければ CDK の context `appVersion`、なければ `0.0.0` |
| `DYNAMODB_TABLE_NAME` | [Share Together のテーブル](../data/main-table.md)の名前 | `nagiyu-share-together-main-{env}` |
| `ERROR_EVENTS_TABLE_NAME` | エラー履歴の書き込みの対象 | `nagiyu-error-events-{env}` |
| `AUTH_SECRET` | ログインの JWT を検証する鍵 | CDK の context `nextAuthSecret`。なければ仮の値 `PLACEHOLDER` |
| `AUTH_URL` | Auth の URL | 環境ごとの Auth の URL |
| `NEXT_PUBLIC_AUTH_URL` | ログインのリダイレクト先の Auth の URL | 環境ごとの Auth の URL |
| `APP_URL` | このサービスの公開 URL | 環境ごとのこのサービスの URL ([デプロイ先](../deploy.md)のホスト名) |

- `AUTH_SECRET` は Auth が作るシークレットを読むだけで、Share Together では作らない ([Auth のシークレット](../../../auth/specs/resource/secrets.md)、[認証の規約](../../../../platform/rules/authentication.md))。デプロイのワークフロー (`.github/workflows/share-together-deploy.yml`) が Secrets Manager の `nagiyu-auth-nextauth-secret-{env}` を読み、CDK の context `nextAuthSecret` で渡す。実行中に Secrets Manager は読まない
- `APP_VERSION` は CDK が必ず値を入れるので、画面と死活確認 API が持つ既定の `1.0.0` は使われない。ワークフローが渡さずに手でデプロイすると `0.0.0` になる

## 権限

実行ロールの権限のうち、共通部品の既定で付くもの (ログの書き込み、X-Ray など) は[Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)に従う。Share Together が足すのは次の 2 つ。

| 権限 | 対象 | 内容 |
|---|---|---|
| テーブルの操作 (管理ポリシー `share-together-web-runtime-{env}`) | [Share Together のテーブル](../data/main-table.md)とそのインデックス | `Query`、`GetItem`、`PutItem`、`UpdateItem`、`DeleteItem`、`Scan`、`BatchGetItem`、`BatchWriteItem` |
| エラー履歴の書き込み | [エラーイベントのテーブル](../../../../platform/specs/data/error-events.md) | `PutItem` |

- エラー履歴の `PutItem` は、Web が自分の 500 を Admin へ報告するために持つ。読み取りはしない
- Secrets Manager を読む権限は持たない。シークレットの値は、デプロイのときに環境変数へ入る

## 理由

- `NAGIYU_ENV` を別に持つのは、`NODE_ENV` が Next.js のビルド時に `production` へ置き換えられ、デプロイしたあとの dev と prod の判定に使えないため
- テーブルの権限を管理ポリシーに切り出しているのは、Lambda の実行ロールと開発者が同じ権限を使えるようにするため
- 管理ポリシーの Description を変えない。固定名のポリシーは Description を変えると置き換えになり、名前が衝突してデプロイが失敗する
- ロググループを引き継ぐのは、CloudFormation の管理外に同名のロググループがすでにあり、作ると名前が衝突するため。新しい関数では使わない
