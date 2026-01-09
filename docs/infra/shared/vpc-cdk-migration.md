# Phase 1: VPC の CDK 移行結果

このドキュメントは、VPC リソースを CloudFormation から CDK に移行した結果を記録します。

## 実施日

2026-01-09

## 概要

VPC リソースを CloudFormation (YAML) から AWS CDK (TypeScript) に移行しました。これは Shared リソースの CDK 移行の第一段階です。

## 移行内容

### 移行対象リソース

| リソース | CloudFormation | CDK | 論理 ID |
|---------|---------------|-----|---------|
| VPC | ✅ | ✅ | `NagiyuVPC` |
| Internet Gateway | ✅ | ✅ | `NagiyuInternetGateway` |
| VPC Gateway Attachment | ✅ | ✅ | `NagiyuVPCGatewayAttachment` |
| Public Subnet 1a | ✅ | ✅ | `NagiyuPublicSubnet1a` |
| Public Subnet 1b (prod) | ✅ | ✅ | `NagiyuPublicSubnet1b` |
| Public Route Table | ✅ | ✅ | `NagiyuPublicRouteTable` |
| Public Route | ✅ | ✅ | `NagiyuPublicRoute` |
| Route Table Association 1a | ✅ | ✅ | `NagiyuPublicSubnet1aRouteTableAssociation` |
| Route Table Association 1b | ✅ | ✅ | `NagiyuPublicSubnet1bRouteTableAssociation` |

### Export 名の維持

| Export 名 | dev | prod |
|----------|-----|------|
| VPC ID | `nagiyu-dev-vpc-id` | `nagiyu-prod-vpc-id` |
| Public Subnet IDs | `nagiyu-dev-public-subnet-ids` | `nagiyu-prod-public-subnet-ids` |
| Internet Gateway ID | `nagiyu-dev-igw-id` | `nagiyu-prod-igw-id` |
| VPC CIDR | `nagiyu-dev-vpc-cidr` | `nagiyu-prod-vpc-cidr` |

## 実装アプローチ

### L1 Constructs の使用

CloudFormation の論理 ID を維持するため、L1 Constructs (`CfnXxx`) を使用しました。

**理由**:
- L2 Constructs (`Vpc`) を使用すると、論理 ID がハッシュ付きになる（例: `NagiyuVPC4C966FEC`）
- 既存の CloudFormation スタックからの移行では、論理 ID の変更はリソースの再作成を引き起こす可能性がある
- L1 Constructs を使用することで、論理 ID を完全に制御できる

**トレードオフ**:
- L1 Constructs はより冗長なコードになる
- L2 Constructs のベストプラクティスや便利なメソッドが使えない
- しかし、既存リソースの移行においては安全性が最優先

### 環境別の条件分岐

CloudFormation の `Conditions` セクションを TypeScript の `if` 文に置き換えました。

```typescript
const isProd = props.environment === 'prod';

// prod 環境のみ Subnet 1b を作成
if (isProd) {
  publicSubnet1b = new ec2.CfnSubnet(this, 'NagiyuPublicSubnet1b', {
    // ...
  });
}
```

### タグの順序

CloudFormation と CDK でタグの順序が異なりますが、AWS 側では順序は関係ないため問題ありません。

## CloudFormation との差分

### dev 環境

```yaml
# 主な差分
1. CDK Metadata リソースが追加（分析用、実際のリソースには影響なし）
2. タグの順序が異なる（機能的には同等）
3. Metadata セクションに `aws:cdk:path` が追加
```

### prod 環境

dev 環境と同様の差分です。

## 検証項目

### ✅ ビルド検証

```bash
cd infra/shared
npm run build
# → ビルド成功
```

### ✅ Synth 検証

```bash
# dev 環境
npm run synth -- --context env=dev
# → CloudFormation テンプレート生成成功

# prod 環境
npm run synth -- --context env=prod
# → CloudFormation テンプレート生成成功
```

### ✅ 論理 ID の検証

CloudFormation テンプレートと CDK テンプレートで論理 ID が完全一致していることを確認しました。

```
NagiyuVPC
NagiyuInternetGateway
NagiyuVPCGatewayAttachment
NagiyuPublicSubnet1a
NagiyuPublicSubnet1b (prod のみ)
NagiyuPublicRouteTable
NagiyuPublicRoute
NagiyuPublicSubnet1aRouteTableAssociation
NagiyuPublicSubnet1bRouteTableAssociation (prod のみ)
```

### ✅ Export 名の検証

Export 名が既存の CloudFormation スタックと完全一致していることを確認しました。

