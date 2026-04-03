# みんなでシェアリスト (Share Together)

複数ユーザー間で ToDo を共有できるサービスです。個人の ToDo リスト管理に加えて、グループを作成してメンバー間で共有リストを運用できます。nagiyu プラットフォームの Auth サービスと連携し、シングルサインオンで利用できます。

## ドキュメント一覧

| ドキュメント                               | 説明                             |
| ------------------------------------------ | -------------------------------- |
| [README.md](./README.md)                   | サービス概要（このドキュメント） |
| [architecture.md](./architecture.md)       | アーキテクチャ設計と技術的な方針 |
| [requirements.md](./requirements.md)       | 機能要件・ユースケース・ドメインオブジェクト |
| [external-design.md](./external-design.md) | 画面設計・概念データモデル |

## プロジェクト情報

- **プロジェクト名**: みんなでシェアリスト (Share Together)
- **リポジトリ**: nagiyu-platform monorepo
- **配置場所**: `services/share-together/`
- **インフラ定義**: `infra/share-together/`
- **ドメイン**: `share-together.nagiyu.com`（prod）/ `dev-share-together.nagiyu.com`（dev）

## 主要機能

### MVP 実装済み

- ✅ Auth サービスとの SSO 認証（JWT/Cookie 共有）
- ✅ 個人 ToDo リストの作成・編集・削除（デフォルトリスト自動生成）
- ✅ 個人リスト内の ToDo 追加・編集・削除・完了管理
- ✅ グループの作成・招待・参加・脱退・メンバー除外・削除
- ✅ グループ共有 ToDo リストの作成・閲覧・編集・削除
- ✅ サービス内通知によるグループ招待受信
- ✅ PWA 対応（manifest + service worker シェル）

### 将来拡張予定

- 📋 ToDo への期限設定・期限ベースのプッシュ通知
- 📋 ToDo へのコメント・添付ファイル
- 📋 リアルタイム同期（WebSocket 等）
- 📋 グループ内の細分化されたロール・権限管理
- 📋 ToDo のカテゴリ・タグ分類

## 技術スタック

- **フロントエンド**: Next.js 15, React 19, Material-UI v6
- **バックエンド**: AWS Lambda（Node.js、コンテナイメージ）
- **データベース**: Amazon DynamoDB（シングルテーブル設計）
- **認証**: Auth サービス（JWT/Cookie 共有、NextAuth v5）
- **インフラ**: Amazon CloudFront, AWS ECR, AWS CDK

## 参考資料

### プラットフォーム共通

- [コーディング規約](../../development/rules.md)
- [アーキテクチャガイドライン](../../development/architecture.md)
- [認証ガイド](../../development/authentication.md)
- [データアクセス層](../../development/data-access-layer.md)
- [テスト戦略](../../development/testing.md)
- [ブランチ戦略](../../branching.md)

### インフラ

- [インフラドキュメント](../../infra/README.md)
