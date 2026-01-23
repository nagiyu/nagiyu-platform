# @nagiyu/common

フレームワーク非依存の共通ユーティリティライブラリ。

## 設計思想

- **完全非依存**: React、Next.js、ブラウザAPIに依存しない
- **純粋関数**: 副作用のない実装
- **型安全性**: TypeScript strict mode

## 主な機能

### APIクライアント

- リトライ機能（エクスポネンシャルバックオフ）
- エラーハンドリング（2段階マッピング）
- タイムアウト制御
- 型安全性

### 認証・認可

- ロールベースアクセス制御（RBAC）
- パーミッション管理

## インストール

```json
{
  "dependencies": {
    "@nagiyu/common": "workspace:*"
  }
}
```

## 設計詳細

詳細は以下のドキュメントを参照：

- [APIクライアント設計思想](../../docs/development/api-client-guide.md)
- [アーキテクチャ方針](../../docs/development/architecture.md)
- [共通ライブラリ設計](../../docs/development/shared-libraries.md)

## ライセンス

MIT License および Apache License 2.0 のデュアルライセンス。
