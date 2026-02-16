# Codec Converter

## 概要

Codec Converterは、動画ファイルのコーデック変換を**ブラウザのみで**簡単に行えるWebサービスです。
ソフトウェアのインストールや専門知識なしに、MP4動画をH.264、VP9、AV1などの形式に変換できます。

アカウント登録不要で匿名利用可能な、シンプルで使いやすい動画変換サービスを提供します。

---

## ドキュメント一覧

| ドキュメント                         | 説明                                                 |
| ------------------------------------ | ---------------------------------------------------- |
| [requirements.md](./requirements.md) | ビジネス要件、機能要件、非機能要件、ユースケース     |
| [architecture.md](./architecture.md) | システムアーキテクチャ、技術スタック、設計思想       |
| [api-spec.md](./api-spec.md)         | API仕様（エンドポイント、リクエスト/レスポンス形式） |
| [deployment.md](./deployment.md)     | デプロイ手順、CI/CD、監視、障害対応                  |
| [testing.md](./testing.md)           | テスト戦略、カバレッジ目標、テストシナリオ           |
| [ui-design.md](./ui-design.md)       | UI設計、画面遷移、コンポーネント構成                 |

---

## クイックスタート

### 開発者向け

1. **要件を理解する**: [requirements.md](./requirements.md) を読む
2. **設計を確認する**: [architecture.md](./architecture.md) を読む
3. **API仕様を確認する**: [api-spec.md](./api-spec.md) を読む
4. **実装を確認する**: ソースコード (`services/codec-converter/`) を参照

### 運用担当者向け

1. **デプロイ手順を確認**: [deployment.md](./deployment.md) を読む
2. **監視・ログ確認**: CloudWatch Logs を参照
3. **障害対応**: [deployment.md](./deployment.md) の障害対応セクションを参照

---

## プロジェクト情報

- **プロジェクト名**: Codec Converter
- **リポジトリ**: nagiyu-platform monorepo
- **配置場所**: `services/codec-converter/`
- **インフラ定義**: `infra/codec-converter/`

---

## 技術スタック概要

- **フロントエンド**: Next.js 16 + TypeScript + Material-UI
- **バックエンド**: AWS Lambda (Next.js on Lambda Web Adapter)
- **変換処理**: AWS Batch (Fargate) + FFmpeg
- **ストレージ**: Amazon S3
- **データベース**: Amazon DynamoDB
- **CDN**: CloudFront
- **IaC**: AWS CDK (TypeScript)
- **共有ライブラリ**: `@nagiyu/common`, `@nagiyu/browser`, `@nagiyu/ui`, `codec-converter-core`

詳細は [architecture.md](./architecture.md) を参照してください。

---

## 主な機能

1. **動画アップロード**: MP4ファイル（最大500MB）のブラウザからのアップロード
2. **コーデック変換**: H.264、VP9、AV1への変換をAWS Batchで実行
3. **ジョブ管理**: 変換ジョブのステータス追跡（PENDING/PROCESSING/COMPLETED/FAILED）
4. **ダウンロード**: 変換完了後のファイルダウンロード（24時間保持）

詳細は [requirements.md](./requirements.md) を参照してください。

---

## 関連ドキュメント

- [プラットフォーム全体ドキュメント](../../README.md)
- [ブランチ戦略](../../branching.md)
- [インフラドキュメント](../../infra/README.md)
- [開発ガイドライン](../../development/rules.md)
- [テスト戦略 (全体方針)](../../development/testing.md)
