# Stock Tracker サービス

株価アラート機能を提供するサービスです。指定した銘柄の株価が目標値に達したときにメール通知を送信します。

## 概要

Stock Tracker サービスは、nagiyu プラットフォームにおける株価監視・通知機能を提供します。ユーザーは監視したい銘柄と目標株価（上限・下限）を設定し、株価が目標値に達した際にメール通知を受け取ることができます。

バッチ処理により定期的に株価データを取得し、設定されたアラート条件をチェックします。

---

## ドキュメント一覧

| ドキュメント                     | 説明                                     |
| -------------------------------- | ---------------------------------------- |
| [requirements.md](./requirements.md) | ビジネス要件、機能要件、非機能要件、ユースケース |
| [architecture.md](./architecture.md) | システムアーキテクチャ、技術スタック、設計思想   |
| [api-spec.md](./api-spec.md)     | API仕様（銘柄管理、アラート管理）          |
| [deployment.md](./deployment.md) | デプロイ手順、CI/CD、監視、障害対応        |
| [testing.md](./testing.md)       | テスト戦略、カバレッジ目標、テストシナリオ   |

---

## クイックスタート

### 開発者向け

1. **要件を理解する**: [requirements.md](./requirements.md) を読む
2. **設計を確認する**: [architecture.md](./architecture.md) を読む
3. **API仕様を確認する**: [api-spec.md](./api-spec.md) を読む
4. **実装を確認する**: ソースコード (`services/stock-tracker/`) を参照

### 運用担当者向け

1. **デプロイ手順を確認**: [deployment.md](./deployment.md) を読む
2. **監視・ログ確認**: CloudWatch Logs を参照
3. **障害対応**: [deployment.md](./deployment.md) の障害対応セクションを参照

---

## プロジェクト情報

- **プロジェクト名**: Stock Tracker サービス
- **リポジトリ**: nagiyu-platform monorepo
- **配置場所**: `services/stock-tracker/`
- **インフラ定義**: `infra/stock-tracker/`

---

## 主要機能

### Phase 1: 基本機能

- ✅ 銘柄の追加・削除・一覧表示
- ✅ アラート条件の設定（上限・下限株価）
- ✅ 定期的な株価チェック（バッチ処理）
- ✅ 条件達成時のメール通知
- ✅ PWA 対応（オフライン対応、インストール可能）

### 今後の拡張予定

- 📋 複数の通知チャネル（LINE、Slack等）
- 📋 より高度なアラート条件（変動率、出来高など）
- 📋 株価履歴のグラフ表示
- 📋 ポートフォリオ管理機能

---

## 技術スタック

- **フロントエンド**: Next.js 15, React, Material-UI
- **バックエンド**: AWS Lambda (Node.js)
- **データベース**: DynamoDB
- **バッチ処理**: AWS Batch, EventBridge Scheduler
- **認証**: Auth サービス（JWT）
- **通知**: AWS SES
- **インフラ**: AWS CDK

---

## 関連サービス

- [Admin サービス](../admin/README.md) - 管理画面
- [Auth サービス](../auth/README.md) - 認証・認可

---

## 参考資料

### プラットフォーム共通

- [コーディング規約](../../development/rules.md)
- [アーキテクチャガイドライン](../../development/architecture.md)
- [テスト戦略](../../development/testing.md)
- [ブランチ戦略](../../branching.md)

### インフラ

- [インフラドキュメント](../../infra/README.md)
- [デプロイ手順](../../infra/deploy.md)
