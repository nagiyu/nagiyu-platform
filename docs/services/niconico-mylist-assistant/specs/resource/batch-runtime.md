---
sources:
  - infra/niconico-mylist-assistant/lib/batch-stack.ts
  - infra/niconico-mylist-assistant/lib/policies/batch-runtime-policy.ts
  - infra/niconico-mylist-assistant/lib/s3-stack.ts
  - services/niconico-mylist-assistant/batch/Dockerfile
  - services/niconico-mylist-assistant/batch/package.json
  - services/niconico-mylist-assistant/batch/src/lib/job-environment.ts
sources_hash: bc6eda30e5b27e0183a39558e2c58e3f24b875df20bfa7462719b1963f2498f4
---

# バッチの実行環境

マイリスト登録バッチを動かす AWS Batch (Fargate) の計算環境・ジョブキュー・ジョブ定義と、そのロール・ロググループ、失敗時のスクリーンショットを置く S3 バケット。

## リソース

| 名前 | 種類 | 用途 |
|---|---|---|
| `nagiyu-niconico-mylist-assistant-{env}` | AWS Batch の計算環境 (Fargate) | ジョブを動かす |
| `nagiyu-niconico-mylist-assistant-{env}` | AWS Batch のジョブキュー | [マイリスト登録 API](../api/mylist-register.md) がジョブを投入する先 |
| `nagiyu-niconico-mylist-assistant-{env}` | AWS Batch のジョブ定義 | コンテナのイメージ・資源・環境変数を決める |
| セキュリティグループ | EC2 のセキュリティグループ | ジョブのタスクに付ける。外向きの通信はすべて許可する |
| (自動で付く名前) | IAM ロール (タスク実行ロール) | イメージの取得とログの出力 |
| `nagiyu-niconico-mylist-assistant-batch-job-role-{env}` | IAM ロール (ジョブロール) | コンテナの中のコードが持つ権限 |
| `niconico-mylist-assistant-batch-runtime-{env}` | IAM マネージドポリシー | ジョブロールが持つ業務の権限 |
| `/aws/batch/nagiyu-niconico-mylist-assistant-{env}` | CloudWatch Logs のロググループ | ジョブのログ |
| `nagiyu-niconico-mylist-assistant-screenshots-{env}` | S3 バケット | 失敗した画面のスクリーンショット |

`{env}` は `dev` か `prod`。

## 設定値

| 項目 | 値 |
|---|---|
| 計算環境の最大 vCPU | 4 |
| 計算環境の置き場所 | 共有 VPC のパブリックサブネット |
| ジョブキューの優先度 | 1 (計算環境は 1 つ) |
| ジョブの vCPU | 1.0 |
| ジョブのメモリ | 2,048 MB |
| ジョブのパブリック IP | 付ける |
| ジョブのタイムアウト | 1,800 秒 (1 試行あたり) |
| ジョブの試行回数 | 1 (Batch は再試行しない) |
| コンテナのイメージ | バッチ用の ECR リポジトリの、デプロイ時の環境変数 `IMAGE_TAG` のタグ。なければデプロイが失敗する |
| ログの保持期間 | 1 週間 (ログのストリームの接頭辞は `batch`)。スタックを消すと一緒に消える |
| スクリーンショットの保持期間 | 7 日で自動で削除 |
| バケットの設定 | バージョニングなし。スタックを消してもバケットは残す。暗号化・パブリックアクセスの遮断・HTTPS の強制は[サービスの S3 バケット](../../../../platform/specs/resource/service-bucket.md)が固定する |

- イメージは Playwright の公式イメージ (jammy) を土台にし、Node だけ公式のバイナリの 26.13.0 に差し替えて、ビルドの中で sha256 を検証している。起動のコマンドは `node services/niconico-mylist-assistant/batch/dist/index.js`
- タグは `Application` が `nagiyu`、`Service` が `niconico-mylist-assistant`、`Environment` が環境名

## 環境変数

ジョブ定義が渡す値。投入のたびに変わる値 (利用者・動画・マイリスト名・セッション) は、[マイリスト登録 API](../api/mylist-register.md) が投入のときに渡す。

