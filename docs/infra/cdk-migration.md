# CDK 移行ガイド

本ドキュメントでは、nagiyu-platform における CloudFormation から AWS CDK への移行戦略を説明します。

---

## 概要

nagiyu-platform は、従来 CloudFormation で管理していたインフラストラクチャを、段階的に AWS CDK (Cloud Development Kit) に移行します。この移行により、以下のメリットを得ることができます。

### CDK 移行のメリット

- **プログラマブルなインフラ定義**: TypeScript によるタイプセーフなインフラコード
- **再利用性の向上**: Constructs パターンによるコンポーネントの再利用
- **可読性の向上**: YAML の煩雑さから解放され、より理解しやすいコード
- **開発体験の改善**: IDE のコード補完、型チェック、リファクタリング機能の活用
- **テスト容易性**: ユニットテスト、スナップショットテストの実装が容易

### 移行方針

**段階的移行アプローチ**: 既存の CloudFormation スタックは維持しつつ、新規リソースは CDK で構築します。

- **既存リソース**: CloudFormation で継続管理（VPC、IAM、ACM など）
- **新規リソース**: CDK で構築（ルートドメインインフラなど）
- **将来的な移行**: 必要に応じて既存リソースを CDK に移行

---

## CDK と CloudFormation の共存

### 基本原則

1. **Stack の独立性**: CDK スタックと CloudFormation スタックは独立して管理
2. **Export/Import による連携**: CloudFormation の Export を CDK から参照
3. **命名規則の統一**: 両方のスタックで一貫した命名規則を使用
4. **段階的な移行**: 一度にすべてを移行せず、段階的にアプローチ

### Export/Import パターン

#### CloudFormation から Export

既存の CloudFormation スタックは、他のスタックで使用する値を Export します。

**例: VPC ID の Export**

```yaml
# infra/shared/vpc/vpc.yaml (CloudFormation)
Outputs:
  VpcId:
    Description: VPC ID
    Value: !Ref VPC
    Export:
      Name: !Sub nagiyu-${Environment}-vpc-id
  
  PublicSubnetIds:
    Description: Public Subnet IDs
    Value: !Join [',', [!Ref PublicSubnet1a, !Ref PublicSubnet1b]]
    Export:
      Name: !Sub nagiyu-${Environment}-public-subnet-ids
```

#### CDK から Import

CDK スタックでは、`Fn.importValue()` を使用して CloudFormation の Export を参照します。

**例: VPC ID の Import**

```typescript
// infra/root/root-stack.ts (CDK)
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

export class RootStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const environment = process.env.ENVIRONMENT || 'dev';
    
    // CloudFormation の Export を参照
    const vpcId = cdk.Fn.importValue(`nagiyu-${environment}-vpc-id`);
    
    // 既存 VPC を Lookup
    const vpc = ec2.Vpc.fromLookup(this, 'ExistingVpc', {
      vpcId: vpcId,
    });
    
    // この VPC を使って新しいリソースを作成
    // ...
  }
}
```

### スタック命名規則

CDK スタックも CloudFormation と同じ命名規則に従います。

```
nagiyu-{category}-{resource}-{suffix}
```

**例:**
- `nagiyu-root-webapp-dev` - ルートドメイン Web アプリ (dev 環境)
- `nagiyu-root-webapp-prod` - ルートドメイン Web アプリ (prod 環境)

---

## CDK プロジェクト構造

### ディレクトリ構成

```
infra/
├── bin/
│   └── nagiyu-platform.ts        # CDK App エントリーポイント
├── lib/                          # CDK Constructs とスタック (将来)
│   ├── shared/                   # 共有 Constructs
│   │   └── network-construct.ts
│   └── root/                     # ルートドメインスタック
│       ├── root-stack.ts
│       └── root-webapp-stack.ts
├── shared/                       # CloudFormation テンプレート (既存)
│   ├── iam/
│   ├── vpc/
│   └── acm/
├── root/                         # ルートドメイン関連リソース (将来の CDK スタック用)
├── cdk.json                      # CDK 設定
├── tsconfig.json                 # TypeScript 設定
└── package.json                  # 依存関係
```

