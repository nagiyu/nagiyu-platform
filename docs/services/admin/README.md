# Admin サービス

## 概要

Admin サービスは、nagiyu プラットフォームの管理機能を提供する Web アプリケーションです。認証された管理者ユーザーが、プラットフォーム全体のユーザー管理、ログ閲覧（Phase 2）、各種設定を行うための統合ダッシュボードとして機能します。

**Phase 1** では、Auth サービスとの **SSO 連携動作確認** を主目的とした最小限のダッシュボードを実装します。シンプルなユーザー情報表示とロールベースアクセス制御（RBAC）により、認証基盤の動作を検証します。

---

## ドキュメント一覧

| ドキュメント                         | 説明                                                 |
| ------------------------------------ | ---------------------------------------------------- |
| [requirements.md](./requirements.md) | ビジネス要件、機能要件、非機能要件、ユースケース     |
| [architecture.md](./architecture.md) | システムアーキテクチャ、技術スタック、設計思想       |
| [deployment.md](./deployment.md)     | デプロイ手順、CI/CD、監視、障害対応                  |
| [testing.md](./testing.md)           | テスト戦略、カバレッジ目標、テストシナリオ           |

**注**: Admin サービスは Phase 1 では外部 API を提供しないため、api-spec.md は存在しません。将来的にユーザー管理 API などを提供する場合に作成されます。

---

## クイックスタート

### 開発者向け

1. **要件を理解する**: [requirements.md](./requirements.md) を読む
   - Phase 1 のスコープ（SSO 連携動作確認）を確認
   - ロールベースアクセス制御（RBAC）の仕様を理解
2. **設計を確認する**: [architecture.md](./architecture.md) を読む
   - Next.js + Material-UI + AWS Lambda 構成を理解
   - 認証フロー、JWT 検証の仕組みを確認
3. **実装を確認する**: ソースコード (`services/admin/web/`) を参照
   - Middleware での JWT 検証実装
   - ダッシュボード UI の実装

### 運用担当者向け

1. **デプロイ手順を確認**: [deployment.md](./deployment.md) を読む
   - CI/CD パイプライン（Fast CI / Full CI）の理解
   - 初回セットアップ手順の確認
2. **監視・ログ確認**: CloudWatch Logs を参照
   - ロググループ: `/aws/lambda/admin-{env}`
3. **障害対応**: [deployment.md](./deployment.md) の障害対応セクションを参照
   - ロールバック手順、よくある障害と対処法

---

## プロジェクト情報

- **プロジェクト名**: Admin
- **リポジトリ**: nagiyu-platform monorepo
- **配置場所**: `services/admin/web/`
- **インフラ定義**: `infra/admin/`
- **バージョン**: 0.1.0 (Phase 1 - MVP)

---

## 関連ドキュメント

- [プラットフォーム全体ドキュメント](../../README.md)
- [ブランチ戦略](../../branching.md)
- [インフラドキュメント](../../infra/README.md)
- [開発ガイドライン](../../development/rules.md)
- [Auth サービス](../auth/README.md) - SSO 連携元サービス
