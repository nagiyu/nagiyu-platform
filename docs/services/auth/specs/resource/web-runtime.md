---
sources:
  - infra/auth/lib/lambda-stack.ts
  - infra/auth/bin/auth.ts
sources_hash: a46c9f7e9ac2bcdf8bbd0f03ed06a59b755b791f4b693b469a8388f1d81e2f76
---

# Web の実行環境

Next.js の Web を動かす Lambda 関数と、その実行ロール・ロググループ。関数は ECR のイメージから作り、Function URL で公開する。

## リソース

| 名前 | 種類 | 用途 |
|---|---|---|
| `nagiyu-auth-lambda-{env}` | Lambda 関数 (ECR イメージ) | Web 本体 |
| Function URL | Lambda の Function URL | 関数の公開の入口 |
| 実行ロール (名前は CDK が決める) | IAM ロール | 関数の実行ロール |
| `/aws/lambda/nagiyu-auth-lambda-{env}` | CloudWatch Logs のロググループ | 関数のログ |

`{env}` は `dev` か `prod`。名前と、実行ロールの構成は [Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)のとおり。

## 設定値

| 項目 | 値 |
|---|---|
| メモリ | 512 MB |
| タイムアウト | 30 秒 |
| Function URL の認証 | AWS_IAM。直接呼ぶと 403 になる |
| Function URL の CORS | すべてのオリジン・メソッド・ヘッダーを許可 |

- メモリ・タイムアウト・Function URL の認証と CORS は、[Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)の既定値と同じ。表にない項目 (アーキテクチャ、X-Ray、ログの保持期間、イメージのタグ、タグ、CloudFront からの呼び出しの許可) も既定値のまま
- ロググループは新しく作らず、既存のものを引き継ぐ (`adoptExistingLogGroup`。[Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)の「ロググループ」)

## 環境変数

| 名前 | 意味 | 値の出どころ |
|---|---|---|
| `NODE_ENV` | 実行環境の名前 | 環境名 (`dev` / `prod`) |
| `NAGIYU_ENV` | ログイン用クッキーのドメインの判定に使う環境名 | 環境名 |
| `APP_VERSION` | 死活確認 API が返すバージョン | デプロイ時の環境変数 `APP_VERSION`。なければ `1.0.0` |
| `DYNAMODB_TABLE_NAME` | [ユーザーテーブル](../data/users.md)の名前 | `nagiyu-auth-users-{env}` |
| `AUTH_URL` | このサービスの URL (NextAuth のベース URL) | 環境ごとのこのサービスの URL ([デプロイ先](../deploy.md)のホスト名) |
| `AUTH_SECRET` | ログインのセッションの署名に使う値 | CDK の context `nextAuthSecret`。なければ仮の値 `PLACEHOLDER_NEXTAUTH_SECRET` |
| `AUTH_TRUST_HOST` | NextAuth がリクエストのホストを信頼する | 常に `true` |
| `GOOGLE_CLIENT_ID` | Google OAuth のクライアント ID | CDK の context `googleClientId`。なければ仮の値 `PLACEHOLDER_CLIENT_ID` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth のクライアントシークレット | CDK の context `googleClientSecret`。なければ仮の値 `PLACEHOLDER_CLIENT_SECRET` |
| `STRIPE_SECRET_KEY` | Stripe の秘密鍵 | CDK の context `stripeSecretKey`。なければ空 |
| `STRIPE_WEBHOOK_SECRET` | Stripe の通知の署名鍵 | CDK の context `stripeWebhookSecret`。なければ空 |
| `ERROR_EVENTS_TABLE_NAME` | エラー履歴の書き込み先 | `nagiyu-error-events-{env}` |

- `AUTH_SECRET`、Google と Stripe の値は、デプロイのワークフローが Secrets Manager から読み、CDK の context で渡す。実行中に Secrets Manager は読まない ([シークレット](./secrets.md))
- Stripe の値が空か `PLACEHOLDER_` で始まる間は、課金が無効になる ([シークレット](./secrets.md))
- `ERROR_EVENTS_TABLE_NAME` は、この関数が自分で設定する。共通部品の既定ではエラー履歴を付けないため

## 権限

実行ロールは、次の 3 つを持つ。

| 権限 | 対象 | 内容 |
|---|---|---|
| AWS 管理ポリシー `AWSLambdaBasicExecutionRole` | ロググループ | ログの書き込み |
| エラー履歴の書き込み | [エラーイベントのテーブル](../../../../platform/specs/data/error-events.md) | `dynamodb:PutItem` |
| ユーザーテーブルの操作 | [ユーザーテーブル](../data/users.md)とそのインデックス | `GetItem`、`PutItem`、`UpdateItem`、`DeleteItem`、`Query`、`Scan` |

- Secrets Manager を読む権限は持たない。シークレットの値は、デプロイのときに環境変数へ入る

## 理由

- `NAGIYU_ENV` を別に持つのは、`NODE_ENV` が Next.js のビルド時に `production` へ置き換えられ、デプロイしたあとの dev と prod の判定に使えないため。未設定のときは prod として扱う ([NextAuth の設定](../../../../platform/specs/lib/nextjs/auth-config.md))
