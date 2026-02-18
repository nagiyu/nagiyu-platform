# CDK スタック間依存の撤廃・ARN/SSM 経由リソース共有への移行

## 概要

現在の CDK 構成はスタック間を CloudFormation Export（CfnOutput + Fn.importValue）と `addDependency()` で結合しており、一部スタックのみ更新しようとすると CloudFormation Export Lock（使用中の Export は削除・変更不可）や強制デプロイ順序が原因で大幅な変更が必要になる問題がある。

スタック間の依存関係を撤廃し、リソースの名前を厳格化し、リソース共有を以下に統一することで、各スタックを独立してデプロイ可能にする。

- **Named リソース（Lambda, DynamoDB, S3, ECR, IAM）**: 命名規則から ARN を確定的に構築
- **ID ベースリソース（VPC, サブネット, ALB, ECS クラスター）**: SSM Parameter Store 経由で参照

## 関連情報

- **タスクタイプ**: インフラタスク（全サービス共通）
- **影響範囲**: `infra/` 配下の全 CDK スタック

## 背景・問題点

### CloudFormation Export Lock

他スタックが `Fn.importValue` で参照中の Export は削除・変更できない。このため：
- 共有リソース（VPC, ACM, ALB）のスタックを変更すると、全消費スタックとの整合性確保が必要
- 一部スタックのみ `cdk deploy` しようとするとエラーになるケースがある

### 強制デプロイ順序

`addDependency()` および `Fn.importValue` による暗黙的依存が存在するため、特定の順序でデプロイしないと CloudFormation が依存解決エラーを出す。

## リソース種別の分類

### Named リソース（ARN 確定構築可能）

| リソース種別 | ARN パターン |
|---|---|
| Lambda 関数 | `arn:aws:lambda:{region}:{account}:function:{name}` |
| DynamoDB テーブル | `arn:aws:dynamodb:{region}:{account}:table/{name}` |
| S3 バケット | `arn:aws:s3:::{name}` |
| ECR リポジトリ | `arn:aws:ecr:{region}:{account}:repository/{name}` |
| IAM ロール | `arn:aws:iam::{account}:role/{name}` |
| IAM マネージドポリシー | `arn:aws:iam::{account}:policy/{name}` |
| Secrets Manager シークレット | `arn:aws:secretsmanager:{region}:{account}:secret:{name}-*` |

### ID ベースリソース（SSM Parameter Store 経由）

AWS が自動生成する ID を持つため、名前からの ARN 確定構築が不可能。

| リソース種別 | 理由 |
|---|---|
| VPC | `vpc-xxxxxxxxxx` 形式の自動 ID |
| サブネット | `subnet-xxxxxxxxxx` 形式の自動 ID |
| セキュリティグループ | `sg-xxxxxxxxxx` 形式の自動 ID |
| ALB ARN/DNS | ロードバランサー ID が自動生成 |
| ECS クラスター ARN | 名前は確定だが SSM 経由に統一する |

## 要件

### 機能要件（FR）

#### FR1: ARN 構築ユーティリティの追加

`infra/common/src/utils/arn.ts` を新規作成し、全 ARN 構築ロジックを集約する。
既存の `infra/common/src/utils/naming.ts` の命名規則と整合させる。

#### FR2: SSM パラメータ名の定数化

`infra/common/src/utils/ssm.ts`（および `infra/shared/libs/utils/ssm.ts`）を新規作成し、SSM パラメータ名を一元管理する。

SSM パラメータ名の規則:

```
/nagiyu/shared/{env}/vpc/id
/nagiyu/shared/{env}/vpc/cidr
/nagiyu/shared/{env}/vpc/public-subnet-ids
/nagiyu/shared/{env}/vpc/igw-id
/nagiyu/shared/acm/certificate-arn
/nagiyu/shared/acm/domain-name
/nagiyu/root/{env}/alb/dns-name
/nagiyu/root/{env}/alb/arn
/nagiyu/root/{env}/alb/target-group-arn
/nagiyu/root/{env}/alb/security-group-id
/nagiyu/root/{env}/ecs/cluster-name
/nagiyu/root/{env}/ecs/cluster-arn
```

#### FR3: IAM マネージドポリシーへの明示的な名前設定

現状は CDK 自動生成名（ハッシュ入り）のため ARN が予測不能。以下のポリシーに `managedPolicyName` を明示的に設定する。

