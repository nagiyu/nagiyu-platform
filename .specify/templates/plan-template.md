# 実装計画: [機能名]

**ブランチ**: `[###-feature-name]` | **日付**: [DATE] | **仕様**: [リンク]
**入力**: `/specs/[###-feature-name]/spec.md` の機能仕様書

**注記**: このテンプレートは `/speckit.plan` コマンドによって記入されます。
実行ワークフローは `.specify/templates/commands/plan.md` を参照してください。

## 概要

[機能仕様書から抽出: 主要な要件 + 調査からの技術的アプローチ]

## 技術コンテキスト

**言語/バージョン**: TypeScript 5.x / Node.js 22+
**主要な依存関係**: [例: Next.js, React, Jest, Playwright など]
**ストレージ**: [例: DynamoDB, なし など]
**テスト**: Jest（ユニット）、Playwright（E2E）
**ターゲットプラットフォーム**: [例: AWS Lambda, Next.js (Vercel/ECS) など]
**プロジェクト種別**: [single/web/mobile/core+web/core+batch]
**パフォーマンス目標**: [例: レスポンスタイム 200ms 以内 など]
**制約**: [例: スマホファースト、オフライン対応 など]
**スコープ**: [例: 想定ユーザー数、データ量 など]

## 憲法チェック

*ゲート: フェーズ0の調査前に通過すること。フェーズ1の設計後に再チェックすること。*

- [ ] **TypeScript 型安全性 (I)**: strict mode、型定義の集約、アクセス修飾子の明示
- [ ] **アーキテクチャ・レイヤー分離 (II)**: core/web/batch の分離、依存関係の方向性
- [ ] **コード品質・Lint・フォーマット (III)**: ESLint・Prettier の設定を含む
- [ ] **テスト戦略 (IV)**: Jest・Playwright の設定、80% カバレッジ目標、2段階 CI
- [ ] **ブランチ戦略・CI/CD (V)**: verify-fast / verify-full ワークフロー
- [ ] **共通ライブラリ設計 (VI)**: 依存関係ルールへの準拠
- [ ] **ドキュメント駆動開発 (VII)**: 日本語での成果物作成

## プロジェクト構成

### ドキュメント（本機能）

```text
specs/[###-feature]/
├── plan.md              # 本ファイル (/speckit.plan コマンドの出力)
├── research.md          # フェーズ0の出力
├── data-model.md        # フェーズ1の出力
├── quickstart.md        # フェーズ1の出力
├── contracts/           # フェーズ1の出力
└── tasks.md             # フェーズ2の出力 (/speckit.tasks コマンドで作成)
```

### ソースコード（リポジトリルート）

```text
# オプション1: core + web サービス（標準）
services/{service}/
├── core/
│   └── src/
│       ├── libs/         # ビジネスロジック（純粋関数）
│       ├── services/     # ステートフルなサービス層
│       ├── repositories/ # データアクセス層
│       └── types.ts      # 型定義
├── web/
│   └── src/
│       ├── app/          # Next.js App Router
│       ├── components/   # React コンポーネント
│       └── types/        # 型定義
└── batch/                # バッチ処理（該当する場合）
    └── src/

# オプション2: 単一パッケージ（libs/* など）
src/
├── libs/
└── types.ts

tests/
└── unit/
```

**構成の決定**: [選択した構成と実際のディレクトリを記述]

## 複雑性の追跡

> **憲法チェックに違反があり正当化が必要な場合のみ記入**

| 違反内容 | 必要な理由 | よりシンプルな代替案を却下した理由 |
|---------|------------|----------------------------------|
| [例: 4つ目のパッケージ] | [現在の必要性] | [3パッケージでは不十分な理由] |
