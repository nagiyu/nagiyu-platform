# @nagiyu/ui

Next.js + Material-UI 依存のUIコンポーネントライブラリ。

## 概要

`@nagiyu/ui` は、Nagiyu プラットフォームで共有するUIコンポーネントを提供するライブラリです。
Next.js 16 と Material-UI 7 を使用した、モダンで再利用可能なコンポーネントを含んでいます。

## 技術スタック

- **React**: 19.x
- **Next.js**: 16.x
- **Material-UI**: 7.x
- **Emotion**: スタイリングエンジン
- **TypeScript**: 厳格な型チェック

## インストール

このライブラリはワークスペース内のパッケージとして利用されます。

```json
{
    "dependencies": {
        "@nagiyu/ui": "*"
    }
}
```

## 使用方法

```typescript
import {} from /* components will be exported here */ '@nagiyu/ui';
```

### 依存関係

`@nagiyu/ui` は以下のパッケージに依存しています：

- `@nagiyu/browser`: ブラウザAPI抽象化ライブラリ
- React, Next.js, Material-UI (peerDependencies)

## 開発

### ビルド

```bash
npm run build
```

### テスト

```bash
npm test                # 全テスト実行
npm run test:watch      # ウォッチモード
npm run test:coverage   # カバレッジ計測
```

### リント・フォーマット

```bash
npm run lint            # ESLint実行
npm run format          # Prettierでフォーマット
npm run format:check    # フォーマットチェック
```

## 設計原則

### 汎用性

コンポーネントは複数のサービスで利用可能な汎用性を持ちます。
サービス固有のロジックは props として注入できるようにします。

### Client Component

すべてのコンポーネントは Client Component として実装されます。
必要に応じて `'use client'` ディレクティブを使用します。

### 相対パスのみ

ライブラリ内部では相対パスのみを使用し、パスエイリアス（`@/`等）は使用しません。

## ディレクトリ構造

```
libs/ui/
├── src/
│   ├── index.ts              # エクスポートファイル
│   ├── components/           # UIコンポーネント（今後追加予定）
│   └── styles/               # テーマ・スタイル定義（今後追加予定）
├── tests/
│   ├── unit/                 # ユニットテスト
│   └── setup.ts              # テストセットアップ
├── package.json
├── tsconfig.json
├── jest.config.ts
└── README.md
```

## テスト戦略

- **フレームワーク**: Jest + Testing Library
- **環境**: jsdom (ブラウザDOM環境のシミュレーション)
- **カバレッジ目標**: 80%以上
