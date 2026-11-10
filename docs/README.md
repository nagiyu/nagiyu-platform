# ドキュメント

このディレクトリはリポジトリのドキュメントを格納します。各ドキュメントは個別のディレクトリ・ファイルとして管理してください。

---

## プロジェクト全般

### 開発方針

本プロジェクトは**ドキュメント駆動開発**を採用しています。

- **理由**: AI主体の開発では、詳細なドキュメントが正確な実装を生成するための明確な指示書となる
- **アプローチ**: 要件定義 → 基本設計 → 実装の順で、各フェーズで1つのドキュメントに情報を集約
- **メリット**: 設計の一貫性を保ち、AIへの指示が明確になる

docs は 2 種類に分かれる。

| 種類 | 中身 | 鮮度の保ち方 |
|---|---|---|
| なぜ (ADR・設計判断) | コードからわからないこと | 人が書き、追記していく |
| 今の挙動 ([仕様カード](specs/README.md)) | コードからわかること | コードから作り直し、CI で検査する |

コードからわかることを、手で書いて保守しない。書くなら、鮮度を機械的に検査できる写し (仕様カード) として書く。

docs は https://nagiyu.github.io/nagiyu-platform/ にサイトとして公開している。更新は develop に取り込まれたときに反映される。

docs は、docs/ だけを公開する先 (GitHub Pages など) でも読める。そのため docs/ の中から docs/ の外へリンクを張らない。docs/ の外のファイル (`CLAUDE.md` など) に触れるときは、リンクにせずコード表記のパスで書く。CI のリンク検査が検出する。

また、本プロジェクトは**最小限のルール**を原則としています。

- **理由**: 過度な制約は開発の柔軟性を損ない、変化への対応を困難にする
- **アプローチ**: 必須事項のみを定め、実装の詳細は各サービスの特性に応じて判断
- **メリット**: サービスごとの最適な設計を可能にし、プラットフォーム全体の進化を促進

### ドキュメント

- [ブランチ戦略](./branching.md)

### 開発ガイドライン

- [コーディング規約・べからず集](./development/rules.md)
- [表記規約](./development/writing-style.md) - コメントと文書の記号表記 (半角化・スペース・Markdown 強調)
- [Issue の分類](./development/issue-classification.md) - タイトルの種別プレフィックス・サービスラベル・マイルストーンの使い分け
- [アーキテクチャ方針](./development/architecture.md)
- [共通設定ファイル](./development/configs.md)
- [テスト戦略](./development/testing.md)
- [共通ライブラリ設計](./development/shared-libraries.md)
- [バリデーション設計](./development/validation.md)
- [サービステンプレート](./development/service-template.md)
- [PWA設定ガイド](./development/pwa.md)
- [データベース設計パターン](./development/database-patterns.md) - DynamoDB Single Table Design と複数テーブル設計のパターン集
- [データアクセス層](./development/data-access-layer.md) - DynamoDB Repository パターンの設計思想と実装ガイドライン
- [dev-sync（prod → dev データ同期）](./development/dev-sync.md) - dev メイン運用に向けた prod→dev 同期機構の背景・戦略選定・安全設計

### AIエージェント

- [Task Proposal Agent](./agents/task.proposal.README.md) - 要件・指針ドキュメント生成エージェント
- [Docs Write Agent](./agents/docs.write.README.md) - docs/ 配下専属のドキュメント作成・更新エージェント
- [Task Implement Agent](./agents/task.implement.README.md) - ドキュメント駆動実装エージェント

## サービス

- [Tools アプリ](./services/tools/README.md)

## 共通ライブラリ

- [@nagiyu/common](./libs/common/README.md) - フレームワーク非依存の共通ライブラリ
- @nagiyu/browser - ブラウザAPI依存の共通ライブラリ
- @nagiyu/ui - Next.js + Material-UI 依存の UI コンポーネント
- @nagiyu/react - React依存のユーティリティ
- @nagiyu/nextjs - Next.js依存のユーティリティ（APIルートヘルパー等）
- @nagiyu/aws - AWS SDK 補助・拡張ライブラリ

詳細は[共通ライブラリ設計](./development/shared-libraries.md)を参照してください。

## インフラストラクチャ

- [インフラドキュメント](./infra/README.md)
- [アーキテクチャ](./infra/architecture.md)
- [初回セットアップ](./infra/setup.md)
- [デプロイ手順](./infra/deploy.md)
- [共通インフラ](./infra/shared/README.md)