| スタック | 設定する名前 |
|---|---|
| `iam-core-policy-stack.ts` | `nagiyu-deploy-policy-core` |
| `iam-application-policy-stack.ts` | `nagiyu-deploy-policy-application` |
| `iam-container-policy-stack.ts` | `nagiyu-deploy-policy-container` |
| `iam-integration-policy-stack.ts` | `nagiyu-deploy-policy-integration` |

> **注意**: `managedPolicyName` を新規設定するとリソース置き換えが発生し、IAM ユーザーが一時的に権限を失う。デプロイ時間帯に注意。

#### FR4: 共有スタックの Export を SSM 書き込みに変換

Producer 側: `CfnOutput` の `exportName` を削除し、代わりに `ssm.StringParameter` で値を書き込む。

対象ファイル:
- `shared/lib/vpc-stack.ts`（VPC ID, サブネット IDs, IGW ID, VPC CIDR）
- `shared/lib/acm-stack.ts`（ACM ARN, ドメイン名）
- `shared/lib/iam/*-policy-stack.ts`（4 ファイル）
- `shared/lib/iam/iam-users-stack.ts`

#### FR5: 消費側スタックの importValue を SSM 読み込みに変換

Consumer 側: `Fn.importValue()` を `ssm.StringParameter.valueForStringParameter()` に変換する。

> **重要**: `valueForStringParameter()` を使用する（`valueFromLookup()` ではない）。CloudFormation 実行時に解決されるため `cdk synth` で AWS API コールが不要。

対象ファイル:
- `root/alb-stack.ts`（VPC を import）
- `root/ecs-service-stack.ts`（VPC, ECS クラスター, ALB を import）
- `root/cloudfront-stack.ts`（ACM, ALB を import）
- `codec-converter/lib/codec-converter-stack.ts`（ACM, VPC を import）
- `common/src/stacks/cloudfront-stack-base.ts`（ACM フォールバック）

#### FR6: Root Domain スタックの Export を SSM 書き込みに変換

- `root/ecs-cluster-stack.ts`（クラスター名・ARN）
- `root/alb-stack.ts`（ALB DNS, ARN, ターゲットグループ ARN, SG ID）

#### FR7: addDependency() の撤廃

CloudFormation Export/importValue の依存が解消されたら、それに付随する `addDependency()` を削除する。

対象ファイル:
- `bin/nagiyu-platform.ts`
- `shared/bin/shared.ts`

#### FR8: exports.ts の廃止

`shared/libs/utils/exports.ts` の全コードを移行後に削除する。

### 非機能要件（NFR）

#### NFR1: 既存リソース名は変更しない

ARN の中身（リソース名）は現状維持。デプロイ済みリソースのリネームは行わない。

#### NFR2: `cdk synth` が AWS API コールなしで完了すること

`valueForStringParameter()` の使用により、synth 時に AWS 認証が不要な状態を維持する。

#### NFR3: 各スタックを独立デプロイ可能にすること

`cdk deploy {StackName} --exclusively` で個別スタックのデプロイが成功すること（SSM パラメータが事前に存在する前提）。

## 実装方針

### デプロイ順序の制約（移行期間中のみ）

CloudFormation Export Lock の制約により、移行は以下の順序で行う必要がある。

```
1. Consumer 側を SSM 読み込みに更新してデプロイ（先に変換）
2. Producer 側の exportName を削除して SSM 書き込みに変換してデプロイ
```

同一 CDK App 内での順序例（root domain）:
1. `ecs-service-stack`, `cloudfront-stack` を SSM 読み込みに変換 → デプロイ
2. `alb-stack`, `ecs-cluster-stack` の exportName を削除 → デプロイ

### VPC 参照の変換方法

`Vpc.fromLookup()` は synth 時に AWS API コールが必要なため廃止し、SSM + `Vpc.fromVpcAttributes()` に統一する。

```typescript
const vpcId = ssm.StringParameter.valueForStringParameter(
  this, SSM_PARAMETERS.VPC_ID(environment)
);
const publicSubnetIdsStr = ssm.StringParameter.valueForStringParameter(
  this, SSM_PARAMETERS.PUBLIC_SUBNET_IDS(environment)
);
// Fn.split は CloudFormation 実行時トークンでも動作する
const publicSubnetIds = cdk.Fn.split(',', publicSubnetIdsStr);
```

### CloudFrontStackBase の変換（高影響）

`common/src/stacks/cloudfront-stack-base.ts` の ACM フォールバック参照を SSM に変換するだけで、全サービスの CloudFront スタック（tools, auth, admin, stock-tracker, niconico）に自動で伝播する。

