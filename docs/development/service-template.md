# 新サービステンプレート

## 目的

本ドキュメントは、プラットフォームに新しいサービスを追加する際の標準構成とルールを定義する。

## 基本方針

- **スマホファースト**: デフォルトでモバイル対応を前提
- **パッケージ分離**: core/web/batch でビジネスロジックとUIを分離
- **共通設定の継承**: configs/ の設定を extends して一貫性を保つ
- **テスト必須**: ユニットテストとE2Eテストを実装

## ディレクトリ構造

### 標準構成（core/web/batch パターン）

```
services/{service-name}/
├── core/                       # ビジネスロジック（Unit Test 必須）
│   ├── src/
│   │   └── index.ts            # エクスポート定義
│   ├── tests/
│   │   └── unit/               # ユニットテスト
│   ├── package.json
│   ├── tsconfig.json
│   └── eslint.config.mjs
├── web/                        # Next.js UI（E2E Test 主体）
│   ├── src/
│   │   ├── app/                # Next.js App Router
│   │   │   ├── api/health/     # ヘルスチェック (必須)
│   │   │   ├── layout.tsx      # ルートレイアウト
│   │   │   └── page.tsx        # ホームページ
│   │   ├── components/         # UIコンポーネント（推奨）
│   │   └── types/              # 型定義（推奨）
│   ├── e2e/                    # E2Eテスト
│   ├── public/                 # 静的ファイル
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.ts
│   ├── playwright.config.ts
│   └── eslint.config.mjs
└── batch/                      # バッチ処理（任意）
    ├── src/
    │   └── index.ts            # エントリーポイント
    ├── tests/
    │   └── integration/        # 統合テスト
    ├── package.json
    ├── tsconfig.json
    └── eslint.config.mjs
```

### 拡張パターン

複数のWebアプリやバッチ処理が必要な場合、ハイフン区切りで拡張する。

```
services/{service-name}/
├── core/
├── web/                        # メインWebアプリ
├── web-admin/                  # 管理画面
├── web-api/                    # API サーバー
├── batch/                      # メインバッチ
├── batch-daily/                # 日次バッチ
└── batch-hourly/               # 時間毎バッチ
```

**命名規則**:

- ハイフン区切り（`web-admin`, `batch-daily`）
- 小文字のみ使用
- 役割を明確に表す名前

## 必須設定ファイル

### package.json

#### パッケージ名の命名規則

**core パッケージ**:

- フォーマット: `{service-name}-core`
- 例: `tools-core`, `auth-core`

**web パッケージ**:

- フォーマット: `{service-name}-web`
- 例: `tools-web`, `auth-web`

**batch パッケージ**:

- フォーマット: `{service-name}-batch`
- 例: `tools-batch`, `auth-batch`

**拡張パッケージ**:

- フォーマット: `{service-name}-{type}-{suffix}`
- 例: `tools-web-admin`, `tools-batch-daily`

#### バージョン管理

- 各パッケージで独立管理（1.0.0から開始）
- セマンティックバージョニングに従う

#### core パッケージのスクリプト標準

