# 共通設定ファイル

## 目的

本ドキュメントは、プラットフォームにおける共通設定ファイルの管理方針と利用方法を定義する。

## 基本方針

- **設定の一元管理**: モノレポ全体で統一された設定を維持
- **継承による拡張**: 各サービスは共通設定を extends して利用
- **カスタマイズ可能**: サービス固有の要件に応じて上書き可能

## 共通設定ファイルの配置

### configs/ ディレクトリ

```
configs/
├── tsconfig.base.json      # TypeScript基本設定
└── eslint.config.base.mjs  # ESLint基本設定
```

### モノレポルート

```
.prettierrc                 # Prettier設定（全体で統一）
```

## TypeScript設定

### configs/tsconfig.base.json

#### 含まれる設定

- `strict: true`: 厳格な型チェック
- `target: ES2020`: ターゲットECMAScriptバージョン
- `jsx: "preserve"`: Next.js対応
- `moduleResolution: "bundler"`: モダンなモジュール解決

#### 各サービスでの使用

サービスの tsconfig.json で extends。

```json
{
    "extends": "../../configs/tsconfig.base.json",
    "compilerOptions": {
        "paths": {
            "@/*": ["./src/*"]
        }
    }
}
```

#### 各ライブラリでの使用

ライブラリの tsconfig.json で extends。

```json
{
    "extends": "../../configs/tsconfig.base.json",
    "compilerOptions": {
        "lib": ["ES2020", "DOM"],
        "declaration": true,
        "outDir": "./dist"
    },
    "include": ["src/**/*", "tests/**/*"],
    "exclude": ["node_modules", "dist"]
}
```

**ビルド出力構造**:
- ビルド出力は `dist/src/` と `dist/tests/` に分かれる
- `package.json` の `exports` で `"./dist/src/index.js"` を指定することで、利用側は `dist/src/` を意識不要

#### サービスとライブラリの違い

| 項目 | サービス | ライブラリ |
|------|---------|----------|
| `include` | `**/*.ts`, `**/*.tsx` | `src/**/*`, `tests/**/*` |
| `exclude` | `node_modules`, `e2e` | `node_modules`, `dist` |
| `rootDir` | 指定しない | 指定しない |
| ビルド出力 | `dist/**/*` | `dist/src/**/*`, `dist/tests/**/*` |
| エントリーポイント | - | `dist/src/index.js` |
| テスト型チェック | 対象に含まれる | 対象に含まれる |

**設計思想**:
- **サービス**: Next.js 環境全体を型チェック対象に含める
- **ライブラリ**: `src` と `tests` のみを明示的に指定（配布用ライブラリとしての明確性）
- **ライブラリのビルド出力**: `rootDir` を指定しないことで TypeScript が自動的に `dist/src/` に出力。`package.json` の `exports` で利用側に透過的
- **共通**: テストコードも型チェック対象に含めることで品質を担保

#### カスタマイズポイント

- `paths`: サービス固有のパスエイリアス（ライブラリでは使用不可）
- `include/exclude`: 対象ファイルの調整

## ESLint設定

### configs/eslint.config.base.mjs

#### 含まれる設定

- ESLint v9 Flat Config形式
- Next.js公式ルールセット
- TypeScript対応
- PWA生成ファイルの除外

#### 各サービスでの使用

サービスの eslint.config.mjs で import。

```javascript
import baseConfig from '../../configs/eslint.config.base.mjs';

export default [
    ...baseConfig,
    // サービス固有のルール追加
];
```

#### Lint対象範囲

- **本番コード**: `src/**/*.ts`, `src/**/*.tsx`
- **テストコード**: `tests/**/*.ts`, `tests/**/*.tsx`

テストコードも Lint の対象に含めることで、コード品質を一貫して保ちます。

#### カスタマイズポイント

- サービス固有のルール追加
- 特定ファイルの除外

## Jest設定

### 独立管理の方針

Jestは各サービス・ライブラリで独自に jest.config.ts を管理。

#### 理由

- TypeScript設定ファイルからのESMインポートに技術的制約
- テスト環境がサービス/ライブラリごとに異なる（jsdom vs node）
- Next.js等のフレームワーク固有の設定が必要

#### 推奨される共通設定

各jest.config.tsに以下の設定を含めることを推奨:

```typescript
{
    // Exclude monorepo root from module scanning
    modulePathIgnorePatterns: ['<rootDir>/../../package.json'],
    // Common coverage settings
    coverageDirectory: 'coverage',
    collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts'],
}
```

## Prettier設定

### .prettierrc（モノレポルート）

#### 設定方針

- **全体で統一**: すべてのサービス・ライブラリで同じ設定
- **上書き不可**: サービスごとのカスタマイズは行わない

#### 含まれる設定

- `semi: true`: セミコロン必須
- `singleQuote: true`: シングルクォート使用
- `printWidth: 100`: 行幅100文字
- `tabWidth: 2`: インデント2スペース

#### 理由

コードスタイルの統一により、プラットフォーム全体の可読性とメンテナンス性を向上。

## Playwright設定

### 独立管理の方針

Playwrightは各サービスで独自に playwright.config.ts を管理。

#### 理由

- テストシナリオがサービス固有
- デバイス設定やbaseURLがサービスごとに異なる
- 共通化のメリットが少ない

#### 推奨事項

- CI最適化設定（workers, retries）は統一
- トレース・スクリーンショット設定は統一

## カスタマイズが必要な場合

### 原則

共通設定で対応できない場合のみカスタマイズ。

### 手順

1. 共通設定を extends
2. 必要な設定のみ上書き・追加
3. カスタマイズ理由をコメントで記載

### 例

```typescript
// jest.config.ts
import baseConfig from '../../configs/jest.config.base';

const config = {
    ...baseConfig,
    // 特殊なモジュールのトランスフォーム設定が必要なため
    transformIgnorePatterns: [
        'node_modules/(?!(some-esm-module)/)',
    ],
};
```

## 設定ファイルの更新

### 共通設定の変更

- 全サービスに影響するため慎重に判断
- 破壊的変更は段階的に導入
- 変更理由と影響範囲を明確化

### サービス固有の変更

- そのサービスのみに影響
- 自由に変更可能

## 参考

- [rules.md](./rules.md): コーディング規約・べからず集
- [service-template.md](./service-template.md): サービステンプレート
- [architecture.md](./architecture.md): アーキテクチャ方針
- [testing.md](./testing.md): テスト戦略