## 変更対象ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `common/src/utils/arn.ts` | **新規**: ARN 構築ユーティリティ |
| `common/src/utils/ssm.ts` | **新規**: SSM パラメータ名定数 |
| `common/src/index.ts` | 新規ユーティリティのエクスポート追加 |
| `shared/libs/utils/ssm.ts` | **新規**: 共有スタック側の SSM 定数 |
| `shared/libs/utils/exports.ts` | 全移行後に削除 |
| `shared/lib/vpc-stack.ts` | Export 4 件 → SSM 書き込みに変換 |
| `shared/lib/acm-stack.ts` | Export 3 件 → SSM 書き込みに変換 |
| `shared/lib/iam/iam-core-policy-stack.ts` | `managedPolicyName` 追加、exportName 削除 |
| `shared/lib/iam/iam-application-policy-stack.ts` | `managedPolicyName` 追加、exportName 削除 |
| `shared/lib/iam/iam-container-policy-stack.ts` | `managedPolicyName` 追加、exportName 削除 |
| `shared/lib/iam/iam-integration-policy-stack.ts` | `managedPolicyName` 追加、exportName 削除 |
| `shared/lib/iam/iam-users-stack.ts` | exportName 4 件削除 |
| `shared/bin/shared.ts` | `addDependency()` 削除 |
| `root/ecs-cluster-stack.ts` | Export → SSM 書き込み |
| `root/alb-stack.ts` | importValue → SSM 読み込み、Export → SSM 書き込み |
| `root/ecs-service-stack.ts` | importValue 6 件 → SSM 読み込み、exportName 削除 |
| `root/cloudfront-stack.ts` | importValue 3 件 → SSM 読み込み、exportName 削除 |
| `bin/nagiyu-platform.ts` | `addDependency()` 削除 |
| `common/src/stacks/cloudfront-stack-base.ts` | Fn.importValue → SSM 読み込み、exportName 削除 |
| `common/src/stacks/ecr-stack-base.ts` | exportName 3 件削除 |
| `common/src/stacks/lambda-stack-base.ts` | exportName 4 件削除 |
| `codec-converter/lib/codec-converter-stack.ts` | importValue → SSM、VPC 移行、exportName 削除 |
| `tools/lib/cloudfront-stack.ts` | `certificateExportName` プロパティと importValue を削除 |
| `auth/lib/dynamodb-stack.ts` | exportName 3 件削除 |
| `auth/lib/secrets-stack.ts` | exportName 4 件削除 |
| `stock-tracker/lib/dynamodb-stack.ts` | exportName 2 件削除 |
| `stock-tracker/lib/secrets-stack.ts` | exportName 6 件削除 |
| `stock-tracker/lib/lambda-stack.ts` | exportName 9 件削除 |
| `stock-tracker/lib/eventbridge-stack.ts` | exportName 3 件削除 |
| `stock-tracker/lib/iam-stack.ts` | exportName 2 件削除 |
| `stock-tracker/lib/sns-stack.ts` | exportName 2 件削除 |
| `niconico-mylist-assistant/lib/batch-stack.ts` | VPC: fromLookup → SSM + fromVpcAttributes |

## タスク分解

移行期間中の CloudFormation Export Lock 制約のため、**Consumer 側を先にデプロイしてから Producer 側の exportName を削除する** 順序を厳守する。

### フェーズ 1: ユーティリティ整備（全タスクの前提）

| # | 作業 | 対象ファイル |
|---|---|---|
| 1-1 | ARN 構築ユーティリティ新規作成 | `common/src/utils/arn.ts`（新規）、`common/src/index.ts` |
| 1-2 | SSM パラメータ名定数の新規作成 | `common/src/utils/ssm.ts`（新規）、`shared/libs/utils/ssm.ts`（新規）、`common/src/index.ts` |

### フェーズ 2: Consumer 側の移行（先にデプロイ必要）

`Fn.importValue` を `ssm.StringParameter.valueForStringParameter()` に変換する。このフェーズのデプロイが完了して初めてフェーズ 3 の Producer 側変更が可能になる。

