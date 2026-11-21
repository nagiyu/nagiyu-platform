---
sources:
  - infra/quick-clip/bin/quick-clip.ts
  - infra/quick-clip/lib/cloudfront-stack.ts
  - infra/quick-clip/lib/ecr-stack.ts
  - infra/quick-clip/lib/lambda-stack.ts
  - infra/quick-clip/lib/monitoring-stack.ts
  - .github/workflows/quick-clip-deploy.yml
sources_hash: cbbca4acff2b0106ec50427ee2f25f6420f9578a8829f10915c8577a636a8647
---

# QuickClip のデプロイ先

QuickClip の Web は Lambda (コンテナイメージ) の Function URL を CloudFront の背後に置いて公開する。動画の切り出しなど重い処理は AWS Batch と、専用の Lambda 2 本が受け持つ。

## ホスト名

| 環境 | ホスト名 |
|---|---|
| dev | `quick-clip.dev.nagiyu.com` |
| prod | `quick-clip.nagiyu.com` |

ホスト名は共通の組み立て関数 (`getCloudFrontDomainName('quick-clip', environment)`) で決まり、`infra/quick-clip/lib/cloudfront-stack.ts` が CloudFront に渡す。DNS レコードは共通のしくみに従い、このサービス固有の作り方はない。[デプロイ先 (platform)](../../../platform/specs/deploy.md) を参照する。

## スタック

`infra/quick-clip/bin/quick-clip.ts` が、次の順に作る。`{Env}` は `Dev` / `Prod` で、環境は CDK の context `env` (既定は `dev`) で決まる。CloudFront 以外は `us-east-1` を既定のリージョンにする。CloudFront は `us-east-1` に固定し、Lambda の Function URL をリージョンをまたいで参照する。

| 順 | スタック | 役割 | 含む主なリソース |
|---|---|---|---|
| 1 | `NagiyuQuickClipSecrets{Env}` | API キーの入れ物 | Secrets Manager (OpenAI の API キー) |
| 2 | `NagiyuQuickClipStorage{Env}` | ファイルの保存先 | S3 バケット |
| 3 | `NagiyuQuickClipDynamoDB{Env}` | ジョブの保存先 | ジョブテーブル |
| 4 | `NagiyuQuickClipECR{Env}` | イメージの置き場 | ECR リポジトリ 4 つ (Web、Batch、clip 用 Lambda、zip 用 Lambda) |
| 5 | `NagiyuQuickClipBatch{Env}` | 動画処理の実行 | Batch のコンピューティング環境・ジョブキュー・ジョブ定義 (small / large / xlarge)、ログ、IAM ロール。Storage・DynamoDB・ECR に依存する |
| 6 | `NagiyuQuickClipMonitoring{Env}` | Batch の失敗の通知 | Batch のジョブ失敗を検知する EventBridge ルール。admin が持つ集約 SNS トピックへ転送する。Batch に依存する |
| 7 | `NagiyuQuickClipLambda{Env}` | アプリの実行 | Web の Lambda、clip 再生成の Lambda、zip 生成の Lambda、Web の Function URL。ECR・Storage・DynamoDB・Secrets に依存する |
| 8 | `NagiyuQuickClipCloudFront{Env}` | 公開の入口と DNS | CloudFront ディストリビューション (オリジンは Web の Function URL)、接続元 IP をヘッダーに載せる CloudFront Function。Lambda に依存する |

Batch の ARN は命名規則から組み立てて Lambda と Monitoring に渡す。スタック間の Export / Import を作らないのは、ジョブ定義のリビジョンが変わったときに Export の値が変わり、CloudFormation が更新を拒否するためである。

## デプロイの流れ

`.github/workflows/quick-clip-deploy.yml` が行う。

| 項目 | 内容 |
|---|---|
| トリガー | develop・`integration/**`・master への push (サービス・infra・libs・configs などのパスが変わったとき)。手動実行 (dev / prod を選ぶ) |
| デプロイ先の環境 | 手動実行は入力値。master への push は prod。それ以外は dev |
| 並行実行 | 環境ごとに直列化する。実行中の run は止めず、待機中は最新だけ残す |
| イメージのタグ | コミットの SHA |

```mermaid
flowchart TD
    A[infrastructure-ecr<br/>ECR / Secrets] --> B[build-web]
    A --> C[build-batch]
    A --> D[build-lambda-clip]
    A --> E[build-lambda-zip]
    B --> F[infrastructure-app<br/>Storage / DynamoDB / Batch / Monitoring / Lambda / CloudFront]
    C --> F
    D --> F
    E --> F
    F --> G[verify<br/>Function URL のヘルスチェック]
```

| ジョブ | 内容 |
|---|---|
| `infrastructure-ecr` | ECR と Secrets のスタックをデプロイする。Secrets は次のジョブ以降で値を取り出すため先に作る |
| `build-web` `build-batch` `build-lambda-clip` `build-lambda-zip` | それぞれのイメージをビルドして対応する ECR リポジトリに push する (並行) |
| `infrastructure-app` | Secrets Manager から OpenAI の API キーと Auth の署名鍵を取り出し、Storage・DynamoDB・Batch・Monitoring・Lambda・CloudFront を 1 回の CDK のデプロイで作る |
| `verify` | Lambda のスタックの出力から Function URL を取り出して `/api/health` のヘルスチェックを行う。CloudFront 経由のヘルスチェックはしない |