```json
{
  "name": "{service-name}-core",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/src/index.js",
  "types": "dist/src/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "lint": "eslint src/**/*.ts tests/**/*.ts",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

#### web パッケージのスクリプト標準

```json
{
  "name": "{service-name}-web",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build --webpack",
    "start": "next start",
    "lint": "eslint",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  }
}
```

#### batch パッケージのスクリプト標準

```json
{
  "name": "{service-name}-batch",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/src/index.js",
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "lint": "eslint src/**/*.ts tests/**/*.ts",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

### TypeScript 設定

#### core パッケージの tsconfig.json

```json
{
  "extends": "../../../configs/tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2020"],
    "composite": true,
    "declaration": true,
    "outDir": "./dist"
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist"],
  "references": [{ "path": "../../../libs/common" }]
}
```

**ポイント**:

- `composite: true` を設定（他パッケージから参照されるため）
- `declaration: true` で型定義ファイルを出力
- `references` で依存パッケージを指定
- path alias は使用しない（相対パスを使用）

#### web パッケージの tsconfig.json

```json
{
  "extends": "../../../configs/tsconfig.base.json",
  "compilerOptions": {
    "lib": ["DOM", "DOM.Iterable", "ES2020"],
    "jsx": "preserve",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"],
  "references": [
    { "path": "../core" },
    { "path": "../../../libs/ui" },
    { "path": "../../../libs/browser" },
    { "path": "../../../libs/common" }
  ]
}
```

**ポイント**:

- `composite` は設定しない（Next.jsが独自にビルド）
- path alias (`@/*`) の使用可能
- 依存するすべてのパッケージを `references` に記載

#### batch パッケージの tsconfig.json

```json
{
  "extends": "../../../configs/tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2020"],
    "composite": true,
    "declaration": true,
    "outDir": "./dist"
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist"],
  "references": [{ "path": "../core" }, { "path": "../../../libs/common" }]
}
```

**ポイント**:

- core と同様に `composite: true` を設定
- core パッケージへの参照を追加

### TypeScript Project References の利点

- **増分ビルドによる高速化**: 変更されたパッケージのみビルド
- **パッケージ間の型情報の共有**: エディタでの型補完が改善
- **依存関係の明確化**: どのパッケージがどのパッケージに依存しているか明確

### ESLint 設定

#### core パッケージの境界保護

`core` パッケージでは UI フレームワークのインポートを禁止する。

```javascript
// core/eslint.config.mjs
import baseConfig from '../../../configs/eslint.config.base.mjs';

export default [
  ...baseConfig,
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'next', 'next/*'],
              message:
                'core パッケージでは UI フレームワークを使用できません。ビジネスロジックのみを実装してください。',
            },
            {
              group: ['@mui/*'],
              message: 'core パッケージでは Material-UI を使用できません。',
            },
          ],
        },
      ],
    },
  },
];
```

#### web パッケージと batch パッケージ

```javascript
// web/eslint.config.mjs または batch/eslint.config.mjs
import baseConfig from '../../../configs/eslint.config.base.mjs';

export default baseConfig;
```

### 設定ファイルの継承

各設定は `configs/` の共通設定を extends する。詳細は [configs.md](./configs.md) を参照。

## テスト戦略

### core パッケージ

**テスト種別**: Unit Test（Jest）

**テスト対象**:

- ビジネスロジック
- データ変換処理
- バリデーション
- エラーハンドリング

**カバレッジ目標**: 80%以上必須

**配置**:

```
services/{service}/core/
└── tests/
    └── unit/
        ├── parser.test.ts
        └── formatter.test.ts
```

### web パッケージ

**テスト種別**: E2E Test（Playwright）主体

**テスト対象**:

- ユーザーフロー
- クリティカルパス
- PWA機能（オフライン動作、インストール）

**テストデバイス**:

- chromium-desktop（Desktop Chrome 1920x1080）
- chromium-mobile（モバイルChrome Pixel 5想定）
- webkit-mobile（モバイルSafari iPhone想定）

**配置**:

```
services/{service}/web/
└── e2e/
    ├── basic.spec.ts
    └── pwa.spec.ts
```

**補足**: Unit Test は必要に応じて実施（複雑なUIロジックがある場合）

### batch パッケージ

**テスト種別**: Integration Test（Jest）

**テスト対象**:

- バッチ処理フロー
- 外部API連携（モック使用）
- エラーハンドリング

**配置**:

```
services/{service}/batch/
└── tests/
    └── integration/
        └── batch.test.ts
```

詳細は [testing.md](./testing.md) を参照。

## ビルド戦略

### ビルドの必要性

| パッケージ | ビルド要否 | 理由                                            |
| ---------- | ---------- | ----------------------------------------------- |
| `core`     | ✅ 必須    | Lambda 等で利用するため、トランスパイルが必要   |
| `web`      | ❌ 不要    | Next.js が実行時にビルド                        |
| `batch`    | ✅ 必須    | Lambda にデプロイするため、トランスパイルが必要 |

### CI ビルド順序

依存関係に基づき、以下の順序でビルドする。

**順序**:

1. **共通ライブラリ（依存なし）**

   ```bash
   npm run build --workspace @nagiyu/common
   ```

2. **ブラウザライブラリ（common に依存）**

   ```bash
   npm run build --workspace @nagiyu/browser
   ```

3. **UI ライブラリ（browser に依存）**

   ```bash
   npm run build --workspace @nagiyu/ui
   ```

4. **サービス core（common に依存）**

   ```bash
   npm run build --workspace {service-name}-core
   ```

5. **サービス batch（core に依存）**

   ```bash
   npm run build --workspace {service-name}-batch
   ```

6. **サービス web（Next.js ビルド、任意）**
   ```bash
   npm run build --workspace {service-name}-web
   ```

**重要な注意点**:

- 並列ビルド（`npm run build --workspaces`）は禁止（依存関係の順序が保証されない）
- 順次ビルドを実施（`&&` で連結）

詳細は [monorepo-structure.md](./monorepo-structure.md) の「ビルド戦略」セクションを参照。

## PWA 設定（web パッケージ）

### デフォルトで有効

スマホファースト思想により、デフォルトでPWA対応を推奨。

### 必須ファイル（PWA対応時）

- `src/app/offline/page.tsx`: オフラインフォールバック
- `public/manifest.json`: PWAマニフェスト
- `public/icon-192x192.png`, `public/icon-512x512.png`: アイコン

### 無効化が必要なケース

- 認証必須の管理画面
- サーバーサイドレンダリングが重要な場合

詳細は [pwa.md](./pwa.md) を参照。

## ヘルスチェック API（web パッケージ）

### 必須実装

全サービスの web パッケージで `src/app/api/health/route.ts` を実装（Lambda監視用）。

### 実装例

```typescript
export async function GET() {
  return Response.json({
    status: 'ok',
    version: process.env.APP_VERSION || 'unknown',
  });
}
```

## 依存関係の管理

### 依存方向の原則

```
web → core → libs/common
    → libs/ui → libs/browser → libs/common

batch → core → libs/common
```

**重要な原則**:

- **一方向性**: 依存は常に下位レイヤー（より汎用的なパッケージ）へ向かう
- **循環依存禁止**: 上位パッケージから下位パッケージへの依存のみ許可
- **core の独立性**: core パッケージは UI フレームワークに依存しない

### 禁止パターン

```
❌ core → web                    # 逆方向の依存
❌ core → libs/ui                # UI への依存
❌ core → libs/browser           # Browser API への依存
❌ services/{serviceA}/core → services/{serviceB}/core  # サービス間の直接依存
```

### 依存関係の追加方法

**core パッケージへの依存追加**:

```bash
cd services/{service-name}/web
npm install ../core
```

**共通ライブラリへの依存追加**:

```bash
cd services/{service-name}/core
npm install @nagiyu/common
```

詳細は [monorepo-structure.md](./monorepo-structure.md) の「依存関係ルール」セクションを参照。

## 環境変数

### パッケージ単位での管理

環境変数は各パッケージの配下に配置（デプロイ先が異なるため）。

```
services/{service}/
├── core/
│   └── .env.local          # core 固有の環境変数（開発用）
├── web/
│   └── .env.local          # web 固有の環境変数（開発用）
└── batch/
    └── .env.local          # batch 固有の環境変数（開発用）
```

### APP_VERSION（web パッケージ）

- `package.json` の version をビルド時に注入
- Footer、Health APIで使用

## 新サービス追加チェックリスト

### Phase 1: ディレクトリ構造の作成

- [ ] `services/{service-name}/core/` ディレクトリ作成
  - [ ] `src/index.ts` 作成（エクスポート定義）
  - [ ] `tests/unit/` ディレクトリ作成
  - [ ] `package.json` 作成（`{service-name}-core`）
  - [ ] `tsconfig.json` 作成（`composite: true`）
  - [ ] `eslint.config.mjs` 作成（境界保護設定）
  - [ ] `jest.config.ts` 作成

- [ ] `services/{service-name}/web/` ディレクトリ作成
  - [ ] `src/app/` ディレクトリ作成
  - [ ] `src/app/api/health/route.ts` 実装
  - [ ] `src/app/layout.tsx` 作成
  - [ ] `src/app/page.tsx` 作成
  - [ ] `e2e/` ディレクトリ作成
  - [ ] `public/` ディレクトリ作成
  - [ ] `package.json` 作成（`{service-name}-web`）
  - [ ] `tsconfig.json` 作成（references 設定）
  - [ ] `next.config.ts` 作成
  - [ ] `playwright.config.ts` 作成
  - [ ] `eslint.config.mjs` 作成

- [ ] `services/{service-name}/batch/` ディレクトリ作成（必要に応じて）
  - [ ] `src/index.ts` 作成（エントリーポイント）
  - [ ] `tests/integration/` ディレクトリ作成
  - [ ] `package.json` 作成（`{service-name}-batch`）
  - [ ] `tsconfig.json` 作成（`composite: true`, references 設定）
  - [ ] `eslint.config.mjs` 作成
  - [ ] `jest.config.ts` 作成

### Phase 2: 設定ファイルの整備

- [ ] `configs/` の共通設定を extends
  - [ ] `tsconfig.base.json` を extends
  - [ ] `eslint.config.base.mjs` を extends
  - [ ] `.prettierrc` を継承

- [ ] TypeScript Project References を設定
  - [ ] core: `libs/common` への参照
  - [ ] web: `core`, `libs/ui`, `libs/browser`, `libs/common` への参照
  - [ ] batch: `core`, `libs/common` への参照

- [ ] 依存関係のインストール
  - [ ] core: `npm install @nagiyu/common`
  - [ ] web: `npm install ../core @nagiyu/ui @nagiyu/browser @nagiyu/common`
  - [ ] batch: `npm install ../core @nagiyu/common`

### Phase 3: 実装と検証

- [ ] ヘルスチェック API を実装（web）
- [ ] PWA対応可否を判断・実装（web）
- [ ] ユニットテストを `tests/unit/` に配置（core, batch）
- [ ] E2Eテストを `e2e/` に配置（web）
- [ ] package.json に標準スクリプトを定義
- [ ] README.md を作成（サービス固有の説明）

### Phase 4: ビルドとテスト

- [ ] core パッケージのビルドが成功すること

  ```bash
  npm run build --workspace {service-name}-core
  ```

- [ ] batch パッケージのビルドが成功すること（存在する場合）

  ```bash
  npm run build --workspace {service-name}-batch
  ```

- [ ] ユニットテストがパスすること

  ```bash
  npm run test --workspace {service-name}-core
  npm run test --workspace {service-name}-batch  # 存在する場合
  ```

- [ ] E2Eテストがパスすること

  ```bash
  npm run test:e2e --workspace {service-name}-web
  ```

- [ ] リントエラーがないこと
  ```bash
  npm run lint --workspaces --if-present
  ```

## 参考

- [monorepo-structure.md](./monorepo-structure.md): モノレポ構成の全体像、依存関係ルール
- [rules.md](./rules.md): コーディング規約・べからず集
- [architecture.md](./architecture.md): アーキテクチャ方針、レイヤー分離
- [testing.md](./testing.md): テスト戦略、カバレッジ目標
- [shared-libraries.md](./shared-libraries.md): 共通ライブラリ設計
- [configs.md](./configs.md): 共通設定ファイルの詳細
- [pwa.md](./pwa.md): PWA対応の詳細