```
nagiyu-{env}-vpc-id
nagiyu-{env}-public-subnet-ids
nagiyu-{env}-igw-id
nagiyu-{env}-vpc-cidr
```

### ⏳ デプロイ検証（未実施）

実際の AWS 環境へのデプロイは、Issue の指示に従って実施します。

## プロジェクト構造

```
infra/shared/
├── bin/
│   └── shared.ts              # エントリーポイント
├── lib/
│   └── vpc-stack.ts           # VPC スタック（L1 Constructs）
├── libs/
│   └── utils/
│       ├── exports.ts         # Phase 0 で作成済み
│       └── env-config.ts      # Phase 0 で作成済み
├── cdk.json                   # CDK 設定
├── tsconfig.json              # TypeScript 設定
├── package.json               # 依存関係
├── .gitignore                 # Git 無視ファイル
└── README.md                  # ドキュメント
```

## デプロイ手順（参考）

### 1. dev 環境での検証

```bash
cd infra/shared

# 差分確認
npm run diff -- nagiyu-shared-vpc-dev --context env=dev

# デプロイ
npm run deploy -- nagiyu-shared-vpc-dev --context env=dev

# Export 確認
aws cloudformation list-exports \
  --query "Exports[?starts_with(Name, 'nagiyu-dev-vpc')].{Name:Name,Value:Value}" \
  --output table
```

### 2. 既存サービスの動作確認

```bash
cd ../root

# 差分確認（変更がないことを確認）
npm run diff -- --context env=dev

# 必要に応じて再デプロイ
npm run deploy -- --context env=dev
```

### 3. prod 環境へのロールアウト

dev 環境で問題がなければ、prod 環境にも同様の手順でデプロイします。

## ロールバック手順（参考）

問題が発生した場合:

```bash
# CDK スタックを削除
cd infra/shared
npm run destroy -- nagiyu-shared-vpc-dev --context env=dev

# 元の CloudFormation スタックを再デプロイ
aws cloudformation deploy \
  --template-file vpc/vpc.yaml \
  --stack-name nagiyu-shared-vpc-dev \
  --parameter-overrides Environment=dev
```

## 注意事項

### リソースの再作成を避ける

論理 ID が変更されると、AWS はリソースを再作成します。VPC の場合、以下の影響があります:

- **VPC の再作成**: すべてのサブネット、ENI、セキュリティグループが削除される
- **サービスの停止**: VPC に依存するすべてのサービスがダウンする
- **IP アドレスの変更**: Elastic IP、パブリック IP が変更される

このため、論理 ID の維持は最優先事項です。

### Export 名の変更を避ける

Export 名が変更されると、それを参照している他のスタックがエラーになります。

- **root スタック**: VPC ID と Subnet IDs を参照
- **将来のサービス**: 同様に VPC リソースを参照

Export 名は絶対に変更しないでください。

### スタック名の変更

CloudFormation のスタック名を変更する場合:

- 旧: `nagiyu-shared-vpc-dev`
- 新: `SharedVpc-dev`

この変更により、CloudFormation は新しいスタックを作成しようとします。既存のスタックを移行する場合は、`cdk import` を使用するか、既存のスタック名を維持してください。

**推奨**: 既存のスタック名を維持するため、CDK スタック ID を `nagiyu-shared-vpc-{env}` に変更することを検討してください。

## 今後の課題

### スタック名の変更

CloudFormation のスタック名:

- dev: `nagiyu-shared-vpc-dev`
- prod: `nagiyu-shared-vpc-prod`

CDK スタック ID を既存の CloudFormation スタック名に合わせています。これにより、`cdk deploy` コマンドは既存のスタックを更新する形になります。

## 今後の課題

### CloudFormation テンプレートのバックアップ

移行が成功し、安定稼働を確認したら、元の CloudFormation テンプレートをバックアップします:

```bash
mv infra/shared/vpc/vpc.yaml infra/shared/vpc/vpc.yaml.bak
```

1週間程度様子を見て、問題なければ削除します。

## 次のステップ

- **Phase 2**: ACM (証明書) の CDK 移行
- **Phase 3**: IAM (ポリシー、ユーザー) の CDK 移行

## 参考資料

- [AWS CDK L1 vs L2 Constructs](https://docs.aws.amazon.com/cdk/v2/guide/constructs.html)
- [CloudFormation リソースの論理 ID](https://docs.aws.amazon.com/ja_jp/AWSCloudFormation/latest/UserGuide/resources-section-structure.html)
- [CDK Import コマンド](https://docs.aws.amazon.com/cdk/v2/guide/cli.html#cli-import)
