# インフラ共通パッケージ化 - プロジェクト概要

## 背景

### 現状の問題点

インフラストラクチャコードは現在、以下の問題を抱えています：

1. **スタック実装の重複（75%以上）**
    - ECRStack: 各サービスで43行の同一実装が4箇所
    - LambdaStack: 各サービスで60-70%が重複
    - CloudFrontStack: 各サービスで50-60%が重複
    - 参照:
        - `infra/tools/lib/ecr-stack.ts` (43行)
        - `infra/auth/lib/ecr-stack.ts` (43行)
        - `infra/admin/lib/ecr-stack.ts` (43行)

2. **リソース命名規則の不統一**
    - Tools: `tools-app-{env}`
    - Auth: `nagiyu-auth-{env}`
    - Admin: `nagiyu-admin-{env}`
    - Codec-Converter: 設定可能（デフォルト: `codec-converter-{env}`）

3. **セキュリティ設定の不整合**
    - Auth/Admin: セキュリティヘッダー適用済み ✓
    - Tools/Root: セキュリティヘッダー未適用 ✗
    - Codec-Converter: セキュリティヘッダー未適用 ✗
    - 参照:
        - `infra/auth/lib/cloudfront-stack.ts` (L40-60)
        - `infra/tools/lib/cloudfront-stack.ts` (ヘッダー設定なし)

4. **デフォルト値の散在**
    - Lambda メモリサイズ: 512MB or 1024MB
    - Lambda タイムアウト: 30秒（統一）
    - ECR ライフサイクル: 10個（統一）
    - しかし、各サービスで個別に定義されている

5. **shared/ の役割が曖昧**
    - 共有AWSリソース（VPC, IAM, ACM）を定義
    - 一方で `libs/utils/exports.ts` のようなユーティリティも含む
    - 参照: `infra/shared/lib/` および `infra/shared/libs/utils/`

### アプリケーション側との不整合

アプリケーション側は既に共通ライブラリ化されています：

| 領域 | パッケージ構造 |
|-----|-------------|
| **アプリケーション** | `@nagiyu/common`, `@nagiyu/browser`, `@nagiyu/ui` |
| **インフラ** | パッケージ化された共通ライブラリなし |

参考実装:
- `libs/common/` - フレームワーク非依存の共通ライブラリ
- `libs/browser/` - ブラウザAPI依存のライブラリ
- `libs/ui/` - Next.js + Material-UI 依存のライブラリ

## プロジェクト目標

### 主要目標

1. **コードの重複排除**
    - スタック実装を共通化し、50-60%のコード削減
    - DRY原則の徹底

2. **一貫性の確保**
    - リソース命名規則の統一
    - セキュリティ設定の標準化
    - デフォルト値の一元管理

