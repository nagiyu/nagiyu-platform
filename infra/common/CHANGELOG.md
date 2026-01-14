# Changelog

このファイルは、@nagiyu/infra-common パッケージの重要な変更を記録します。

フォーマットは [Keep a Changelog](https://keepachangelog.com/ja/1.0.0/) に基づいており、
バージョニングは [Semantic Versioning](https://semver.org/lang/ja/) に準拠しています。

---

## [1.0.0] - 2026-01-14

### 追加

#### ベーススタッククラス

- `EcrStackBase`: ECR リポジトリの共通スタック実装
    - リポジトリ作成（命名規則に従って自動生成）
    - イメージスキャン設定（デフォルト有効）
    - ライフサイクルポリシー（イメージ保持数管理）
    - 環境に応じた削除ポリシー（prod: RETAIN / dev: DESTROY）
    - CloudFormation Outputs (RepositoryName, RepositoryUri, RepositoryArn)

- `LambdaStackBase`: Lambda 関数の共通スタック実装
    - Lambda 関数作成（ECR イメージからのデプロイ）
    - 実行ロール自動作成（基本的なログ権限付き）
    - 環境変数設定
    - Function URL 作成（オプション、デフォルト有効）
    - 追加の IAM ポリシー設定 (`additionalPolicyStatements`)
    - CloudFormation Outputs (FunctionName, FunctionArn, FunctionUrl)

- `CloudFrontStackBase`: CloudFront ディストリビューションの共通スタック実装
    - CloudFront ディストリビューション作成
    - Lambda Function URL オリジン設定
    - セキュリティヘッダーポリシー作成（デフォルト有効）
    - ACM 証明書の参照
    - カスタムドメイン設定
    - TLS 1.2 以上の強制
    - HTTP/2 および HTTP/3 サポート
    - CloudFormation Outputs (DistributionId, DistributionDomainName, CustomDomainName)

#### 型定義

- `Environment`: デプロイ環境を表す型 (`'dev' | 'prod'`)
- `ServiceConfig`: サービス全体の設定
- `EcrConfig`: ECR リポジトリの設定
- `LambdaConfig`: Lambda 関数の設定
- `CloudFrontConfig`: CloudFront ディストリビューションの設定

#### 命名規則ユーティリティ

- `getResourceName()`: 汎用的なリソース名を生成 (`nagiyu-{service}-{type}-{env}`)
- `getEcrRepositoryName()`: ECR リポジトリ名を生成
- `getLambdaFunctionName()`: Lambda 関数名を生成
- `getCloudFrontDomainName()`: CloudFront ドメイン名を生成
- `getS3BucketName()`: S3 バケット名を生成
- `getDynamoDBTableName()`: DynamoDB テーブル名を生成
- `getIamRoleName()`: IAM ロール名を生成
- `getLogGroupName()`: CloudWatch Logs ロググループ名を生成

#### デフォルト値定義

- `DEFAULT_LAMBDA_CONFIG`: Lambda のデフォルト設定
    - memorySize: 512MB
    - timeout: 30秒
    - architecture: X86_64
    - runtime: nodejs20.x

- `DEFAULT_ECR_CONFIG`: ECR のデフォルト設定
    - imageScanOnPush: true
    - maxImageCount: 10
    - imageTagMutability: MUTABLE

- `DEFAULT_CLOUDFRONT_CONFIG`: CloudFront のデフォルト設定
    - enableSecurityHeaders: true
    - minimumTlsVersion: 1.2
    - enableHttp2: true
    - enableHttp3: true
    - priceClass: PriceClass_100

- `mergeConfig()`: ユーザー設定とデフォルト設定をマージするヘルパー関数

#### セキュリティヘッダー定義

- `HSTS_HEADER`: Strict-Transport-Security ヘッダー設定
    - accessControlMaxAge: 63072000 (2年間)
    - includeSubdomains: true
    - preload: true

- `CONTENT_TYPE_OPTIONS_HEADER`: X-Content-Type-Options ヘッダー設定
- `FRAME_OPTIONS_HEADER`: X-Frame-Options ヘッダー設定 (DENY)
- `XSS_PROTECTION_HEADER`: X-XSS-Protection ヘッダー設定
- `REFERRER_POLICY_HEADER`: Referrer-Policy ヘッダー設定 (strict-origin-when-cross-origin)
- `PERMISSIONS_POLICY_HEADER`: Permissions-Policy ヘッダー設定
- `SECURITY_HEADERS`: すべてのセキュリティヘッダーをまとめたオブジェクト

#### テスト

- ユニットテストスイート (Jest)
- テストカバレッジ 80%以上

#### ドキュメント

- README.md: パッケージ概要と基本的な使用方法
- 使用ガイド (`docs/infra/common-package-guide.md`): 詳細な使用方法
- マイグレーションガイド (`docs/infra/migration-guide.md`): 既存サービスの移行手順
- API リファレンス (`docs/infra/api-reference.md`): 型定義と関数の詳細

### 変更

なし

### 非推奨

なし

### 削除

なし

### 修正

なし

### セキュリティ

- CloudFront のセキュリティヘッダーがデフォルトで有効化されました
    - Strict-Transport-Security (HSTS)
    - X-Content-Type-Options
    - X-Frame-Options
    - X-XSS-Protection
    - Referrer-Policy

---

## 今後のバージョン管理方針

### バージョニングルール

本パッケージは [Semantic Versioning](https://semver.org/lang/ja/) に従います。

- **MAJOR バージョン (X.0.0)**: 互換性のない API 変更
- **MINOR バージョン (0.X.0)**: 後方互換性のある機能追加
- **PATCH バージョン (0.0.X)**: 後方互換性のあるバグ修正

### リリースプロセス

1. **変更の記録**: すべての重要な変更を CHANGELOG.md に記録
2. **バージョン更新**: package.json のバージョンを更新
3. **タグ付け**: `v1.0.0` 形式で Git タグを作成
4. **デプロイ**: npm workspace として利用可能

### 変更の分類

- **追加 (Added)**: 新機能の追加
- **変更 (Changed)**: 既存機能の変更
- **非推奨 (Deprecated)**: 今後削除予定の機能
- **削除 (Removed)**: 削除された機能
- **修正 (Fixed)**: バグ修正
- **セキュリティ (Security)**: セキュリティ修正

---

## 参考リンク

- [Keep a Changelog](https://keepachangelog.com/ja/1.0.0/)
- [Semantic Versioning](https://semver.org/lang/ja/)
- [GitHub Releases](https://github.com/nagiyu/nagiyu-platform/releases)
