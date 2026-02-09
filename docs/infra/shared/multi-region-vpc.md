# マルチリージョンVPC展開

## 概要

一部のサービス（例: niconico-mylist-assistant のバッチ処理）では、特定のリージョン（ap-northeast-1）にリソースを配置する必要があります。これは、外部サービスの制約（二段階認証の要求など）により、日本リージョンからのアクセスが必要なためです。

## ap-northeast-1 へのVPC展開

### 前提条件

- AWS CLI が設定済みであること
- デプロイ権限を持つ IAM ユーザーの認証情報が設定されていること
- 共有インフラのIAMスタックが既にデプロイされていること

### デプロイ手順

#### 1. ap-northeast-1 リージョンのBootstrap

```bash
cd infra/shared

# ap-northeast-1 リージョンをBootstrap
npm run bootstrap -- aws://<ACCOUNT_ID>/ap-northeast-1
```

#### 2. VPCスタックのデプロイ

```bash
# dev環境のVPCを ap-northeast-1 にデプロイ
AWS_REGION=ap-northeast-1 npm run cdk -- deploy NagiyuSharedVpcDev \
  --context env=dev \
  --require-approval never

# prod環境のVPCを ap-northeast-1 にデプロイ（本番環境の場合）
AWS_REGION=ap-northeast-1 npm run cdk -- deploy NagiyuSharedVpcProd \
  --context env=prod \
  --require-approval never
```

### 確認方法

デプロイ後、以下のコマンドでVPCが作成されたことを確認できます:

```bash
# VPCの確認
aws ec2 describe-vpcs \
  --filters "Name=tag:Name,Values=nagiyu-dev-vpc" \
  --region ap-northeast-1

# サブネットの確認
aws ec2 describe-subnets \
  --filters "Name=tag:Name,Values=nagiyu-dev-public-subnet-1a" \
  --region ap-northeast-1
```

## 対象サービス

以下のサービスは ap-northeast-1 リージョンのVPCを使用します:

- **niconico-mylist-assistant (Batch)**: ニコニコ動画のログインで二段階認証を回避するため

## ネットワーク設計

ap-northeast-1 リージョンのVPC設計は、us-east-1 と同じ構成を使用します:

### dev 環境

| 項目 | 値 |
|-----|-----|
| VPC CIDR | `10.0.0.0/24` |
| AZ 構成 | 1 AZ (ap-northeast-1a) |
| リージョン | ap-northeast-1 |

#### サブネット構成

| サブネット名 | タイプ | AZ | CIDR | 利用可能 IP |
|------------|------|-----|------|-----------|
| nagiyu-dev-public-subnet-1a | Public | ap-northeast-1a | `10.0.0.0/24` | 251 |

### prod 環境

| 項目 | 値 |
|-----|-----|
| VPC CIDR | `10.1.0.0/24` |
| AZ 構成 | 2 AZ (ap-northeast-1a, ap-northeast-1b) |
| リージョン | ap-northeast-1 |

#### サブネット構成

| サブネット名 | タイプ | AZ | CIDR | 利用可能 IP |
|------------|------|-----|------|-----------|
| nagiyu-prod-public-subnet-1a | Public | ap-northeast-1a | `10.1.0.0/25` | 123 |
| nagiyu-prod-public-subnet-1b | Public | ap-northeast-1b | `10.1.128.0/25` | 123 |

## トラブルシューティング

### VPC lookup エラー

CDKスタックのデプロイ時に以下のエラーが発生する場合:

```
ValidationError: Cannot retrieve value from context provider vpc-provider
```

**原因**: 指定されたリージョンにVPCが存在しない

**解決方法**: 上記の手順に従って、該当リージョンにVPCをデプロイしてください

### クロスリージョン参照エラー

異なるリージョン間でリソースを参照する場合、CDKスタックで `crossRegionReferences: true` を設定する必要があります。

```typescript
const lambdaStack = new LambdaStack(app, 'MyLambdaStack', {
  env: { region: 'us-east-1' },
  batchJobQueueArn: batchStack.jobQueueArn, // ap-northeast-1 のリソース
  crossRegionReferences: true, // 必須
});
```

## 関連ドキュメント

- [VPC 詳細設計](./vpc.md)
- [共有インフラ概要](./README.md)
- [デプロイ手順](../deploy.md)