### CDK App エントリーポイント

`bin/nagiyu-platform.ts` が CDK アプリケーションのエントリーポイントです。

```typescript
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { RootStack } from '../lib/root/root-stack';

const app = new cdk.App();

// 環境変数から設定を取得
const environment = process.env.ENVIRONMENT || 'dev';
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = 'us-east-1';

// ルートドメインスタックをデプロイ
new RootStack(app, `nagiyu-root-webapp-${environment}`, {
  env: { account, region },
  environment,
});

app.synth();
```

---

## CDK 開発ガイドライン

### 1. TypeScript の使用

CDK では TypeScript を使用します。

**推奨事項:**
- 厳密な型チェックを有効化 (`strict: true` in tsconfig.json)
- async/await を適切に使用
- 型推論を活用しつつ、公開 API には明示的な型を付与

### 2. Constructs パターン

再利用可能なコンポーネントは Construct として定義します。

**例: Network Construct**

```typescript
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface NetworkConstructProps {
  environment: string;
}

export class NetworkConstruct extends Construct {
  public readonly vpc: ec2.IVpc;
  public readonly subnets: ec2.ISubnet[];

  constructor(scope: Construct, id: string, props: NetworkConstructProps) {
    super(scope, id);

    // CloudFormation からインポート
    const vpcId = cdk.Fn.importValue(`nagiyu-${props.environment}-vpc-id`);
    
    this.vpc = ec2.Vpc.fromLookup(this, 'Vpc', {
      vpcId: vpcId,
    });
    
    // サブネット情報を取得
    // ...
  }
}
```

### 3. 環境ごとのスタック

dev/prod 環境で異なるスタックを作成します。

**環境切り替え:**
- 環境変数 `ENVIRONMENT` で dev/prod を切り替え
- スタック名に環境を含める: `nagiyu-root-webapp-dev`, `nagiyu-root-webapp-prod`
- リソースタグに環境を付与

**例:**

```typescript
const stack = new MyStack(app, `nagiyu-my-stack-${environment}`, {
  env: { account, region },
  tags: {
    Application: 'nagiyu',
    Environment: environment,
  },
});
```

### 4. リソースのタグ付け

すべてのリソースに以下のタグを付与します。

```typescript
cdk.Tags.of(stack).add('Application', 'nagiyu');
cdk.Tags.of(stack).add('Environment', environment);
cdk.Tags.of(stack).add('ManagedBy', 'CDK');
```

### 5. Outputs の Export

他のスタックから参照する値は Export します。

```typescript
new cdk.CfnOutput(this, 'VpcIdOutput', {
  value: vpc.vpcId,
  exportName: `nagiyu-${environment}-my-vpc-id`,
  description: 'VPC ID for my stack',
});
```

### 6. セキュリティのベストプラクティス

- **IAM ポリシーは最小権限**: 必要最小限の権限のみを付与
- **シークレットは Secrets Manager**: パスワードや API キーは Secrets Manager で管理
- **セキュリティグループは厳密に**: 不要なポートは開放しない
- **暗号化を有効化**: S3、EBS、RDS などで暗号化を有効化

### 7. コスト最適化

- **リソースサイジング**: 必要最小限のリソースサイズを選択
- **自動スケーリング**: 負荷に応じてリソースをスケール
- **未使用リソースの削除**: 開発環境では不要なリソースを削除
- **リザーブドインスタンス**: 本番環境では RI の使用を検討

### 8. テスト

CDK スタックはユニットテストとスナップショットテストを実装します。

**ユニットテストの例:**