3. **メンテナンス性の向上**
    - 設定変更が1箇所で完結
    - 新規サービス追加が容易
    - libs/* との構造的一貫性

4. **型安全性の確保**
    - TypeScriptによる型安全な設定管理
    - コンパイル時のエラー検出

### 具体的な成果物

- [ ] `@nagiyu/infra-common` パッケージ
- [ ] 共通スタック実装（ECR, Lambda, CloudFront等）
- [ ] リソース命名規則クラス
- [ ] デフォルト設定定義
- [ ] セキュリティヘッダー設定
- [ ] ServiceStackBuilder（ビルダーパターン）
- [ ] 包括的なドキュメント
- [ ] サンプルコード

## スコープ

### 対象範囲

#### 新規作成
```
infra/common/                      # 新設: @nagiyu/infra-common
├── src/
│   ├── stacks/                   # 共通スタック実装
│   │   ├── ecr-stack-base.ts
│   │   ├── lambda-stack-base.ts
│   │   ├── cloudfront-stack-base.ts
│   │   ├── dynamodb-stack-base.ts
│   │   ├── s3-stack-base.ts
│   │   └── service-stack-builder.ts
│   ├── constructs/               # L3 Construct（再利用可能な部品）
│   │   ├── lambda-function.ts
│   │   ├── ecr-repository.ts
│   │   └── cloudfront-distribution.ts
│   ├── configs/                  # 設定管理
│   │   ├── naming.ts
│   │   ├── defaults.ts
│   │   ├── security-headers.ts
│   │   └── env-variables-builder.ts
│   ├── types/                    # 型定義
│   │   ├── service-config.ts
│   │   ├── stack-config.ts
│   │   └── environment.ts
│   └── utils/                    # ユーティリティ
│       ├── exports.ts            # shared/から移動
│       ├── context.ts
│       └── removal-policy.ts
├── package.json
├── tsconfig.json
└── README.md
```

#### 既存サービスの移行
- `infra/tools/` - 共通スタックを利用するように変更
- `infra/auth/` - 共通スタックを利用するように変更
- `infra/admin/` - 共通スタックを利用するように変更
- `infra/codec-converter/` - 共通スタックを利用するように変更

#### shared/ の整理
- `infra/shared/libs/utils/exports.ts` → `@nagiyu/infra-common/utils/exports.ts` へ移動
- `infra/shared/` は共有AWSリソース（VPC, IAM, ACM）の定義のみに集中

### 対象外

以下は本プロジェクトのスコープ外です：

- 既存リソースの削除（既存リソース名は維持）
- 共有リソース（VPC, IAM, ACM）の変更
- デプロイパイプラインの大幅な変更
- 新機能の追加

## アーキテクチャ設計

### パッケージ構造

```
infra/
├── common/                    # 新設: @nagiyu/infra-common
│   ├── src/
│   │   ├── stacks/           # 共通スタック実装
│   │   ├── constructs/       # 再利用可能なL3 Construct
│   │   ├── configs/          # 命名規則、デフォルト値、セキュリティヘッダー
│   │   ├── types/            # TypeScript型定義
│   │   └── utils/            # Export名、Context等
│   ├── package.json
│   └── tsconfig.json
│
├── shared/                    # 既存: @nagiyu/shared-infra
│   └── (VPC, IAM, ACM等の共有リソース定義のみ)
│
├── tools/                     # @nagiyu/infra-tools
├── auth/                      # @nagiyu/infra-auth
├── admin/                     # @nagiyu/infra-admin
└── codec-converter/           # @nagiyu/infra-codec-converter
```

### 役割分担

| パッケージ | 役割 | 内容 |
|-----------|------|------|
| **@nagiyu/infra-common** | 共通ロジック・ユーティリティ | スタック実装、Construct、型定義、命名規則 |
| **@nagiyu/shared-infra** | 共有AWS リソース | VPC, IAM, ACM（全サービスで使用） |
| **@nagiyu/infra-{service}** | サービス固有インフラ | 各サービスのスタック定義 |

### 設計原則

1. **最小限のルール**: 必須事項のみを定め、実装の詳細は柔軟に判断
2. **オプショナル優先**: ほとんどのパラメータをオプショナルにし、デフォルト値を提供
3. **拡張性**: サービス固有の設定を `additionalPolicies`, `additionalBehaviors` 等で追加可能に
4. **型安全性**: TypeScriptの型システムを活用し、コンパイル時にエラー検出

### 使用イメージ

#### Before（現状）
```typescript
// infra/tools/lib/ecr-stack.ts (43行)
export class EcrStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EcrStackProps) {
    super(scope, id, props);

    // 43行の実装...
    const repository = new ecr.Repository(this, 'Repository', {
      repositoryName: `tools-app-${environment}`,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.MUTABLE,
      lifecycleRules: [/* ... */],
      removalPolicy: environment === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });
  }
}
```

#### After（提案）
```typescript
// infra/tools/lib/tools-stack.ts (15行程度)
import { ServiceStackBuilder } from '@nagiyu/infra-common';

