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
|   +-- ui/             # Next.js + Material-UI コンポーネント
|   |
|   +-- browser/        # ブラウザ API ラッパー
|   |
|   +-- common/         # フレームワーク非依存ユーティリティ
|
docs/                   # ドキュメント関連
|   |
|   +-- infra/          # インフラドキュメント
|   |   |
|   |   +-- shared/     # 共通インフラのドキュメント
|   |
|   +-- development/    # 開発ガイドライン
```

## 共通ライブラリ

Nagiyu Platform では、サービス間でコードを共有するための共通ライブラリを提供しています。

### ライブラリ一覧

| ライブラリ | バージョン | 説明 | ドキュメント |
|-----------|----------|------|------------|
| **@nagiyu/ui** | 1.0.0 | Next.js + Material-UI ベースの UI コンポーネント（Header, Footer, theme） | [libs/ui/README.md](libs/ui/README.md) |
| **@nagiyu/browser** | 1.0.0 | ブラウザ API ラッパー（clipboard, localStorage） | [libs/browser/README.md](libs/browser/README.md) |
| **@nagiyu/common** | 1.0.0 | フレームワーク非依存の汎用ユーティリティ | [libs/common/README.md](libs/common/README.md) |

### ライブラリの特徴

- **依存関係の明確化**: `ui` → `browser` → `common` の一方向依存
- **モノレポ管理**: workspace プロトコルで効率的な開発
- **型安全性**: TypeScript による厳格な型定義
- **テスト完備**: 80%以上のカバレッジを維持

### 使用方法

各サービスの `package.json` で必要なライブラリを参照:

```json
{
  "dependencies": {
    "@nagiyu/ui": "workspace:*",
    "@nagiyu/browser": "workspace:*",
    "@nagiyu/common": "workspace:*"
  }
}
```

詳細な利用方法は以下を参照:
- [共通ライブラリ設計ドキュメント](docs/development/shared-libraries.md)
- [サービステンプレート](docs/development/service-template.md)
