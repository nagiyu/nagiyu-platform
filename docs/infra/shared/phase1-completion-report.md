# Phase 1: VPC CDK 移行 - 完了レポート

## 実施日
2026-01-09

## サマリー

VPC リソースの CloudFormation から CDK への移行を完了しました。実装は完了し、デプロイ準備が整っています。

## 実施内容

### 1. CDK プロジェクトのセットアップ ✅

新規ディレクトリ `infra/shared/` に CDK プロジェクトを作成しました。

**作成ファイル**:
- `package.json` - NPM 依存関係の定義
- `tsconfig.json` - TypeScript コンパイラ設定
- `cdk.json` - CDK アプリケーション設定
- `.gitignore` - Git 除外設定
- `README.md` - プロジェクトドキュメント

**依存関係**:
```json
{
  "aws-cdk-lib": "^2.172.0",
  "constructs": "^10.4.2"
}
```

### 2. VPC スタックの実装 ✅

**ファイル**: `infra/shared/lib/vpc-stack.ts`

**実装アプローチ**:
- **L1 Constructs** (`CfnXxx`) を使用
- 論理 ID を既存 CloudFormation と完全一致
- Export 名を既存 CloudFormation と完全一致
- スタック名を既存と一致: `nagiyu-shared-vpc-{env}`

**リソース**:
- VPC (論理ID: `NagiyuVPC`)
- Internet Gateway (`NagiyuInternetGateway`)
- VPC Gateway Attachment (`NagiyuVPCGatewayAttachment`)
- Public Subnet 1a (`NagiyuPublicSubnet1a`)
- Public Subnet 1b - prod のみ (`NagiyuPublicSubnet1b`)
- Route Table (`NagiyuPublicRouteTable`)
- Route (`NagiyuPublicRoute`)
- Route Table Associations

**環境別設定**:
| 項目 | dev | prod |
|-----|-----|------|
| VPC CIDR | 10.0.0.0/24 | 10.1.0.0/24 |
| AZ 数 | 1 (us-east-1a) | 2 (us-east-1a, 1b) |
| Subnet 1a CIDR | 10.0.0.0/24 | 10.1.0.0/25 |
| Subnet 1b CIDR | なし | 10.1.128.0/25 |

### 3. エントリーポイントの作成 ✅

**ファイル**: `infra/shared/bin/shared.ts`

- コンテキストから環境 (dev/prod) を取得
- 環境に応じた VPC スタックを生成
- スタック名を既存の CloudFormation 名と一致

### 4. ドキュメントの作成 ✅

**作成ドキュメント**:

1. **`infra/shared/README.md`**
   - プロジェクト概要
   - セットアップ手順
   - デプロイ手順
   - トラブルシューティング

2. **`docs/infra/shared/vpc-cdk-migration.md`**
   - 移行の背景と目的
   - 実装アプローチの詳細
   - CloudFormation との差分分析
   - デプロイ手順（段階的）
   - ロールバック手順

## 検証結果

### ✅ ビルド検証

```bash
cd infra/shared
npm run build
# → 成功: TypeScript コンパイル完了
```

### ✅ Synth 検証

```bash
# dev 環境
npm run synth -- --context env=dev
# → 成功: CloudFormation テンプレート生成

# prod 環境
npm run synth -- --context env=prod
# → 成功: CloudFormation テンプレート生成
```

### ✅ 論理 ID の一致確認

既存の CloudFormation テンプレートと CDK 生成テンプレートで、すべてのリソースの論理 ID が一致していることを確認しました。

**確認済みリソース**:
- NagiyuVPC
- NagiyuInternetGateway
- NagiyuVPCGatewayAttachment
- NagiyuPublicSubnet1a
- NagiyuPublicSubnet1b (prod)
- NagiyuPublicRouteTable
- NagiyuPublicRoute
- NagiyuPublicSubnet1aRouteTableAssociation
- NagiyuPublicSubnet1bRouteTableAssociation (prod)

### ✅ Export 名の一致確認

**dev 環境**:
- `nagiyu-dev-vpc-id`
- `nagiyu-dev-public-subnet-ids`
- `nagiyu-dev-igw-id`
- `nagiyu-dev-vpc-cidr`

**prod 環境**:
- `nagiyu-prod-vpc-id`
- `nagiyu-prod-public-subnet-ids`
- `nagiyu-prod-igw-id`
- `nagiyu-prod-vpc-cidr`

### ✅ コードレビュー

- 型安全性の改善を実施
- 非 null アサーション (`!`) を削除
- 変数参照を明示化

