# テスト戦略

## 目的

本ドキュメントは、プラットフォームにおけるテスト方針と戦略を定義する。

## 基本方針

- **スマホファースト**: モバイル環境でのテストを優先
- **品質とスピードのバランス**: 必要十分なテストカバレッジを目指す
- **自動化**: CI/CDで継続的にテストを実行

## テストディレクトリ構成

### 標準構成

#### サービス

```
services/{service-name}/
├── tests/
│   ├── unit/           # ユニットテスト（Jest）
│   └── e2e/            # E2Eテスト（Playwright）
```

#### ライブラリ

```
libs/{library-name}/
├── tests/
│   ├── unit/           # ユニットテスト（Jest）
│   └── setup.ts        # Jest セットアップファイル
```

### 設計思想

- **統一性**: サービスもライブラリも同じ `tests/` 配下にテストを配置
- **分離**: テストコードを `tests/` 配下に集約し、実装コード（`src/`）と明確に区分
- **型安全性**: ライブラリでは `tests/` を TypeScript の型チェック対象に含める（詳細は [shared-libraries.md](./shared-libraries.md) 参照）

#### ライブラリでE2Eテストがない理由

- ライブラリは再利用可能なコンポーネント・ユーティリティの提供が責務
- E2Eテストはサービス側で実施（実際のユーザーフローをテスト）
- ライブラリではユニットテストで品質を担保

## ユニットテスト

### フレームワーク

- **Jest**: テストランナー
- **Testing Library**: Reactコンポーネントテスト

### テスト対象

- **ビジネスロジック（lib/）を重点的に**: 純粋関数、データ変換処理
- **重要なユーティリティ関数**: エラーハンドリング、バリデーション
- **複雑なコンポーネントロジック**: 状態管理、条件分岐

### カバレッジ目標

- **ビジネスロジック: 80%以上**
- UI層は必要に応じて（E2Eでカバーされる部分は省略可）

### 共通設定

`configs/jest.config.base.ts` を extends して使用。詳細は [configs.md](./configs.md) を参照。

### モック対象

- ブラウザAPI（navigator.clipboard、localStorage等）
- 外部API呼び出し
- Next.jsルーティング

## E2Eテスト

### フレームワーク

- **Playwright**: クロスブラウザE2Eテスト

### テスト対象

- **主要な機能フロー**: ユーザーが実行する典型的な操作
- **クリティカルパス**: 必ず動作すべき重要機能
- **PWA機能**: オフライン動作、インストール（PWA対応サービスのみ）

### テストデバイス

#### 標準構成

- **chromium-desktop**: Desktop Chrome（1920x1080）
- **chromium-mobile**: モバイルChrome（Pixel 5想定）
- **webkit-mobile**: モバイルSafari（iPhone想定）

#### スマホファーストの実践

モバイル環境を優先してテスト。デスクトップは補助的に確認。

### アクセシビリティテスト

#### 対象サービス

一般公開されるサービスでは実施を推奨。

#### ツール

- **axe-core**: 自動アクセシビリティチェック
- Playwrightと統合して実行

#### チェック項目

- WCAG 2.1 Level AA準拠
- キーボード操作
- スクリーンリーダー対応

## CI戦略

### 2段階CI

#### ci-fast（高速フィードバック）

