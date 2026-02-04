# niconico-mylist-assistant

## 概要

ニコニコ動画のマイリスト登録を自動化する補助ツールです。事前に登録しておいた動画リストから、条件を指定してランダムに最大100個の動画を選び、マイリストに一括登録できます。手作業での1つずつの登録作業を大幅に削減し、TypeScript + Playwright による安全で安定した自動化処理により、ニコニコ動画のサーバーに配慮した適切な間隔での登録を実現します。

---

## ドキュメント一覧

| ドキュメント                         | 説明                                             |
| ------------------------------------ | ------------------------------------------------ |
| [requirements.md](./requirements.md) | ビジネス要件、機能要件、非機能要件、ユースケース |
| [architecture.md](./architecture.md) | システムアーキテクチャ、技術スタック、設計思想   |
| [api-spec.md](./api-spec.md)         | API仕様（Next.js API Routes）                    |
| [research.md](./research.md)         | 調査結果、既存実装の分析、技術検証               |
| [testing.md](./testing.md)           | テスト戦略、カバレッジ目標、テストシナリオ       |
| [deployment.md](./deployment.md)     | デプロイ手順、CI/CD、監視、障害対応              |

---

## クイックスタート

### 開発者向け

1. **要件を理解する**: [requirements.md](./requirements.md) を読む
2. **設計を確認する**: [architecture.md](./architecture.md) を読む
3. **実装を確認する**: ソースコード (`services/niconico-mylist-assistant/`) を参照

### 運用担当者向け

1. **デプロイ手順を確認**: [deployment.md](./deployment.md) を読む
2. **監視・ログ確認**: CloudWatch Logs を参照
3. **障害対応**: [deployment.md](./deployment.md) の障害対応セクションを参照

---

## プロジェクト情報

- **プロジェクト名**: niconico-mylist-assistant
- **リポジトリ**: nagiyu-platform monorepo
- **配置場所**: `services/niconico-mylist-assistant/`
- **インフラ定義**: `infra/niconico-mylist-assistant/`
- **バージョン**: 1.0.0

---

## 関連ドキュメント

- [プラットフォーム全体ドキュメント](../../README.md)
- [ブランチ戦略](../../branching.md)
- [インフラドキュメント](../../infra/README.md)
- [開発ガイドライン](../../development/rules.md)
