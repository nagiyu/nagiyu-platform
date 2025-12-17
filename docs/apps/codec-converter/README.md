# Codec Converter

動画ファイルをアップロードして、コーデックを変換する Web アプリケーションサービス。

---

## ドキュメント一覧

### サービス仕様

- [要件定義](./requirements.md) - サービスの要件と仕様

### 設計

- [アーキテクチャ](./architecture.md) - システム全体の設計と構成（作成予定）

### インフラストラクチャ

- [インフラ概要](./infra/README.md) - インフラリソースの説明（作成予定）
- [デプロイ手順](./infra/deployment.md) - デプロイ方法（作成予定）

### 開発

- [CI ワークフロー](./ci.md) - GitHub Actions CI の設定と使い方
- 開発環境セットアップ（作成予定）
- API 仕様（作成予定）

---

## 概要

Codec Converter は、ユーザーが動画ファイルをアップロードし、希望するコーデックに変換するサービスです。

### 主な機能

- 動画ファイルのアップロード
- コーデック変換処理
- 変換済み動画のダウンロード
- ジョブステータスの確認

### 技術スタック

- **フロントエンド**: Next.js + Lambda Web Adapter
- **動画処理**: AWS Batch
- **ストレージ**: Amazon S3
- **ジョブ管理**: Amazon DynamoDB
- **配信**: CloudFront

---

## 関連ドキュメント

- [プラットフォームアーキテクチャ](../../infra/architecture.md)
- [共通インフラ](../../infra/shared/README.md)