```typescript
import { Template } from 'aws-cdk-lib/assertions';
import * as cdk from 'aws-cdk-lib';
import { RootStack } from '../lib/root/root-stack';

test('VPC is created', () => {
  const app = new cdk.App();
  const stack = new RootStack(app, 'TestStack', { environment: 'dev' });
  
  const template = Template.fromStack(stack);
  
  // VPC が作成されていることを確認
  template.resourceCountIs('AWS::EC2::VPC', 1);
});
```

---

## CDK デプロイフロー

### ローカル環境でのデプロイ

#### 1. 依存関係のインストール

```bash
# モノレポルートから
npm ci
```

#### 2. TypeScript のビルド

```bash
npm run build --workspace=@nagiyu/infra
```

#### 3. CDK Synth (CloudFormation テンプレート生成)

```bash
npm run synth --workspace=@nagiyu/infra
```

生成されたテンプレートは `infra/cdk.out/` に保存されます。

#### 4. 差分確認

```bash
npm run diff --workspace=@nagiyu/infra
```

既存スタックとの差分を確認します。

#### 5. デプロイ

```bash
# 全スタックをデプロイ
npm run deploy --workspace=@nagiyu/infra -- --all

# 特定のスタックをデプロイ
npm run deploy --workspace=@nagiyu/infra -- nagiyu-root-webapp-dev
```

#### 6. 承認なしデプロイ (CI/CD 用)

```bash
npm run deploy --workspace=@nagiyu/infra -- --all --require-approval never
```

### GitHub Actions でのデプロイ

`.github/workflows/root-deploy.yml` が CDK スタックを自動デプロイします。

**ワークフローの特徴:**
- モノレポルートから全コマンドを実行
- `npm run build/synth/deploy --workspace=@nagiyu/infra` を使用
- 依存関係は `npm ci` で monorepo 全体をインストール

**トリガー条件:**
- master ブランチへの push
- 以下のパスが変更された場合:
  - `infra/bin/**`
  - `infra/shared/vpc/**`
  - `infra/root/**`
  - `infra/package.json`
  - `infra/cdk.json`
  - `infra/tsconfig.json`

**デプロイステップ:**
1. CDK Synth で構文検証と CloudFormation テンプレート生成
2. CDK Deploy で全スタックをデプロイ

---

## 既存リソースの CDK への移行 (将来用)

### 移行手順

既存の CloudFormation スタックを CDK に移行する場合、以下の手順を推奨します。

#### 1. CDK でスタックを再定義

既存の CloudFormation テンプレートを参考に、CDK で同じリソースを定義します。

```typescript
// CloudFormation の再定義 (CDK)
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

export class VpcStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });
  }
}
```

#### 2. CloudFormation Import を使用

`cdk import` コマンドで既存のリソースを CDK スタックにインポートします。

```bash
cdk import nagiyu-dev-vpc
```

このコマンドは、既存の CloudFormation スタックのリソースを CDK スタックに移行します。

#### 3. スタックの検証

インポート後、スタックが正しく動作することを確認します。

```bash
# 差分がないことを確認
cdk diff nagiyu-dev-vpc
```

#### 4. 既存スタックの削除

CDK でスタックが正常に管理されることを確認したら、古い CloudFormation スタックは削除可能です。

**注意**: 移行は慎重に行い、必ずバックアップを取ってから実施してください。

### 移行の優先順位

以下の順序で移行を検討します。

1. **新規リソース**: まず新規リソースを CDK で構築（既に実施中）
2. **変更頻度が高いリソース**: 頻繁に更新するスタックから移行
3. **複雑なリソース**: CloudFormation で管理が煩雑なリソースを優先
4. **安定したリソース**: VPC、IAM などの基盤リソースは最後に移行（または移行しない）

---

## CDK と CloudFormation の違い

### 構文の違い

