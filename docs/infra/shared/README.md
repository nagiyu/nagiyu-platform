# Shared Infrastructure (CDK)

nagiyu プラットフォーム全体で共有されるインフラストラクチャリソースを管理します。

## 構成

### VPC Stack
- **VPC**: ネットワーク基盤
- **パブリックサブネット**: dev=1個、prod=2個
- **インターネットゲートウェイ**: 外部通信用

### ACM Stack
- **SSL/TLS 証明書**: ワイルドカード証明書 (`*.{domain}`)
- **DNS 検証**: Route53 による自動検証

### IAM Policies Stack
- **Core Policy**: CloudFormation, IAM, VPC 関連
- **Application Policy**: Lambda, S3, DynamoDB 関連
- **Container Policy**: ECR, ECS 関連
- **Integration Policy**: 統合テスト用

### IAM Users Stack
- **GitHub Actions User**: CI/CD 用
- **Local Dev User**: ローカル開発用

## Export されるリソース

各スタックは CloudFormation Export を使用して、他のサービスから参照可能なリソースを公開しています。

Export 名は `infra/shared/libs/utils/exports.ts` で一元管理されています。

## デプロイ

### 前提条件
- Node.js 22 以上
- AWS CLI 設定済み
- CDK Bootstrap 実行済み

### 開発環境
```bash
cd infra/shared
npm ci
npm run build
npx cdk deploy --all --context env=dev
```

### 本番環境
```bash
npx cdk deploy --all --context env=prod
```

### 個別スタックのデプロイ
```bash
# VPC のみ
npx cdk deploy SharedVpc-dev --context env=dev

# ACM のみ
npx cdk deploy SharedAcm

# IAM のみ
npx cdk deploy SharedIamPolicies SharedIamUsers
```

## 差分確認

デプロイ前に差分を確認することを推奨します:

```bash
npx cdk diff --all --context env=dev
```

## GitHub Actions

`develop` または `main` ブランチへのプッシュで自動デプロイされます。

- **develop** → dev 環境
- **main** → prod 環境

ワークフロー: `.github/workflows/shared-deploy.yml`

## トラブルシューティング

### Export が参照できない

他のサービスから Export を参照できない場合:

```bash
# Export が正しく作成されているか確認
aws cloudformation list-exports --query "Exports[?starts_with(Name, 'nagiyu')].{Name:Name,Value:Value}" --output table
```

### スタック削除時のエラー

Export が他のスタックから参照されている場合、削除できません。
参照している全てのスタックを先に削除してください。

---

## 詳細ドキュメント

各リソースの詳細な設計と運用については、以下のドキュメントを参照してください:

- [IAM 詳細ドキュメント](./iam.md)
- [VPC 詳細ドキュメント](./vpc.md)
- [ACM 詳細ドキュメント](./acm.md)
- [CloudFront 詳細ドキュメント](./cloudfront.md)
- [CDK ユーティリティ](./cdk-utils.md)
- [共有リソースの使用方法](./shared-cdk-usage.md)