### ✅ セキュリティチェック

CodeQL によるセキュリティスキャン実施:
- **結果**: 0 件のアラート
- **ステータス**: ✅ 問題なし

## CloudFormation との差分

### 主な差分

1. **CDK Metadata リソース**
   - CDK が自動的に追加
   - 分析目的のメタデータ
   - 実際のインフラに影響なし

2. **タグの順序**
   - CloudFormation: Name, Application, Environment
   - CDK: Application, Environment, Name
   - AWS 側では順序は無関係

3. **Metadata セクション**
   - `aws:cdk:path` が追加される
   - CDK の内部管理用
   - 実際のインフラに影響なし

### 機能的に同等

論理 ID、リソース構成、Export 名がすべて一致しているため、機能的には完全に同等です。

## デプロイ準備

### 前提条件

- AWS 認証情報の設定
- CDK Bootstrap の完了
- 適切な IAM 権限

### デプロイコマンド

```bash
cd infra/shared

# dev 環境
npm run diff -- nagiyu-shared-vpc-dev --context env=dev
npm run deploy -- nagiyu-shared-vpc-dev --context env=dev

# prod 環境
npm run diff -- nagiyu-shared-vpc-prod --context env=prod
npm run deploy -- nagiyu-shared-vpc-prod --context env=prod
```

### 検証コマンド

```bash
# Export の確認
aws cloudformation list-exports \
  --query "Exports[?starts_with(Name, 'nagiyu-dev-vpc')].{Name:Name,Value:Value}" \
  --output table

# 既存サービスとの互換性確認
cd ../root
npm run diff -- --context env=dev
```

## リスクと緩和策

### リスク 1: リソースの再作成

**リスク**: 論理 ID が変わるとリソースが再作成される

**緩和策**: 
- L1 Constructs で論理 ID を完全制御
- デプロイ前に `cdk diff` で確認

### リスク 2: Export の不一致

**リスク**: Export 名が変わると他のスタックがエラー

**緩和策**:
- Export 名を定数で管理 (`EXPORTS`)
- デプロイ前に既存の Export と照合

### リスク 3: 既存スタックとの競合

**リスク**: 同名のスタックが既に存在する

**対応**:
- スタック名を既存と一致させた: `nagiyu-shared-vpc-{env}`
- CDK は既存スタックを更新する形になる

## 推奨デプロイ戦略

### ステップ 1: dev 環境での検証

1. `cdk diff` で変更内容を確認
2. 差分がないことを確認（理想）
3. デプロイを実行
4. Export 値を確認
5. 既存サービス（root）の動作確認

### ステップ 2: 監視期間

1. dev 環境で 1-2 日間監視
2. 問題がないことを確認

### ステップ 3: prod 環境へのロールアウト

1. dev と同じ手順で実施
2. より慎重に監視

### ステップ 4: クリーンアップ

1. 1 週間程度安定稼働を確認
2. 元の CloudFormation テンプレートをバックアップ
   ```bash
   mv infra/shared/vpc/vpc.yaml infra/shared/vpc/vpc.yaml.bak
   ```

## 今後の展開

### Phase 2: ACM の CDK 移行

VPC の移行が成功したら、次は ACM (証明書) の移行を検討します。

### Phase 3: IAM の CDK 移行

その後、IAM ポリシーとユーザーの移行を実施します。

## 学んだこと

### L1 vs L2 Constructs

- **L1 Constructs**: 既存リソースの移行に最適
- **L2 Constructs**: 新規リソースの作成に最適

### スタック名の重要性

CDK のスタック ID を既存の CloudFormation スタック名と一致させることで、スムーズな移行が可能になります。

### Export 名の管理

Export 名を定数で管理することで、typo を防ぎ、保守性が向上します。

## 結論

Phase 1 の VPC CDK 移行は完了しました。実装は完全で、デプロイ準備が整っています。

**次のアクション**:
- dev 環境へのデプロイ実施
- 動作確認
- prod 環境へのロールアウト

---

## 関連ファイル

- 実装: `infra/shared/lib/vpc-stack.ts`
- エントリーポイント: `infra/shared/bin/shared.ts`
- ドキュメント: `docs/infra/shared/vpc-cdk-migration.md`
- README: `infra/shared/README.md`

## 作成者

GitHub Copilot Agent

## レビュー状態

- [x] コードレビュー完了
- [x] セキュリティチェック完了
- [x] ドキュメント作成完了
- [ ] デプロイ実施（保留中）