| # | 作業 | 対象ファイル | 依存 |
|---|---|---|---|
| 2-1 | CloudFrontStackBase の ACM import → SSM 読み込み | `common/src/stacks/cloudfront-stack-base.ts` | 1-1, 1-2 |
| 2-2 | tools CloudFront の certificateExportName 削除 | `tools/lib/cloudfront-stack.ts` | 2-1 と同時 |
| 2-3 | root CloudFront の importValue → SSM | `root/cloudfront-stack.ts` | 1-2 |
| 2-4 | ECS Service Stack の importValue → SSM（VPC・クラスター・ALB） | `root/ecs-service-stack.ts` | 1-2 |
| 2-5 | ALB Stack の VPC importValue → SSM | `root/alb-stack.ts`（VPC 参照部分のみ） | 1-2 |
| 2-6 | codec-converter の importValue → SSM、VPC fromLookup → SSM | `codec-converter/lib/codec-converter-stack.ts` | 1-2 |
| 2-7 | niconico の VPC fromLookup → SSM | `niconico-mylist-assistant/lib/batch-stack.ts` | 1-2 |

> **デプロイチェックポイント**: 2-1〜2-7 をデプロイ後、フェーズ 3 へ進む。

### フェーズ 3: Producer 側の exportName 削除・SSM 書き込みへ変換

| # | 作業 | 対象ファイル | 依存 |
|---|---|---|---|
| 3-1 | ECS Cluster Stack の exportName → SSM 書き込み | `root/ecs-cluster-stack.ts` | 2-4 デプロイ済み |
| 3-2 | ALB Stack の exportName → SSM 書き込み | `root/alb-stack.ts`（Producer 部分） | 2-3, 2-4 デプロイ済み |
| 3-3 | VPC Stack の exportName → SSM 書き込み | `shared/lib/vpc-stack.ts` | 2-4, 2-5, 2-6, 2-7 デプロイ済み |
| 3-4 | ACM Stack の exportName → SSM 書き込み | `shared/lib/acm-stack.ts` | 2-1, 2-3, 2-6 デプロイ済み |

### フェーズ 4: IAM 関連の整理（フェーズ 1 完了後、独立実施可能）

> **注意**: 4-1 は `managedPolicyName` 追加によりリソース置き換えが発生する。デプロイ時間帯に注意。

| # | 作業 | 対象ファイル |
|---|---|---|
| 4-1 | IAM 4 ポリシースタックに `managedPolicyName` を明示設定 | `shared/lib/iam/iam-*-policy-stack.ts`（4 ファイル） |
| 4-2 | IAM スタック群の exportName 削除 | `shared/lib/iam/iam-*-policy-stack.ts`（4 ファイル）、`shared/lib/iam/iam-users-stack.ts` |
| 4-3 | shared bin の addDependency 削除 | `shared/bin/shared.ts` |

### フェーズ 5: Common ベースクラス・サービス別 exportName 削除（独立実施可能）

これらはクロスアプリ参照の `Fn.importValue` を持たないため、フェーズ 2〜4 と並行して実施可能。

| # | 作業 | 対象ファイル |
|---|---|---|
| 5-1 | ECR Stack Base の exportName 削除 | `common/src/stacks/ecr-stack-base.ts` |
| 5-2 | Lambda Stack Base の exportName 削除 | `common/src/stacks/lambda-stack-base.ts` |
| 5-3 | ECS Service Stack の exportName 削除 | `root/ecs-service-stack.ts`（フェーズ 2-4 と同時でも可） |
| 5-4 | auth スタック群の exportName 削除 | `auth/lib/dynamodb-stack.ts`、`auth/lib/secrets-stack.ts` |
| 5-5 | stock-tracker スタック群の exportName 削除 | `stock-tracker/lib/dynamodb-stack.ts`、`secrets-stack.ts`、`lambda-stack.ts`、`eventbridge-stack.ts`、`iam-stack.ts`、`sns-stack.ts` |

### フェーズ 6: 最終クリーンアップ（全フェーズ完了後）

| # | 作業 | 対象ファイル |
|---|---|---|
| 6-1 | root domain の addDependency 削除 | `bin/nagiyu-platform.ts` |
| 6-2 | EXPORTS 定数ファイルを削除 | `shared/libs/utils/exports.ts` |

---

## 検証方法

1. `cdk synth` が全スタックでエラーなく完了することを確認
2. `Fn.importValue` および `exportName` のキーワードが `infra/` から消えていることを Grep で確認
3. Shared スタックを先にデプロイし、SSM パラメータが正しく作成されることを確認
4. Root domain スタックをデプロイし、ECS/ALB が正常起動することを確認
5. 各サービスの CloudFront スタックをデプロイし、ACM 証明書が正しく紐付くことを確認
6. 各スタックを `cdk deploy {StackName} --exclusively` で個別デプロイし、成功することを確認