export class ToolsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    const builder = new ServiceStackBuilder(this, {
      serviceName: 'tools',
      environment: props.environment,
      lambda: {
        memorySize: 1024,  // デフォルト512から変更
        environment: {
          APP_VERSION: process.env.APP_VERSION || 'unknown',
        },
      },
      cloudfront: {
        enableSecurityHeaders: true,  // 新たに追加
      },
    });

    builder.build();
  }
}
```

## フェーズ構成

### Phase 1: 基盤構築（1-2週間）

**目的**: パッケージ作成と基本構造の確立

**主要タスク**:
- パッケージディレクトリ作成
- package.json, tsconfig.json 設定
- 型定義の作成
- 命名規則クラスの実装
- デフォルト値の定義
- ユーティリティ実装

**成果物**:
- `@nagiyu/infra-common` パッケージ基盤
- 型定義（ServiceConfig, StackConfig等）
- ResourceNaming クラス
- デフォルト値定義
- ユニットテスト


### Phase 2: 共通スタック実装（2-3週間）

**目的**: ECR, Lambda, CloudFront の共通スタック作成

**主要タスク**:
- EcrStackBase の実装
- LambdaStackBase の実装
- CloudFrontStackBase の実装
- セキュリティヘッダー設定の実装
- 環境変数ビルダーの実装

**成果物**:
- 共通スタック実装
- セキュリティヘッダー設定
- 環境変数ビルダー
- ユニットテスト


### Phase 3: 既存サービス移行（2-3週間）

**目的**: 既存サービスを共通スタックに移行

**主要タスク**:
- tools サービスの移行（1サービス目、参考実装）
- auth サービスの移行（DynamoDB, Secrets Manager対応）
- admin サービスの移行
- codec-converter サービスの移行（最も複雑、Batch対応）
- 各移行後のテスト実施（`cdk synth`, `cdk diff` 確認）

**成果物**:
- 移行済みの各サービス
- 動作確認済みインフラ
- 移行時の知見ドキュメント

**移行手順**:
1. 既存スタックのバックアップ（`cdk synth` 出力保存）
2. 新しいスタック実装（`@nagiyu/infra-common` 使用）
3. `cdk diff` で差分確認
4. dev環境でテストデプロイ
5. 動作確認
6. prod環境へのデプロイ

### Phase 4: 高度な機能（2-3週間）

**目的**: ServiceStackBuilder と L3 Constructs の実装

**主要タスク**:
- ServiceStackBuilder（ビルダーパターン）実装
    - 簡潔な設定で全スタックを一括作成
    - 15-20行程度で完結する設定
- L3 Constructs 作成
    - 再利用可能な高レベルコンポーネント
    - `LambdaFunction`, `EcrRepository`, `CloudFrontDistribution`
- DynamoDB, S3 等の追加スタック実装
- 包括的なテスト
    - ユニットテスト（カバレッジ80%以上）
    - 統合テスト（CDK Template検証）

**成果物**:
- ServiceStackBuilder
- 再利用可能な L3 Constructs
- 追加の共通スタック（DynamoDB, S3）
- 包括的なテストスイート

**実装例**:
```typescript
// 15行程度で完結
const builder = new ServiceStackBuilder(this, {
  serviceName: 'tools',
  environment: 'dev',
  lambda: { memorySize: 1024 },
  cloudfront: { enableSecurityHeaders: true },
});
builder.build();
```


### Phase 5: ドキュメント整備（1週間）

**目的**: 使用ガイドとサンプルコードの作成

**主要タスク**:
- `infra/common/README.md` 作成
    - パッケージ概要
    - インストール方法
    - 基本的な使用例
- 使用ガイド作成
    - 各スタックの詳細な使い方
    - カスタマイズ方法
    - トラブルシューティング
- サンプルコード追加
    - シンプルなサービス例
    - 複雑なサービス例（auth, codec-converter）
- 移行ガイド作成
    - 既存サービスの移行手順
    - チェックリスト
- API ドキュメント整備
    - 型定義のコメント追加
    - TSDoc形式での記述

**成果物**:
- 充実したドキュメント
- サンプルコード
- 移行ガイド
- APIドキュメント

## 推定工数

### 全フェーズ実施

| Phase | 推定工数 | 備考 |
|-------|---------|------|
| Phase 1 | 1-2週間 | 基盤構築 |
| Phase 2 | 2-3週間 | 共通スタック実装 |
| Phase 3 | 2-3週間 | 既存サービス移行（1サービス/週） |
| Phase 4 | 2-3週間 | 高度な機能 |
| Phase 5 | 1週間 | ドキュメント整備 |
| **合計** | **8-12週間** | |

### 最小構成（MVP）

段階的に実施する場合、以下の最小構成でも効果を得られます：

| Phase | 推定工数 | 備考 |
|-------|---------|------|
| Phase 1 | 1-2週間 | 基盤構築 |
| Phase 2.1 | 1週間 | ECRStack のみ |
| Phase 3.1 | 3-5日 | tools移行のみ |
| **合計** | **2.5-3.5週間** | |

その後、残りのフェーズを順次実施できます。

## 依存関係

### 前提条件

- AWS CDK 2.x がインストールされていること
- TypeScript 環境が整っていること
- npm でのパッケージ管理が可能なこと
- 既存インフラが正常に動作していること

### 外部依存

このプロジェクトは以下に依存します：

- AWS CDK (`aws-cdk-lib` ^2.233.0)
- Constructs (`constructs` ^10.4.4)
- TypeScript (^5.7.3)

### フェーズ間の依存関係

```
Phase 1 (基盤構築)
    ↓
Phase 2 (共通スタック実装)
    ↓
Phase 3 (既存サービス移行) ※段階的に1サービスずつ
    ↓
Phase 4 (高度な機能)
    ↓
