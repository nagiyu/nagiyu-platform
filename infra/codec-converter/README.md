# Codec Converter - Infrastructure

このディレクトリには、Codec Converter サービスのインフラストラクチャ定義が含まれています。

## 概要

`template.yaml` は CloudFormation のスケルトンテンプレートです。以下のリソースのプレースホルダが含まれています：

### リソース構成

| カテゴリ | リソース | 説明 |
|---------|---------|------|
| **ECR** | NextJsEcrRepository | Next.js アプリケーションコンテナイメージ用リポジトリ |
| | FfmpegEcrRepository | FFmpeg ワーカーコンテナイメージ用リポジトリ |
| **IAM** | LambdaExecutionRole | Lambda 関数実行ロール (S3/DynamoDB/Batch アクセス) |
| | BatchJobRole | Batch ジョブ実行ロール (S3/DynamoDB アクセス) |
| | BatchExecutionRole | Batch タスク実行ロール (ECR イメージ取得) |
| **S3** | StorageBucket | 動画ファイルストレージ (24時間自動削除、CORS設定) |
| **DynamoDB** | JobsTable | ジョブ管理テーブル (TTL有効) |
| **Batch** | BatchComputeEnvironment | Fargate コンピュート環境 (最大 6 vCPU) |
| | BatchJobQueue | ジョブキュー |
| | BatchJobDefinition | ジョブ定義 (2 vCPU, 4GB, 2時間タイムアウト) |
| **Logs** | BatchLogGroup | Batch ジョブログ用 CloudWatch ロググループ |

## パラメータ

- `Environment`: 環境名 (dev または prod)、デフォルト: dev

## 出力 (Exports)

すべての主要リソースの ARN と名前がエクスポートされます：

- ECR リポジトリ URI
- IAM ロール ARN
- S3 バケット名と ARN
- DynamoDB テーブル名と ARN
- Batch リソース ARN
- CloudWatch Logs ロググループ名

## 使用方法

### テンプレートの検証

```bash
# cfn-lint を使用
cfn-lint template.yaml

# AWS CLI を使用 (要 AWS 認証)
aws cloudformation validate-template \
  --template-body file://template.yaml \
  --region ap-northeast-1
```

### デプロイ

```bash
aws cloudformation deploy \
  --template-file template.yaml \
  --stack-name codec-converter-dev \
  --parameter-overrides Environment=dev \
  --capabilities CAPABILITY_NAMED_IAM \
  --region ap-northeast-1
```

## 注意事項

### このテンプレートはスケルトンです

- **最小構成**: 各リソースの基本的なプロパティのみ定義
- **プレースホルダ**: 詳細な設定は別タスクで実装予定
- **TODO コメント**: 今後の改善点を明記

### 既知の制限事項

1. **Batch Compute Environment**
   - 現在はパブリックサブネットを使用（一時的）
   - セキュリティグループは空の配列（プレースホルダ）
   - 本番環境ではプライベートサブネットの使用を推奨

2. **S3 CORS 設定**
   - 開発環境では localhost:3000 のみ許可
   - 本番環境のドメインは example.com（要更新）

3. **VPC 依存関係**
   - 共有 VPC スタックからサブネット ID をインポート
   - VPC スタックが先にデプロイされている必要があります

## 関連ドキュメント

- [仕様書](../../specs/002-add-codec-converter/spec.md)
- [データモデル](../../specs/002-add-codec-converter/data-model.md)
- [タスクリスト](../../specs/002-add-codec-converter/tasks.md)
- [インフラ詳細](../../docs/apps/codec-converter/infra/README.md)

## 次のステップ

このスケルトンテンプレートは T003 のタスクで作成されました。今後のタスクで以下が実装されます：

- T006: DynamoDB テーブル定義の詳細化
- T007: S3 バケット定義の詳細化
- T008: IAM ロールの詳細化
- T009: Batch リソースの詳細化
- T010: ECR リポジトリの詳細化

各タスクで個別のテンプレートファイルが作成され、この `template.yaml` は統合テンプレートまたは参照用として残されます。
