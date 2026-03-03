# Nagiyu Platform 開発ガイドライン

全機能計画から自動生成されます。最終更新日: 2026-02-27

## 使用中の技術スタック

- **言語**: TypeScript 5.x
- **ランタイム**: Node.js 22+
- **フレームワーク**: Next.js（Web）、AWS Lambda（Batch）
- **テスト**: Jest（ユニット）、Playwright（E2E）
- **CI/CD**: GitHub Actions
- **インフラ**: AWS（CDK）
- **パッケージ管理**: npm workspaces（モノレポ）

## プロジェクト構成

```text
nagiyu-platform/
├── services/           # サービス固有パッケージ
│   └── {service}/
│       ├── core/       # ビジネスロジック（フレームワーク非依存）
│       ├── web/        # Next.js UI
│       └── batch/      # バッチ処理
├── libs/               # 共通ライブラリ
│   ├── common/         # @nagiyu/common（完全非依存）
│   ├── browser/        # @nagiyu/browser（ブラウザAPI依存）
│   ├── react/          # @nagiyu/react（React依存）
│   ├── ui/             # @nagiyu/ui（Next.js + MUI依存）
│   └── aws/            # @nagiyu/aws（AWS SDK依存）
├── infra/              # インフラ（AWS CDK）
├── configs/            # 共通設定（tsconfig.base、eslint.config.base）
└── docs/               # ドキュメント
```

## コマンド

```bash
# テスト実行
npm run test --workspace @nagiyu/{package}
npm run test:coverage --workspace @nagiyu/{package}
npm run test:e2e --workspace {package}

# Lint / フォーマット
npm run lint --workspace @nagiyu/{package}
npm run format:check --workspace @nagiyu/{package}
npm run format --workspace @nagiyu/{package}

# ビルド（依存順序厳守）
npm run build --workspace @nagiyu/common
npm run build --workspace @nagiyu/aws
npm run build --workspace @nagiyu/react
npm run build --workspace @nagiyu/browser
npm run build --workspace @nagiyu/ui
npm run build --workspace {service-web}
```

## コードスタイル

### TypeScript

- `configs/tsconfig.base.json` を継承すること
- strict mode 必須
- 型定義は `types/` ディレクトリに集約
- クラスプロパティはコンストラクタパラメータで定義しない
- アクセス修飾子（public/private/protected）を必ず明示

### ESLint

- `configs/eslint.config.base.mjs` を継承すること
- `@typescript-eslint/parameter-properties`: クラスプロパティの明示定義を強制
- `@typescript-eslint/explicit-member-accessibility`: アクセス修飾子を強制

### Prettier

- `semi: true`（セミコロン必須）
- `singleQuote: true`（シングルクォート）
- `printWidth: 100`（1行100文字以内）
- `tabWidth: 2`（インデント2スペース）
- `trailingComma: "es5"`（末尾カンマ）

## 最近の変更

[直近3機能とその追加内容]

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
