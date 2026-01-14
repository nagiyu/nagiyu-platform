# @nagiyu/infra-common マイグレーションガイド

## 目次

- [概要](#概要)
- [移行前の確認事項](#移行前の確認事項)
- [移行手順](#移行手順)
- [移行時の注意点](#移行時の注意点)
- [ロールバック方法](#ロールバック方法)
- [サービス別移行例](#サービス別移行例)
- [トラブルシューティング](#トラブルシューティング)

---

## 概要

このガイドでは、既存の CDK スタックを `@nagiyu/infra-common` パッケージを使用したスタックに移行する手順を説明します。

### 移行の目的

- **コードの重複排除**: 50-75%のコード削減
- **一貫性の確保**: リソース命名規則とセキュリティ設定の統一
- **メンテナンス性の向上**: 設定変更が1箇所で完結

### 移行の原則

- **破壊的変更を避ける**: 既存リソースを削除せず、論理IDを維持
- **段階的移行**: 1サービスずつ移行し、動作確認してから次へ
- **ロールバック可能**: 問題が発生した場合、すぐに元に戻せる

---

## 移行前の確認事項

### 1. 現状の把握

以下を確認してください：

- [ ] 現在のスタック構成を理解している
- [ ] 既存リソースの命名規則を把握している
- [ ] 既存の CloudFormation 論理ID を確認している
- [ ] 既存の環境変数や IAM ポリシーを把握している

### 2. バックアップの取得

移行前に必ずバックアップを取得してください：

```bash
# 現在のスタック定義を出力
cdk synth > backup/stack-before-migration.yaml

# 現在のスタック一覧を確認
cdk list > backup/stack-list.txt

# CloudFormation スタックの詳細を確認
aws cloudformation describe-stacks --stack-name <stack-name> > backup/stack-details.json
```

### 3. 環境変数の確認

以下の環境変数が設定されているか確認してください：

- `CDK_DEFAULT_ACCOUNT`: AWS アカウント ID
- `CDK_DEFAULT_REGION`: AWS リージョン
- `ENVIRONMENT`: デプロイ環境 (`dev` または `prod`)

### 4. 依存パッケージの確認

`@nagiyu/infra-common` が正しくインストールされているか確認してください：

```bash
# パッケージのビルド
npm run build --workspace @nagiyu/infra-common

# テストの実行
npm run test --workspace @nagiyu/infra-common
```

---

## 移行手順

### ステップ1: 現在のスタックの分析

既存のスタック実装を確認し、以下を記録してください：

1. **リソース名**: ECR リポジトリ名、Lambda 関数名など
2. **CloudFormation 論理ID**: 各リソースの論理ID
3. **カスタム設定**: デフォルトから変更されている設定値
4. **IAM ポリシー**: Lambda に付与されている追加のポリシー
5. **環境変数**: Lambda に設定されている環境変数

**例: 既存の ECR スタック**

```typescript
// 既存の実装
export class EcrStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EcrStackProps) {
    super(scope, id, props);

    // リソース名: tools-app-dev
    // 論理ID: ToolsRepository
    const repository = new ecr.Repository(this, 'ToolsRepository', {
      repositoryName: `tools-app-${environment}`,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.MUTABLE,
      lifecycleRules: [
        {
          maxImageCount: 10,
          rulePriority: 1,
        },
      ],
      removalPolicy: environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });
  }
}
```

### ステップ2: 新しいスタックの実装

`@nagiyu/infra-common` を使用して新しいスタックを実装します。

**重要**: 既存のリソース名と論理ID を維持してください。

```typescript
import { EcrStackBase } from '@nagiyu/infra-common';

export class EcrStack extends EcrStackBase {
  constructor(scope: Construct, id: string, props: EcrStackProps) {
    const { environment, ...stackProps } = props;

    const baseProps: EcrStackBaseProps = {
      ...stackProps,
      serviceName: 'tools',
      environment: environment as 'dev' | 'prod',
      ecrConfig: {
        // 既存のリソース名を維持
        repositoryName: `tools-app-${environment}`,
        // 既存の論理ID を維持
        logicalId: 'ToolsRepository',
      },
    };

    super(scope, id, baseProps);
  }
}
```

### ステップ3: 差分の確認

`cdk diff` コマンドで変更内容を確認します。

```bash
cdk diff ToolsEcrStackDev
```

**期待される出力**:

- リソースの作成/削除が発生しないこと
- 設定値の変更が最小限であること

**警告が出る例**:

```
Resources
[-] AWS::ECR::Repository ToolsRepository destroy
[+] AWS::ECR::Repository ToolsRepository create
```

このような出力が出た場合、論理ID が正しく設定されていません。ステップ2に戻って修正してください。

### ステップ4: テスト環境へのデプロイ

まず dev 環境にデプロイして動作確認します。

```bash
# dev 環境にデプロイ
cdk deploy ToolsEcrStackDev --require-approval never

# デプロイ結果を確認
aws ecr describe-repositories --repository-names tools-app-dev
```

### ステップ5: 動作確認

デプロイが成功したら、以下を確認してください：

- [ ] リソースが正しく作成されている
- [ ] 既存のリソースが削除されていない
- [ ] アプリケーションが正常に動作している
- [ ] CloudFormation スタックのステータスが `UPDATE_COMPLETE`

### ステップ6: 本番環境へのデプロイ

dev 環境で問題がなければ、prod 環境にデプロイします。

```bash
# prod 環境にデプロイ
cdk deploy ToolsEcrStackProd --require-approval never

# デプロイ結果を確認
aws ecr describe-repositories --repository-names tools-app-prod
```

### ステップ7: 移行完了の確認

以下をすべて確認してください：

- [ ] すべてのスタックが正常にデプロイされている
- [ ] アプリケーションが正常に動作している
- [ ] CloudFormation スタックのステータスが `UPDATE_COMPLETE`
- [ ] 既存のリソースが削除されていない
- [ ] ログにエラーが出ていない

---

## 移行時の注意点

### 1. リソース名の保持

既存のリソース名を変更すると、リソースが再作成されます。必ず既存の名前を維持してください。

**✅ 推奨**:

```typescript
ecrConfig: {
  repositoryName: `tools-app-${environment}`, // 既存の名前を維持
  logicalId: 'ToolsRepository',
}
```

**❌ 非推奨**:

```typescript
ecrConfig: {
  // リポジトリ名を変更すると再作成される
  repositoryName: `nagiyu-tools-ecr-${environment}`,
}
```

### 2. 論理ID の指定

CloudFormation 論理ID を指定しないと、リソースが再作成されます。必ず既存の論理ID を維持してください。

**✅ 推奨**:

```typescript
ecrConfig: {
  logicalId: 'ToolsRepository', // 既存の論理ID を維持
}
```

**❌ 非推奨**:

```typescript
// 論理ID を指定しないとデフォルトの ID が使用され、リソースが再作成される
ecrConfig: {
  repositoryName: `tools-app-${environment}`,
}
```

### 3. カスタム設定の移行

既存のカスタム設定（メモリサイズ、タイムアウトなど）を必ず移行してください。

**既存の実装**:

```typescript
const lambda = new lambda.Function(this, 'ToolsFunction', {
  memorySize: 1024, // カスタム設定
  timeout: cdk.Duration.seconds(60), // カスタム設定
});
```

**新しい実装**:

```typescript
const lambdaStack = new LambdaStackBase(app, 'ToolsLambdaStack', {
  serviceName: 'tools',
  environment: 'dev',
  ecrRepositoryName: ecrStack.repository.repositoryName,
  lambdaConfig: {
    memorySize: 1024, // カスタム設定を維持
    timeout: 60, // カスタム設定を維持
  },
});
```

### 4. IAM ポリシーの移行

既存の IAM ポリシーを必ず移行してください。

**既存の実装**:

```typescript
lambda.addToRolePolicy(new iam.PolicyStatement({
  effect: iam.Effect.ALLOW,
  actions: ['dynamodb:GetItem', 'dynamodb:PutItem'],
  resources: ['arn:aws:dynamodb:*:*:table/nagiyu-auth-users-prod'],
}));
```

**新しい実装**:

```typescript
const lambdaStack = new LambdaStackBase(app, 'AuthLambdaStack', {
  serviceName: 'auth',
  environment: 'prod',
  ecrRepositoryName: ecrStack.repository.repositoryName,
  additionalPolicyStatements: [
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:GetItem', 'dynamodb:PutItem'],
      resources: ['arn:aws:dynamodb:*:*:table/nagiyu-auth-users-prod'],
    }),
  ],
});
```

### 5. 環境変数の移行

既存の環境変数を必ず移行してください。

**既存の実装**:

```typescript
const lambda = new lambda.Function(this, 'AuthFunction', {
  environment: {
    NODE_ENV: 'production',
    DYNAMODB_TABLE_NAME: 'nagiyu-auth-users-prod',
  },
});
```

**新しい実装**:

```typescript
const lambdaStack = new LambdaStackBase(app, 'AuthLambdaStack', {
  serviceName: 'auth',
  environment: 'prod',
  ecrRepositoryName: ecrStack.repository.repositoryName,
  lambdaConfig: {
    environment: {
      NODE_ENV: 'production',
      DYNAMODB_TABLE_NAME: 'nagiyu-auth-users-prod',
    },
  },
});
```

---

## ロールバック方法

### 問題が発生した場合

移行後に問題が発生した場合、以下の手順でロールバックできます。

#### 方法1: Git で前のバージョンに戻す

```bash
# 変更前のコミットに戻す
git log --oneline
git checkout <commit-hash>

# スタックを再デプロイ
cdk deploy ToolsEcrStackDev
```

#### 方法2: CloudFormation コンソールでロールバック

1. AWS コンソールで CloudFormation を開く
2. 該当するスタックを選択
3. 「スタックアクション」→「前回の安定した状態にロールバック」を選択

#### 方法3: バックアップから復元

```bash
# バックアップしたテンプレートを使用
aws cloudformation update-stack \
  --stack-name ToolsEcrStackDev \
  --template-body file://backup/stack-before-migration.yaml
```

---

## サービス別移行例

### Tools サービスの移行

Tools サービスは最もシンプルな構成のため、最初に移行することを推奨します。

#### 移行前

```typescript
// infra/tools/lib/ecr-stack.ts
export class EcrStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EcrStackProps) {
    super(scope, id, props);

    const repository = new ecr.Repository(this, 'ToolsRepository', {
      repositoryName: `tools-app-${environment}`,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.MUTABLE,
      lifecycleRules: [{ maxImageCount: 10, rulePriority: 1 }],
      removalPolicy: environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });
  }
}
```

#### 移行後

```typescript
// infra/tools/lib/ecr-stack.ts
import { EcrStackBase, EcrStackBaseProps } from '@nagiyu/infra-common';

export class EcrStack extends EcrStackBase {
  constructor(scope: Construct, id: string, props: EcrStackProps) {
    const { environment, ...stackProps } = props;

    const baseProps: EcrStackBaseProps = {
      ...stackProps,
      serviceName: 'tools',
      environment: environment as 'dev' | 'prod',
      ecrConfig: {
        repositoryName: `tools-app-${environment}`,
        logicalId: 'ToolsRepository',
      },
    };

    super(scope, id, baseProps);
  }
}
```

---

### Auth サービスの移行

Auth サービスは DynamoDB と Secrets Manager へのアクセス権限が必要です。

#### 移行前

```typescript
// infra/auth/lib/lambda-stack.ts
export class LambdaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    const lambdaFunction = new lambda.Function(this, 'AuthFunction', {
      functionName: `nagiyu-auth-lambda-${environment}`,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(60),
      environment: {
        NODE_ENV: 'production',
        DYNAMODB_TABLE_NAME: 'nagiyu-auth-users-prod',
      },
    });

    // DynamoDB アクセス権限
    lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:Query'],
      resources: ['arn:aws:dynamodb:*:*:table/nagiyu-auth-users-prod'],
    }));

    // Secrets Manager アクセス権限
    lambdaFunction.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['secretsmanager:GetSecretValue'],
      resources: ['arn:aws:secretsmanager:*:*:secret:nagiyu/auth/*'],
    }));
  }
}
```

#### 移行後

```typescript
// infra/auth/lib/lambda-stack.ts
import * as iam from 'aws-cdk-lib/aws-iam';
import { LambdaStackBase, LambdaStackBaseProps } from '@nagiyu/infra-common';

export class LambdaStack extends LambdaStackBase {
  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    const { environment, ecrRepositoryName, ...stackProps } = props;

    const baseProps: LambdaStackBaseProps = {
      ...stackProps,
      serviceName: 'auth',
      environment: environment as 'dev' | 'prod',
      ecrRepositoryName,
      lambdaConfig: {
        functionName: `nagiyu-auth-lambda-${environment}`,
        memorySize: 1024,
        timeout: 60,
        environment: {
          NODE_ENV: 'production',
          DYNAMODB_TABLE_NAME: 'nagiyu-auth-users-prod',
        },
        logicalId: 'AuthFunction',
      },
      additionalPolicyStatements: [
        // DynamoDB アクセス権限
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:Query'],
          resources: ['arn:aws:dynamodb:*:*:table/nagiyu-auth-users-prod'],
        }),
        // Secrets Manager アクセス権限
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['secretsmanager:GetSecretValue'],
          resources: ['arn:aws:secretsmanager:*:*:secret:nagiyu/auth/*'],
        }),
      ],
    };

    super(scope, id, baseProps);
  }
}
```

---

### Admin サービスの移行

Admin サービスは Auth サービスと同様の構成です。

#### 移行のポイント

1. ECR リポジトリ名: `nagiyu-admin-${environment}`
2. Lambda 関数名: `nagiyu-admin-lambda-${environment}`
3. 論理ID: 既存スタックから確認
4. カスタム設定: メモリサイズ、タイムアウトなど
5. IAM ポリシー: DynamoDB、Secrets Manager へのアクセス権限

---

### Codec-Converter サービスの移行

Codec-Converter サービスは最も複雑な構成で、AWS Batch を使用します。

#### 移行のポイント

1. 複数のリソース: ECR、Lambda、CloudFront、Batch
2. カスタムロール: Batch ジョブ実行ロール
3. VPC 統合: Batch ジョブが VPC 内で実行される
4. 複雑な IAM ポリシー: S3、Batch、ECS へのアクセス権限

#### 移行の推奨順序

1. ECR スタックの移行
2. Lambda スタックの移行
3. CloudFront スタックの移行
4. Batch スタックの移行（カスタム実装のため、`@nagiyu/infra-common` では対応していない）

---

## トラブルシューティング

### 問題1: リソースが再作成される

**症状**: `cdk diff` で既存リソースの削除と作成が表示される

**原因**: 論理ID またはリソース名が変更されている

**解決策**:

1. 既存の CloudFormation テンプレートを確認
    ```bash
    aws cloudformation get-template --stack-name ToolsEcrStackDev
    ```

2. 論理ID とリソース名を確認し、移行後のコードに反映

---

### 問題2: IAM ポリシーが不足している

**症状**: Lambda 関数の実行時に権限エラーが発生する

**原因**: 既存の IAM ポリシーが移行されていない

**解決策**:

既存の Lambda 関数のロールを確認し、必要なポリシーを `additionalPolicyStatements` に追加します。

```bash
# 既存の Lambda 関数のロールを確認
aws lambda get-function --function-name tools-app-dev
```

---

### 問題3: 環境変数が不足している

**症状**: Lambda 関数の実行時に環境変数が見つからないエラーが発生する

**原因**: 既存の環境変数が移行されていない

**解決策**:

既存の Lambda 関数の環境変数を確認し、`lambdaConfig.environment` に追加します。

```bash
# 既存の Lambda 関数の環境変数を確認
aws lambda get-function-configuration --function-name tools-app-dev
```

---

### 問題4: デプロイが失敗する

**症状**: `cdk deploy` 実行時にエラーが発生する

**原因**: 様々な原因が考えられます

**解決策**:

1. エラーメッセージを確認
    ```bash
    cdk deploy ToolsEcrStackDev --verbose
    ```

2. CloudFormation イベントを確認
    ```bash
    aws cloudformation describe-stack-events --stack-name ToolsEcrStackDev
    ```

3. ログを確認
    ```bash
    aws cloudformation describe-stack-events --stack-name ToolsEcrStackDev \
      --query 'StackEvents[?ResourceStatus==`CREATE_FAILED`]'
    ```

---

## まとめ

- **段階的移行**: 1サービスずつ移行し、動作確認してから次へ
- **論理ID の維持**: 既存の論理ID を必ず指定し、リソースの再作成を避ける
- **カスタム設定の移行**: メモリサイズ、タイムアウト、IAM ポリシー、環境変数を漏れなく移行
- **差分の確認**: `cdk diff` で変更内容を必ず確認してからデプロイ
- **ロールバック可能**: 問題が発生した場合、すぐに元に戻せるようにバックアップを取得

---

## 関連ドキュメント

- [使用ガイド](./common-package-guide.md) - 基本的な使用方法
- [API リファレンス](./api-reference.md) - 型定義と関数の詳細
- [アーキテクチャ](./architecture.md) - インフラ全体の設計思想
