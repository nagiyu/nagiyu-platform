# Stock Tracker

## 概要

Stock Tracker サービスは、nagiyu プラットフォームにおける株価監視・通知機能を提供します。ユーザーは監視したい銘柄と目標株価（上限・下限）を設定し、株価が目標値に達した際に Web Push 通知を受け取ることができます。

バッチ処理により定期的に株価データを取得し、設定されたアラート条件をチェックします。

---

## ドキュメント一覧

| ドキュメント | 説明 |
| ------------ | ---- |
| [requirements.md](./requirements.md) | ビジネス要件・ユースケース・機能要件・ドメインオブジェクト |
| [external-design.md](./external-design.md) | 画面設計・概念データモデル・設計上の決定事項 |
| [architecture.md](./architecture.md) | アーキテクチャ設計決定記録（ADR） |

---

## クイックスタート

1. **要件を理解する**: [requirements.md](./requirements.md) を読む
2. **画面・データ構造を把握する**: [external-design.md](./external-design.md) を読む
3. **設計の意図を確認する**: [architecture.md](./architecture.md) を読む
4. **実装を確認する**: ソースコード (`services/stock-tracker/`) を参照

---

## プロジェクト情報

- **プロジェクト名**: Stock Tracker
- **リポジトリ**: nagiyu-platform monorepo
- **配置場所**: `services/stock-tracker/`
- **インフラ定義**: `infra/stock-tracker/`

---

## 関連ドキュメント

- [開発フロー](../../development/flow.md)
- [ブランチ戦略](../../branching.md)
- [開発ガイドライン](../../development/rules.md)
- [インフラドキュメント](../../infra/README.md)
