# さくっとクリップ (QuickClip)

## 概要

さくっとクリップ (QuickClip) は、動画ファイルをアップロードするだけで見どころ候補を自動抽出するWebサービスです。
映像の変化量・音量の大きさを分析し、視聴価値が高い区間を自動検出します。
ユーザーはWeb画面上でクリップをプレビューしながら採否を判定・時間調整し、最終的に分割クリップのZIPとしてダウンロードできます。
アカウント登録不要で匿名利用が可能です。

---

## ドキュメント一覧

| ドキュメント                               | 説明                                                         |
| ------------------------------------------ | ------------------------------------------------------------ |
| [requirements.md](./requirements.md)       | ビジネス要件、機能要件、非機能要件、ユースケース             |
| [external-design.md](./external-design.md) | 画面設計、画面遷移、概念データモデル                         |
| [architecture.md](./architecture.md)       | システム構成、コンポーネント概要、設計決定記録（ADR）        |

---

## 技術スタック概要

- **フロントエンド**: Next.js + TypeScript
- **バックエンド**: AWS Lambda (Next.js on Lambda Web Adapter)
- **解析・処理**: AWS Batch (Fargate) + FFmpeg
- **クリップ生成**: AWS Lambda (FFmpeg)
- **ZIP生成**: AWS Lambda
- **ストレージ**: Amazon S3
- **データベース**: Amazon DynamoDB
- **CDN**: Amazon CloudFront
- **IaC**: AWS CDK (TypeScript)

詳細は [architecture.md](./architecture.md) を参照してください。

---

## 主な機能

1. **動画アップロード**: 最大 20 GB の動画ファイルをアップロードしてジョブを作成する
2. **見どころ自動抽出**: 映像変化量・音量から上位 20 件の見どころ区間を自動抽出する
3. **クリッププレビュー**: 抽出された見どころをWeb画面上でプレビューする
4. **採否チェック・時間調整**: 見どころに「未確認 / 使える / 使えない」のステータスを設定し、開始・終了時刻を調整する
5. **ZIPダウンロード**: 採用した見どころの切り出しクリップをZIPでダウンロードする

詳細は [requirements.md](./requirements.md) を参照してください。

---

## 関連ドキュメント

- [プラットフォーム全体ドキュメント](../../README.md)
- [ブランチ戦略](../../branching.md)
- [インフラドキュメント](../../infra/README.md)
- [開発ガイドライン](../../development/rules.md)
