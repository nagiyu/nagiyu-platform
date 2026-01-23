# @nagiyu/react

React統合のためのユーティリティとフック。

## 設計思想

- **React統合**: フックパターンに準拠
- **型安全性**: TypeScript strict mode
- **依存分離**: コールバックによる通知の注入
- **再利用性**: 状態管理ロジックの共通化

## 主な機能

### useAPIRequest フック

- 状態管理（data, loading, error）
- コールバック機能（onSuccess, onError）
- リトライ機能
- リセット機能

## インストール

```json
{
  "dependencies": {
    "@nagiyu/react": "workspace:*",
    "@nagiyu/common": "workspace:*"
  }
}
```

## 設計詳細

詳細は以下のドキュメントを参照：

- [APIクライアント設計思想](../../docs/development/api-client-guide.md)
- [アーキテクチャ方針](../../docs/development/architecture.md)
- [共通ライブラリ設計](../../docs/development/shared-libraries.md)

## 依存関係

- `@nagiyu/common` - APIクライアント機能
- `react` - Reactフック機能

## ライセンス

MIT License および Apache License 2.0 のデュアルライセンス。
