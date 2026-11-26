---
sources:
  - infra/admin/lib/lambda-stack.ts
  - infra/admin/lib/self-monitoring-topic.ts
  - infra/admin/bin/admin.ts
sources_hash: e714e4891a8bfd864a15efe3a9104607a6fe30d23ac87b99d4a8cd423fc53c5e
---

# Web の実行環境

Next.js の Web を動かす Lambda 関数と、その実行ロール・ロググループ。関数は ECR のイメージから作り、Function URL で公開する。

## リソース

| 名前 | 種類 | 用途 |
|---|---|---|
| `nagiyu-admin-lambda-{env}` | Lambda 関数 (ECR イメージ) | Web 本体 |
| Function URL | Lambda の Function URL | 関数の公開の入口。前段の CloudFront から呼ばれる ([デプロイ先](../deploy.md)) |
| 実行ロール (名前は CDK が決める) | IAM ロール | 関数の実行ロール |
| `/aws/lambda/nagiyu-admin-lambda-{env}` | CloudWatch Logs のロググループ | 関数のログ |

`{env}` は `dev` か `prod`。スタックは `NagiyuAdminLambda{Env}`。名前と、実行ロールの構成は [Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)のとおり。

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
| `NAGIYU_ENV` | ログイン用 Cookie のドメインの判定に使う環境名 | 環境名 |
| `APP_VERSION` | 死活確認 API が返すバージョン | デプロイ時の環境変数 `APP_VERSION`。なければ `1.0.0` |
| `DYNAMODB_TABLE_NAME` | [Admin のテーブル](../data/main-table.md)の名前 | `nagiyu-admin-main-{env}` |
| `ERROR_EVENTS_TABLE_NAME` | エラー履歴の読み取りと書き込みの対象 | `nagiyu-error-events-{env}` |
| `AUTH_SECRET` | ログインの JWT を検証する鍵 | CDK の context `nextAuthSecret`。なければ仮の値 `PLACEHOLDER` |
| `APP_URL` | このサービスの公開 URL | 環境ごとのこのサービスの URL ([デプロイ先](../deploy.md)のホスト名) |
| `NEXT_PUBLIC_AUTH_URL` | ログインのリダイレクト先の Auth の URL | 環境ごとの Auth の URL |
| `VAPID_PUBLIC_KEY` | Web Push の公開鍵 | CDK の context `vapidPublicKey`。なければ仮の値 `PLACEHOLDER` |
| `VAPID_PRIVATE_KEY` | Web Push の秘密鍵 | CDK の context `vapidPrivateKey`。なければ仮の値 `PLACEHOLDER` |
| `SNS_ALLOWED_TOPIC_ARN` | SNS からの通知を受け付けるトピックの ARN | [自己監視のトピック](./self-monitoring.md)の ARN |

- `AUTH_SECRET` は Auth が作るシークレットを読むだけで、Admin では作らない ([Auth のシークレット](../../../auth/specs/resource/secrets.md)、[認証の規約](../../../../platform/rules/authentication.md))。デプロイのワークフローが Secrets Manager から読み、CDK の context で渡す。実行中に Secrets Manager は読まない
- VAPID 鍵の値の出どころと、変えたときの反映は[シークレット](./secrets.md)にある
- `SNS_ALLOWED_TOPIC_ARN` に載るトピックだけが、`/api/notify/sns` の受け付け対象になる。挙動は [SNS 通知の受け付け API](../api/notify-sns.md)にある

## 権限

実行ロールの権限のうち、共通部品の既定で付くもの (ログの書き込み、X-Ray など) は[Lambda 関数の共通部品](../../../../platform/specs/resource/lambda-function.md)に従う。Admin が足すのは次の 2 つ。

| 権限 | 対象 | 内容 |
|---|---|---|
| Admin のテーブルの操作 | [Admin のテーブル](../data/main-table.md)とそのインデックス | `PutItem`、`GetItem`、`Scan`、`DeleteItem`、`Query` |
| エラー履歴の読み取りと書き込み | [エラーイベントのテーブル](../../../../platform/specs/data/error-events.md)とそのインデックス | `GetItem`、`Query`、`PutItem` |

- エラー履歴の `PutItem` は、Web が自分の 500 を報告するために持つ。読み取りは、エラーの一覧と詳細の表示に使う
- Secrets Manager を読む権限は持たない。シークレットの値は、デプロイのときに環境変数へ入る

## 理由

- `NAGIYU_ENV` を別に持つのは、`NODE_ENV` が Next.js のビルド時に `production` へ置き換えられ、デプロイしたあとの dev と prod の判定に使えないため
- `/api/notify/sns` の受け付けを環境変数のトピックに絞るのは、SNS の署名が正しくても、送信元のトピックは誰でも作れるため。署名だけで受けると、第三者が自分のトピックから Push を出せる
