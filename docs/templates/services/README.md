# {service-name}

<!-- 記入ガイド: サービス名を記述してください（例: Tools アプリケーション） -->

## 概要

<!-- 記入ガイド: サービスの概要を1-2段落で記述してください -->
<!-- 記入ガイド: 何を提供するサービスか、どのような価値があるかを簡潔に説明します -->

---

## ドキュメント一覧

<!-- 記入ガイド: このサービスのドキュメント一覧を表形式で記述してください -->
<!-- 記入ガイド: 存在しないドキュメントは削除してください -->

| ドキュメント | 説明 |
| ------------ | ---- |
| [requirements.md](./requirements.md) | ビジネス要件・ユースケース・機能要件・ドメインオブジェクト |
| [external-design.md](./external-design.md) | 画面設計・概念データモデル・設計上の決定事項 <!-- [任意] --> |
| [architecture.md](./architecture.md) | アーキテクチャ設計決定記録（ADR） |

---

## クイックスタート

<!-- 記入ガイド: 開発者向けの最初のステップを記述してください -->

1. **要件を理解する**: [requirements.md](./requirements.md) を読む
2. **UI・データ構造を確認する**: [external-design.md](./external-design.md) を読む
3. **設計の意図を確認する**: [architecture.md](./architecture.md) を読む
4. **実装を確認する**: ソースコード (`services/{service-name}/`) を参照

---

## プロジェクト情報

<!-- 記入ガイド: プロジェクトの基本情報を記述してください -->
<!-- 注意: バージョン情報は package.json で一元管理するため、ここには記載しない -->

- **プロジェクト名**: {service-name}
- **リポジトリ**: nagiyu-platform monorepo
- **配置場所**: `services/{service-name}/`
- **インフラ定義**: `infra/{service-name}/`

---

## 関連ドキュメント

- [開発フロー](../../development/flow.md)
- [ブランチ戦略](../../branching.md)
- [開発ガイドライン](../../development/rules.md)
- [インフラドキュメント](../../infra/README.md)