| 項目 | CloudFormation (YAML) | CDK (TypeScript) |
|------|----------------------|------------------|
| リソース定義 | YAML の定義 | TypeScript のクラスとメソッド |
| 参照 | `!Ref`, `!GetAtt` | プロパティアクセス |
| 条件分岐 | `!If`, `Condition` | TypeScript の `if` 文 |
| ループ | 不可 (手動で列挙) | TypeScript の `for`, `map` |
| 型チェック | なし | TypeScript の型チェック |
| IDE サポート | 限定的 | 完全なコード補完とリファクタリング |

### コード例の比較

#### VPC の作成

**CloudFormation (YAML):**

```yaml
VPC:
  Type: AWS::EC2::VPC
  Properties:
    CidrBlock: 10.0.0.0/24
    EnableDnsHostnames: true
    EnableDnsSupport: true
    Tags:
      - Key: Name
        Value: !Sub nagiyu-${Environment}-vpc
```

**CDK (TypeScript):**

```typescript
const vpc = new ec2.Vpc(this, 'Vpc', {
  cidr: '10.0.0.0/24',
  enableDnsHostnames: true,
  enableDnsSupport: true,
  tags: {
    Name: `nagiyu-${environment}-vpc`,
  },
});
```

### 高レベル Constructs の利点

CDK は高レベルの Constructs を提供し、ベストプラクティスをデフォルトで適用します。

**例: ALB の作成**

CloudFormation では ALB、ターゲットグループ、リスナーを個別に定義する必要がありますが、CDK では:

```typescript
const loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'ALB', {
  vpc,
  internetFacing: true,
});

const listener = loadBalancer.addListener('Listener', {
  port: 443,
  certificates: [certificate],
});

listener.addTargets('ECS', {
  port: 80,
  targets: [ecsService],
  healthCheck: {
    path: '/health',
  },
});
```

これだけで、セキュリティグループ、ターゲットグループ、リスナールールが自動的に作成されます。

---

## トラブルシューティング

### CDK Synth が失敗する

**原因:**
- TypeScript のコンパイルエラー
- 環境変数が設定されていない
- 依存関係がインストールされていない

**解決策:**

```bash
# TypeScript のビルドエラーを確認
npm run build --workspace=@nagiyu/infra

# 環境変数を確認
echo $ENVIRONMENT

# 依存関係を再インストール
npm ci
```

### CDK Deploy が失敗する

**原因:**
- AWS 認証情報が正しくない
- IAM 権限が不足している
- リソースの制約（例: EIP の上限）

**解決策:**

```bash
# AWS 認証情報を確認
aws sts get-caller-identity

# CloudFormation イベントを確認
aws cloudformation describe-stack-events \
  --stack-name <スタック名> \
  --query "StackEvents[?contains(ResourceStatus, 'FAILED')]" \
  --region us-east-1
```

### Import Value が見つからない

**原因:**
- 参照している Export が存在しない
- Export 名が間違っている
- リージョンが異なる

**解決策:**

```bash
# Export を確認
aws cloudformation list-exports --region us-east-1

# Export 名を確認
aws cloudformation describe-stacks \
  --stack-name <スタック名> \
  --query "Stacks[0].Outputs" \
  --region us-east-1
```

---

## 参考資料

### AWS CDK 公式ドキュメント

- [AWS CDK Developer Guide](https://docs.aws.amazon.com/cdk/v2/guide/home.html)
- [AWS CDK API Reference](https://docs.aws.amazon.com/cdk/api/v2/)
- [AWS CDK Examples](https://github.com/aws-samples/aws-cdk-examples)

### ベストプラクティス

- [AWS CDK Best Practices](https://docs.aws.amazon.com/cdk/v2/guide/best-practices.html)
- [AWS Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/)

### コミュニティリソース

- [CDK Patterns](https://cdkpatterns.com/)
- [Awesome CDK](https://github.com/kolomied/awesome-cdk)

---

## 関連ドキュメント

- [アーキテクチャ](./architecture.md) - インフラ全体の設計
- [デプロイ手順](./deploy.md) - 日常的なデプロイ操作
- [ルートドメインアーキテクチャ](./root/architecture.md) - ルートドメインの詳細設計