| 名前 | 意味 | 値の出どころ |
|---|---|---|
| `DYNAMODB_TABLE_NAME` | [単一テーブル](../data/main-table.md)の名前 | テーブルの名前 |
| `AWS_REGION` | リージョン | スタックのリージョン |
| `ENCRYPTION_SECRET_NAME` | セッションの暗号化キーのシークレット名。コードは旧名 `SHARED_SECRET_KEY` でも読む | [シークレット](./secrets.md)の暗号化キー |
| `VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY` | 完了通知の署名キー | [シークレット](./secrets.md)の VAPID キー。デプロイ時に取り出して渡す |
| `ERROR_EVENTS_TABLE_NAME` | エラー履歴の書き込み先 | `nagiyu-error-events-{env}` |
| `SCREENSHOT_BUCKET_NAME` | スクリーンショットを置く S3 バケット | 上のバケットの名前 |

## 権限

| ロール | 対象 | 許可する操作 |
|---|---|---|
| タスク実行ロール | AWS 管理ポリシー `AmazonECSTaskExecutionRolePolicy` | イメージの取得とログの出力に必要な操作 |
| タスク実行ロール | バッチ用の ECR リポジトリ | イメージの取得 |
| ジョブロール (マネージドポリシー) | 単一テーブルとそのインデックス | `Query`、`GetItem`、`PutItem`、`UpdateItem` (`DeleteItem` は許可しない) |
| ジョブロール (マネージドポリシー) | バッチのロググループ | `logs:CreateLogStream`、`logs:PutLogEvents` |
| ジョブロール (マネージドポリシー) | 暗号化キーと VAPID キーのシークレット | `secretsmanager:GetSecretValue` |
| ジョブロール (マネージドポリシー) | スクリーンショットのバケットの全オブジェクト | `s3:PutObject`、`s3:PutObjectAcl` |
| ジョブロール | [エラーイベントのテーブル](../../../../platform/specs/data/error-events.md) | `dynamodb:PutItem` (`grantErrorEventsWrite` が付ける) |

- VAPID キーのシークレットの読み取りを許可しているが、バッチは VAPID キーを環境変数から読む

## 理由

- 実行基盤に AWS Batch (Fargate) を使う。100 件を登録するには、動画の間に最低 2 秒の待ちを置くだけで最低 200 秒かかる。再試行やネットワークの遅延を含めると、Lambda の 15 分の上限では足りない。Batch は時間の上限が長く、Playwright をコンテナで動かせる
- ジョブの資源は 1 vCPU・2,048 MB にする。ヘッドレスの Chromium を動かし、最大 100 件の登録を完走するために要る量である。下げるときは、ブラウザが起動して登録を完走することを確かめる
- 計算環境の最大が 4 vCPU なのは、ジョブ 1 つが 1 vCPU を使うので、同時に動くジョブを最大 4 つにするため
- Playwright の版は、npm のパッケージ (`playwright` と `@playwright/test`) と、Docker イメージのタグで同じにする。ずれると、イメージの中にその版のブラウザの実行ファイルがなく、コンテナが起動に失敗する
- Node を差し替えるのは、Node のパッチの版を sha256 付きで固定し、Node の版の検査が読める `ARG NODE_VERSION` で版を持つため。公式イメージの `FROM` からは、検査が版を読めない
- スクリーンショットは、失敗の原因を追うための一時的なデバッグ用なので、7 日で消す
- マネージドポリシーの説明文は変えない。変えるとポリシーが置き換えになり、固定の名前が衝突してデプロイが失敗するため

## 手順

### Playwright の版を上げる

1. `services/niconico-mylist-assistant/batch/package.json` の `playwright` と `@playwright/test` を、同じ新しい版にする
2. `services/niconico-mylist-assistant/batch/Dockerfile` の `FROM` のイメージのタグ (`mcr.microsoft.com/playwright:v{版}-jammy`) を、同じ版にする
3. 1 と 2 は同時に行い、1 つの変更に含める。片方だけを更新しない
