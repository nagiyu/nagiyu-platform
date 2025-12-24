# タスク: サービスグランドルールの標準化とドキュメント整備

## 概要

Tools サービスの実装をグランドルールとして、プラットフォーム全体で統一された品質・構成を維持するためのドキュメントを整備する。

## 背景

- 本プラットフォームは複数サービスをモノレポで管理する想定
- Tools サービスが最初の実装として完成
- 今後追加されるサービスでも同じ品質基準・構成を維持したい
- ドキュメント駆動開発により、実装前にルールを明確化

## 目標

1. Tools サービスの構成をベストプラクティスとして文書化
2. 新サービス追加時のテンプレート・チェックリスト作成
3. 共通ライブラリ (`libs/`) の設計方針を明確化
4. アーキテクチャパターン・テスト戦略の標準化

## 成果物

### 1. `docs/development/` ディレクトリ構造

```
docs/
├── development/
│   ├── service-template.md        # 新サービステンプレート
│   ├── architecture.md            # アーキテクチャ方針
│   ├── testing.md                 # テスト戦略
│   ├── shared-libraries.md        # 共通ライブラリ設計
│   ├── configs.md                 # 共通設定ファイルガイド
│   └── pwa.md                     # PWA 設定ガイド
└── infra/                         # (既存)
```

### 2. 各ドキュメントの内容

#### `service-template.md`
- ディレクトリ構造テンプレート
  - `src/`, `tests/unit/`, `tests/e2e/` の標準構成
  - `lib/` 配下は自由（最小限のルールのみ）
- 必須設定ファイル一覧
  - configs/ からの extends 方法
  - tsconfig, eslint, jest の設定例
- package.json スクリプト標準
  - dev, build, test, test:coverage, test:e2e など
- PWA 設定（デフォルト有効）
  - manifest.json, offline ページ
  - 無効化手順も明記
- 新サービス追加チェックリスト
- バージョン管理（各サービス独立）

#### `architecture.md`
- レイヤー分離の原則
  - UI 層とビジネスロジックの分離
  - `lib/` 配下の構成は自由
- 参考パターン
  - Parser/Formatter パターン（Tools の例）
  - 他のサービスタイプの構成例
- State Management 方針
  - React Hooks + localStorage
- コーディング規約
  - Prettier 設定（モノレポ全体で統一）
  - TypeScript strict mode
  - エラーメッセージの日本語化

#### `testing.md`
- テストディレクトリ構成
  - `tests/unit/`: 単体テスト
  - `tests/e2e/`: E2E テスト
- ユニットテスト戦略 (Jest)
  - カバレッジ目標: 80%
  - ビジネスロジック（`lib/`）を重点的にテスト
  - 共通設定（`configs/jest.config.base.ts`）の使い方
- E2E テスト戦略 (Playwright)
  - 全機能を E2E でカバー
  - テストデバイス: chromium-desktop + chromium-mobile + webkit-mobile
  - アクセシビリティテスト（一般公開サービス）
- CI 戦略（2段階）
  - ci-fast: integration/** への PR（chromium-mobile のみ）
  - ci-full: develop/master への PR（3種デバイス、カバレッジチェック）
- スマホファーストの思想

#### `shared-libraries.md`
- 共通ライブラリ構成（3分割）
  - `libs/ui/`: Next.js + Material-UI 依存
  - `libs/browser/`: ブラウザ API 依存
  - `libs/common/`: 完全フレームワーク非依存
- 依存関係ルール
  - ui → browser → common（一方向のみ）
- 各ライブラリの詳細
  - ui: Header, Footer（ダイアログ含む）, ThemeRegistry, theme.ts
  - browser: clipboard, localStorage ラッパー
  - common: 共通型定義、汎用ユーティリティ
- 利用ガイド
  - Next.js サービスでの使い方
  - 将来の他フレームワーク対応
- バージョン管理（各ライブラリ独立）

#### `configs.md`
- 共通設定ファイルの使い方
  - `configs/tsconfig.base.json`
  - `configs/eslint.config.base.mjs`
  - `configs/jest.config.base.ts`
  - `.prettierrc`（モノレポルート）
- extends の方法
- カスタマイズが必要な場合の対応
- Playwright は独立管理（理由と方針）

#### `pwa.md`
- PWA のメリット・デメリット
- デフォルトで有効にする理由（スマホファースト）
- PWA 設定の詳細
  - next-pwa の設定
  - manifest.json の構成
  - offline ページの実装
- 無効化すべきケース
  - 認証必須の管理画面
  - サーバーサイドレンダリングが重要な場合
- 無効化手順（明確に）

### 3. `services/tools/README.md` 更新
- グランドルールに準拠した内容に書き換え
- アーキテクチャセクション追加
- テストセクション詳細化

## タスク分解

- [x] tasks/ ディレクトリ構造を確認
- [x] グランドルールドキュメント作成のタスクファイル作成
- [x] Tools の実装を詳細に分析（tools-implementation-analysis.md）
- [x] 全8つの論点を議論・決定
- [x] タスクファイルを更新（決定事項を反映）
- [x] docs/development/ ディレクトリ作成
- [x] service-template.md 作成
- [x] architecture.md 作成
- [x] testing.md 作成
- [x] shared-libraries.md 作成
- [x] configs.md 作成
- [x] pwa.md 作成
- [x] Tools サービスの README.md 削除（docs/ に集約）
- [ ] 決定事項のレビュー・フィードバック反映

## 注意事項

- 実装は行わず、ドキュメント整備に集中
- Tools サービスの実装を参照ベースとする
- 将来の拡張性を考慮した設計
- チーム全体で合意できる明確なルールを記述

## 参照

- `/home/yusuke/repos/nagiyu-platform/README.md` - プラットフォーム全体構成
- `/home/yusuke/repos/nagiyu-platform/services/tools/` - Tools サービス実装
- `/home/yusuke/repos/nagiyu-platform/tasks/tools-implementation-analysis.md` - 詳細分析結果
- Tools サービスの設定ファイル群 (tsconfig.json, eslint.config.mjs, etc.)

## 決定事項サマリー

### ディレクトリ構造
- `lib/` 配下は自由（最小限のルールのみ）
- テストは `tests/unit/`, `tests/e2e/` に配置（tests/ 配下に集約）

### 共通ライブラリ
- 3分割: `libs/ui/`, `libs/browser/`, `libs/common/`
- 依存関係: ui → browser → common
- パッケージ名: `@nagiyu/ui`, `@nagiyu/browser`, `@nagiyu/common`
- 初期バージョン: 1.0.0
- ライブラリ内部は相対パスのみ使用（エイリアス禁止）

### 設定ファイル
- `configs/` に共通設定（tsconfig, eslint, jest）
- 各サービスは extends で利用
- Prettier はモノレポルートで統一

### PWA
- デフォルトで有効（スマホファースト）
- 無効化可能（手順をドキュメント化）

### テスト
- カバレッジ 80% 目標
- CI は2段階（ci-fast: chromium-mobile / ci-full: 3種デバイス）
- E2E で全機能をカバー

### その他
- Tool インターフェースは共通化しない
- Footer の利用規約・プライバシーポリシーはダイアログで共通化
- バージョンは各サービス・各ライブラリで独立管理

## 次のアクション

1. `docs/development/` ディレクトリ作成
2. 各ドキュメントを順次作成（6ファイル）
3. Tools README.md 更新
4. レビュー・さらなる議論が必要な点の洗い出し