Phase 5 (ドキュメント整備)
```

**注**: Phase 3 は段階的に実施可能（tools → auth → admin → codec-converter）

## 期待される効果

### 1. コード削減

| 項目 | 現状 | 削減後 | 削減率 |
|-----|------|--------|--------|
| ECRStack | 129行（43行×3） | 50行 | 約60% |
| LambdaStack | 推定200行 | 100行 | 約50% |
| CloudFrontStack | 推定250行 | 120行 | 約50% |
| **合計** | **約580行** | **約270行** | **約53%** |

### 2. メンテナンス性向上

- **変更の局所化**: セキュリティヘッダーの変更が1箇所で完結
- **一貫性の保証**: 全サービスで同じ設定が自動適用
- **新規サービス追加**: 設定ファイル（15-20行）のみで追加可能

### 3. 品質向上

- **セキュリティ**: セキュリティヘッダーが全サービスに標準適用
- **命名規則**: リソース名が統一され、識別が容易
- **型安全性**: TypeScript による設定の型チェック

### 4. 拡張性

- **新しいスタックタイプ**: DynamoDB, S3 等を容易に追加
- **カスタマイズ**: サービス固有の設定を柔軟に追加可能

## リスクと対策

### リスク1: 既存インフラへの影響

**影響度**: 高
**発生確率**: 中

**対策**:
- Phase 3 で段階的に移行（1サービスずつ）
- 新規リソース名は統一、既存リソース名は維持
- 各移行後に動作確認とテスト実施
- ロールバック手順の準備

### リスク2: 設計の柔軟性不足

**影響度**: 中
**発生確率**: 中

**対策**:
- オプショナルなパラメータを多用
- `additionalPolicies`, `additionalBehaviors` 等で拡張可能に
- codec-converter のような複雑なケースも考慮した設計

### リスク3: 学習コスト

**影響度**: 低
**発生確率**: 高

**対策**:
- Phase 5 で詳細なドキュメント作成
- サンプルコードの提供
- 段階的な導入により学習時間を確保

### リスク4: パフォーマンスへの影響

**影響度**: 低
**発生確率**: 低

**対策**:
- 共通化はビルド時の処理のみ（ランタイムに影響なし）
- CDK のビルド時間の監視

## 成功基準

このプロジェクトは以下の基準を満たした場合に成功とみなします：

### 必須基準

- [ ] `@nagiyu/infra-common` パッケージが正常にビルドできる
- [ ] 全サービスが共通スタックを利用できる
- [ ] リソース命名規則が `nagiyu-{service}-{type}-{env}` で統一されている
- [ ] セキュリティヘッダーが全サービスに適用されている
- [ ] 既存インフラが正常に動作する（破壊的変更なし）
- [ ] `cdk synth` が全サービスで成功する
- [ ] `cdk deploy` が全サービスで成功する

### 推奨基準

- [ ] ServiceStackBuilder で簡潔な設定（15-20行）が可能
- [ ] 包括的なテストカバレッジ（80%以上）
- [ ] 充実したドキュメント（README, 使用ガイド、サンプル）
- [ ] コード削減率が50%以上

## 技術的な考慮事項

### 命名規則の統一

すべてのリソースは `nagiyu-{service}-{type}-{env}` パターンで命名：
- ECR: `nagiyu-tools-ecr-dev`
- Lambda: `nagiyu-auth-lambda-prod`
- CloudFront: `tools.nagiyu.com` (prod), `dev-tools.nagiyu.com` (dev)

### デフォルト値の一元管理

以下をデフォルト値として定義（オーバーライド可能）：
- Lambda: メモリ512MB、タイムアウト30秒、X86_64
- ECR: イメージスキャン有効、10個保持
- CloudFront: セキュリティヘッダー有効、TLS 1.2、HTTP/2+3

### セキュリティ設定の標準化

すべてのCloudFrontディストリビューションに以下を適用：
- Strict-Transport-Security
- X-Content-Type-Options
- X-Frame-Options (DENY)
- X-XSS-Protection
- Referrer-Policy

### 型定義の基本構造

```typescript
interface ServiceConfig {
  serviceName: string;
  environment: 'dev' | 'prod';
  ecr?: EcrConfig;
  lambda?: LambdaConfig;
  cloudfront?: CloudFrontConfig;
  // ... 必要に応じて追加
}
```

すべての設定項目はオプショナルとし、デフォルト値で動作することを基本とする。

## 次のステップ

1. このドキュメントをレビュー
2. Phase 1 から実装開始
3. 実装しながら必要に応じて設計を調整
4. 定期的な進捗確認とレビュー

## 関連リソース

### 既存実装の参考

- Codec-Converter カスタムロール: `infra/codec-converter/lib/policies/`, `infra/codec-converter/lib/roles/`
- Export名管理: `infra/shared/libs/utils/exports.ts`
- アプリケーション側共通ライブラリ: `libs/common/`, `libs/browser/`, `libs/ui/`

### AWS CDK

- 公式ドキュメント: https://docs.aws.amazon.com/cdk/
- バージョン: 2.233.0

### TypeScript

- 公式ドキュメント: https://www.typescriptlang.org/
- バージョン: 5.7.3