- **トリガー**: integration/** ブランチへのPR
- **対象**: chromium-mobile のみ
- **目的**: 開発中の素早いフィードバック

#### ci-full（完全テスト）

- **トリガー**: develop/master ブランチへのPR・マージ
- **対象**: 全3種デバイス
- **カバレッジチェック**: 80%未満で失敗

### CI最適化

- 並列実行数の調整
- 失敗時のスクリーンショット・動画記録
- リトライ設定（不安定なテストへの対処）

### GitHub Actions ワークフロー設計パターン

#### 推奨パターン: ターゲット別PR検証ワークフロー

サービスやライブラリごとに専用のPR検証ワークフローを作成することを推奨します。

**ファイル名**: `.github/workflows/{target}-verify.yml` または `.github/workflows/{target}-verify-fast.yml` / `.github/workflows/{target}-verify-full.yml`  
（例: `hoge-verify.yml` または `hoge-verify-fast.yml` / `hoge-verify-full.yml`）

#### 2段階CI戦略の適用

E2Eテストを持つサービスでは、2段階のワークフローを作成します:

**{target}-verify-fast.yml** (高速フィードバック):
- トリガー: `integration/**` ブランチへのPR
- E2Eテスト: chromium-mobile のみ
- 目的: 開発中の素早いフィードバック

**{target}-verify-full.yml** (完全テスト):
- トリガー: `develop` ブランチへのPR
- E2Eテスト: 全デバイス（chromium-desktop, chromium-mobile, webkit-mobile）
- カバレッジチェック: 80%未満で失敗
- 目的: マージ前の完全な検証

**ライブラリの場合**:
- E2Eテストがないため、単一の `{target}-verify.yml` のみ
- トリガー: `develop` および `integration/**` ブランチへのPR

**トリガー設定のベストプラクティス**:

```yaml
on:
    pull_request:
        branches:
            - develop           # メインブランチ
            - integration/**    # 統合ブランチ（fast verifyでは integration/** のみ）
        paths:
            - 'libs/hoge/**'           # ターゲットファイル
            - 'libs/common/**'            # 依存ライブラリ
            - 'package.json'              # ルートパッケージ定義
            - 'package-lock.json'         # 依存関係ロック
            - '.github/workflows/hoge-verify.yml'  # ワークフロー自体
```

**設計原則**:

1. **ブランチフィルター**: `develop` と `integration/**` を標準とする
    - `develop`: プロダクションに向けた統合ブランチ
    - `integration/**`: フィーチャー統合用の作業ブランチ

2. **パスフィルター**: 関連ファイルのみでトリガー
    - **ターゲット**: 変更対象のディレクトリ（例: `services/hoge/**`）
    - **依存対象**: 直接依存するライブラリ（例: `libs/common/**`）
    - **ルートパッケージ**: `package.json`, `package-lock.json`
    - **ワークフロー自体**: ワークフロー定義ファイル

3. **ワークスペース指定**: パッケージ名を使用
    ```yaml
    - name: Run tests
        run: npm run test --workspace=@nagiyu/hoge
    ```
    - パス指定（`services/hoge`）ではなくパッケージ名（`@nagiyu/hoge`）を使用
    - より明示的で、リファクタリング時にも対応しやすい

4. **ビルド順序の考慮**: 依存関係に従って順序を守る
    ```yaml
    - name: Build shared libraries
        run: |
            npm run build --workspace @nagiyu/common
            npm run build --workspace @nagiyu/browser
            npm run build --workspace @nagiyu/ui

    - name: Build application
        run: npm run build --workspace @nagiyu/hoge
    ```
    - **重要**: `npm run build` (全ワークスペース並列ビルド) を使用すると依存関係が考慮されず、ビルドエラーが発生する可能性があります
    - ライブラリ間の依存関係: `@nagiyu/ui` → `@nagiyu/browser` → `@nagiyu/common`
    - 詳細は [shared-libraries.md](./shared-libraries.md) の「ビルド順序」を参照

**標準ジョブ構成**:

- **build**: ビルド検証
- **test**: ユニットテスト実行
- **coverage**: テストカバレッジチェック（Jest の `coverageThreshold` 設定により、80%未満で自動失敗）
- **lint**: ESLint によるコード品質チェック
- **format-check**: Prettier によるフォーマットチェック
- **report**: 全ジョブの結果をPRにコメント

**カバレッジチェックの動作**:

Jest の設定ファイル（`jest.config.ts`）で `coverageThreshold` を定義している場合、テストカバレッジが閾値を下回ると `npm run test:coverage` コマンドが非ゼロの終了コードで終了します。これによりGitHub Actionsのジョブが自動的に失敗し、PRマージを防ぎます。

```typescript
// jest.config.ts
coverageThreshold: {
    global: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
    },
}
```

**利点**:

- 無関係な変更でワークフローが実行されず、CIリソースを節約
- 変更対象に応じた適切なテストのみ実行され、高速なフィードバック
- ワークフロー定義が明確で、メンテナンスしやすい

## テスト作成ガイドライン

### ユニットテスト

#### 原則

- **純粋関数を優先**: 副作用のないテストしやすいコード
- **一つのテストで一つの検証**: テストケースを小さく保つ
- **AAA パターン**: Arrange（準備）、Act（実行）、Assert（検証）

#### 命名規則

```typescript
describe('機能名', () => {
  describe('関数名', () => {
    it('正常系: 説明', () => { /* ... */ });
    it('異常系: 説明', () => { /* ... */ });
    it('エッジケース: 説明', () => { /* ... */ });
  });
});
```

### E2Eテスト

#### 原則

- **ユーザー視点**: 実際の利用シナリオに沿って記述
- **安定性優先**: 不安定なテストは修正するか削除
- **独立性**: テスト間で状態を共有しない

#### テスト粒度

- 主要フローは細かくテスト
- 枝葉の機能は重要度に応じて判断
- 過度に細かいテストは避ける（メンテナンスコスト増）

## テストの実行

### ローカル環境

```bash
# ユニットテスト
npm test
npm run test:watch
npm run test:coverage

# E2Eテスト
npm run test:e2e
npm run test:e2e:ui       # UIモード（デバッグ用）
npm run test:e2e:headed   # ブラウザ表示モード
```

### CI環境

GitHub Actionsで自動実行。

## 参考

- [rules.md](./rules.md): コーディング規約・べからず集
- [service-template.md](./service-template.md): サービステンプレート
- [architecture.md](./architecture.md): アーキテクチャ方針
- [configs.md](./configs.md): 共通設定ファイル
