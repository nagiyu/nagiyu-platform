# Nagiyu Platform

本リポジトリは複数のアプリケーションをモノレポとして管理する。
AWS 上で稼働する各サービスを共通基盤上で運用しつつ、各サービス個別の開発とリリースを柔軟に行う。

---

## フォルダ構成

```
infra/                  # インフラ関連
|   |
|   +-- shared/         # 共通リソース
|   |   |
|   |   +-- iam/        # IAM ユーザー、ポリシー
|   |   |
|   |   +-- vpc/        # VPC 関連
|   |
|   +-- app-A/          # アプリケーション固有
|
services/               # アプリケーション
|   |
|   +-- app-A/          # アプリケーション固有
|
libs/                   # 共通ライブラリ
|   |
|   +-- common/         # 完全フレームワーク非依存の汎用ユーティリティ
|   |
|   +-- browser/        # ブラウザAPI依存のユーティリティ
|   |
|   +-- ui/             # Next.js + Material-UI 依存のUIコンポーネント
|
docs/                   # ドキュメント関連
|   |
|   +-- services/       # サービスごとの要件と仕様
|   |
|   +-- platform/       # 共通基盤の仕様 (specs/) と開発の規約 (rules/)
```

開発の規約は [docs/platform/rules/](docs/platform/rules/) を参照。
