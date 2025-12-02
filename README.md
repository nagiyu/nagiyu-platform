# Nagiyu Platform

本リポジトリは複数のアプリケーションをモノレポとして管理する。  
AWS 上で稼働する各サービスを共通 VPC・共通基盤上で運用しつつ、各サービス個別の開発とリリースを柔軟に行う。

---

## フォルダ構成

```
infra/              # インフラ関連
|   |
|   +-- vpc/        # VPC 関連
|   |
|   +-- shared/     # 共通
|   |
|   +-- app-A/      # アプリケーション固有
|
services/           # アプリケーション
|   |
|   +-- app-A/      # アプリケーション固有
|
libs/                       # 共通ライブラリ
|   |
|   +-- typescript-common/  # TypeScript 共通
|   |
|   +-- nextjs-common/      # Next.js 共通
|
docs/       # ドキュメント関連
```
