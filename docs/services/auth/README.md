# Auth サービス

認証・認可の中核を担うサービスです。Google OAuth によるシングルサインオン (SSO) と、ロールベースアクセス制御 (RBAC) を提供します。

## 概要

Auth サービスは、nagiyu プラットフォームにおける認証・認可機能を一元管理します。Google OAuth 2.0 による外部認証を提供し、JWT トークンを用いたステートレスなセッション管理を実現します。発行された JWT は `.nagiyu.com` ドメイン全体で共有され、他のサービス (admin, tools など) でシームレスなシングルサインオンを実現します。

Phase 1 では、Google OAuth 認証、ユーザー管理、ロール・権限管理の基本機能を提供します。

---

## ドキュメント一覧

| ドキュメント                                         | 説明                                                 |
| ---------------------------------------------------- | ---------------------------------------------------- |
| [requirements.md](./requirements.md)                 | ビジネス要件、機能要件、非機能要件、ユースケース     |
| [architecture.md](./architecture.md)                 | システムアーキテクチャ、技術スタック、設計思想       |
| [api-spec.md](./api-spec.md)                         | API仕様（認証、ユーザー管理、ヘルスチェック）        |
| [deployment.md](./deployment.md)                     | デプロイ手順、CI/CD、監視、障害対応                  |
| [testing.md](./testing.md)                           | テスト戦略、カバレッジ目標、テストシナリオ           |
| [roles-and-permissions.md](./roles-and-permissions.md) | ロール・権限定義（サービス固有ドキュメント）         |

---

## クイックスタート

### 開発者向け

1. **要件を理解する**: [requirements.md](./requirements.md) を読む
2. **設計を確認する**: [architecture.md](./architecture.md) を読む
3. **API仕様を確認する**: [api-spec.md](./api-spec.md) を読む
4. **実装を確認する**: ソースコード (`services/auth/`) を参照

### 運用担当者向け

1. **デプロイ手順を確認**: [deployment.md](./deployment.md) を読む
2. **監視・ログ確認**: CloudWatch Logs を参照（`/aws/lambda/auth-{env}`）
3. **障害対応**: [deployment.md](./deployment.md) の障害対応セクションを参照

---

## プロジェクト情報

- **プロジェクト名**: Auth サービス
- **リポジトリ**: nagiyu-platform monorepo
- **配置場所**: `services/auth/`
- **インフラ定義**: `infra/auth/`

---

## 主要機能

### Phase 1 で提供される機能

- **Google OAuth 認証**: Google アカウントによるログイン
- **JWT トークン発行**: ステートレスな認証トークン
- **シングルサインオン (SSO)**: `.nagiyu.com` ドメイン全体での認証共有
- **ユーザー管理**: プラットフォーム共通ユーザー情報の管理
- **ロール・権限管理**: RBAC によるアクセス制御
- **ユーザー管理API**: ユーザー一覧、詳細、更新、削除

### Phase 2 以降で追加予定

- GitHub OAuth 対応
- メールアドレス + パスワード認証
- 多要素認証 (MFA)
- 監査ログ機能

---

## 技術スタック概要

- **フロントエンド**: Next.js 16 + TypeScript + Material-UI
- **認証ライブラリ**: NextAuth.js 5 (beta)
- **データベース**: Amazon DynamoDB
- **コンピューティング**: AWS Lambda (コンテナ)
- **CDN**: Amazon CloudFront
- **IaC**: AWS CDK (TypeScript)

詳細は [architecture.md](./architecture.md) を参照してください。

---

## 関連ドキュメント

- [プラットフォーム全体ドキュメント](../../README.md)
- [ブランチ戦略](../../branching.md)
- [インフラドキュメント](../../infra/README.md)
- [開発ガイドライン](../../development/rules.md)
- [テスト戦略 (全体方針)](../../development/testing.md)
- [Admin サービス](../admin/README.md)
