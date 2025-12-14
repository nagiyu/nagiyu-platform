# Tools アプリケーション

## 概要

Toolsアプリは、開発者向けの便利なツールを集約したWebアプリケーションです。
JSONフォーマッター、Base64エンコーダー、ハッシュジェネレーターなど、日常的な開発作業で使用する小さなツールを、ブラウザ上で手軽に利用できます。

---

## ドキュメント一覧

本プロジェクトのドキュメントは、ウォーターフォール型開発プロセスに沿って整理されています。

### 開発プロセスドキュメント

| フェーズ | ドキュメント | 説明 |
|---------|------------|------|
| 要件定義 | [requirements.md](./requirements.md) | ビジネス要件、機能要件、非機能要件、ユースケース |
| 基本設計 | [basic-design.md](./basic-design.md) | システムアーキテクチャ、インフラ設計、API設計、画面設計 |
| 詳細設計 | [detailed-design.md](./detailed-design.md) | フロントエンド/バックエンド詳細設計、個別ツール仕様 |
| 実装 | [implementation.md](./implementation.md) | 開発環境構築、コーディング規約、AI開発ガイド |
| テスト | [testing.md](./testing.md) | テスト計画、テスト仕様、テスト実施手順 |
| デプロイ・運用 | [deployment.md](./deployment.md) | デプロイ手順、CI/CD、監視、障害対応 |

### 補足資料

| ドキュメント | 説明 |
|------------|------|
| [appendix/glossary.md](./appendix/glossary.md) | プロジェクト用語集 |
| [appendix/decision-log.md](./appendix/decision-log.md) | 設計判断記録（ADR） |
| [appendix/tools-catalog.md](./appendix/tools-catalog.md) | 実装済みツール一覧と仕様 |

---

## クイックスタート

### 開発者向け

1. **要件を理解する**: [requirements.md](./requirements.md) を読む
2. **設計を確認する**: [basic-design.md](./basic-design.md) と [detailed-design.md](./detailed-design.md) を読む
3. **環境を構築する**: [implementation.md](./implementation.md) の手順に従う
4. **開発を開始する**: コーディング規約とAI開発ガイドを参照

### 運用担当者向け

1. **デプロイ手順を確認**: [deployment.md](./deployment.md) を読む
2. **監視設定を確認**: 監視・アラートセクションを参照
3. **障害対応フローを理解**: 障害対応セクションを参照

---

## プロジェクト情報

- **プロジェクト名**: Tools
- **リポジトリ**: nagiyu-platform monorepo
- **配置場所**: `services/tools/` (将来)
- **インフラ定義**: `infra/tools/` (将来)

---

## 関連ドキュメント

- [プラットフォーム全体ドキュメント](../../README.md)
- [ブランチ戦略](../../branching.md)
- [インフラドキュメント](../../infra/README.md)
