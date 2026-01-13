# Tools アプリケーション

## 概要

Toolsアプリは、便利なツールを集約したWebアプリケーションです。
JSONフォーマッター、Base64エンコーダー、乗り換え案内変換など、日常的な作業で使用する小さなツールを、ブラウザ上で手軽に利用できます。

---

## ドキュメント一覧

| ドキュメント | 説明 |
|------------|------|
| [requirements.md](./requirements.md) | ビジネス要件、機能要件、非機能要件、ユースケース |
| [architecture.md](./architecture.md) | システムアーキテクチャ、技術スタック、設計思想 |
| [deployment.md](./deployment.md) | デプロイ手順、CI/CD、監視、障害対応 |
| [testing.md](./testing.md) | テスト戦略、カバレッジ目標、テストシナリオ |
| [tools-catalog.md](./tools-catalog.md) | 実装済みツール一覧（サービス固有） |

---

## クイックスタート

### 開発者向け

1. **要件を理解する**: [requirements.md](./requirements.md) を読む
2. **設計を確認する**: [architecture.md](./architecture.md) を読む
3. **実装を確認する**: ソースコード (`services/tools/`) を参照

### 運用担当者向け

1. **デプロイ手順を確認**: [deployment.md](./deployment.md) を読む
2. **監視・ログ確認**: CloudWatch Logs を参照
3. **障害対応**: [deployment.md](./deployment.md) の障害対応セクションを参照

---

## プロジェクト情報

- **プロジェクト名**: Tools
- **リポジトリ**: nagiyu-platform monorepo
- **配置場所**: `services/tools/`
- **インフラ定義**: `infra/tools/`
- **バージョン**: 1.0.0

---

## 関連ドキュメント

- [プラットフォーム全体ドキュメント](../../README.md)
- [ブランチ戦略](../../branching.md)
- [インフラドキュメント](../../infra/README.md)
- [開発ガイドライン](../../development/rules.md)
