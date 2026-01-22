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

## 既知の制約・技術的問題

### React 19 + Next.js 16 + Jest の互換性問題

#### 問題概要

React 19 の新しいアーキテクチャと Jest の組み合わせにおいて、Next.js App Router の page コンポーネントを直接ユニットテストすることができない互換性問題が確認されています。

**エラー内容**:
```
Invalid hook call. Hooks can only be called inside of the body of a function component.
TypeError: Cannot read properties of null (reading 'useState')
```

#### 影響範囲

- **影響あり**: Next.js App Router の page コンポーネント（`app/**/page.tsx`）
- **影響なし**: 
  - 個別の React コンポーネント（Material-UI コンポーネント含む）
  - Next.js API routes
  - ブラウザAPI以外のビジネスロジック

#### 検証結果

以下のテストパターンで動作確認済み:

| テスト対象 | 結果 | 備考 |
|-----------|------|------|
| Material-UI コンポーネント単体 | ✅ 動作 | ThemeProvider でラップして正常動作 |
| `useRouter` モック | ✅ 動作 | Next.js routing のモックは正常動作 |
| `useState` 等の React hooks | ❌ エラー | page コンポーネント内で使用時にエラー |
| Page コンポーネント全体 | ❌ エラー | App Router page は直接テスト不可 |
| API routes | ✅ 動作 | React 不使用のため影響なし |

#### 回避策

1. **E2E テストでカバー**（推奨）
   - Playwright による E2E テストで page の機能をテスト
   - 実際のユーザーフローを網羅的に検証
   - page コンポーネントはカバレッジ対象外に設定（`jest.config.ts` で除外）

2. **コンポーネント分割**
   - Page コンポーネントから小さな React コンポーネントを抽出
   - 抽出したコンポーネントを個別にユニットテスト
   - Page コンポーネント自体は最小限の構成とする

#### 将来の対応

React 19 の testing ecosystem が成熟し、以下のいずれかが対応された時点で再評価:
- Testing Library の React 19 完全対応
- Next.js の Jest 統合改善
- React Testing Tools の更新

### E2Eテストにおけるブラウザ固有の制約

#### 問題概要

Playwright E2E テストにおいて、ブラウザ/デバイスごとに Web API のサポート状況が異なるため、特定の環境でテストが失敗することがあります。

#### WebKit (Safari) モバイルでの Notification API

**問題**:
WebKit モバイル環境では `Notification` API が存在しないため、`Notification.permission` 等へのアクセスで `ReferenceError` が発生します。

```
Error: page.evaluate: ReferenceError: Can't find variable: Notification
```

**原因**:
iOS Safari では Web Push 通知が制限されており、`Notification` オブジェクト自体が定義されていません。

**回避策**:
API の存在確認を行い、サポートされていない環境ではテストをスキップします。

```typescript
test('通知許可がリクエストされる', async ({ page, context }) => {
  // Notification API がサポートされているか確認
  const hasNotificationApi = await page.evaluate(() => {
    return typeof Notification !== 'undefined';
  });

  // サポートされていない環境（webkit-mobile等）ではスキップ
  test.skip(!hasNotificationApi, 'Notification API is not supported in this environment');

  // 以降は通常のテストコード
  const permissionState = await page.evaluate(() => {
    return Notification.permission;
  });
  // ...
});
```

#### ブラウザ固有の制約一覧

| Web API | chromium-desktop | chromium-mobile | webkit-mobile | 備考 |
|---------|-----------------|-----------------|---------------|------|
| Notification | ✅ | ✅ | ❌ | iOS Safari は非サポート |
| Service Worker | ✅ | ✅ | ✅ | 登録は可能だが Push は制限あり |
| Web Push | ✅ | ✅ | ⚠️ | iOS 16.4+ で限定的にサポート |

#### 設計指針

1. **API存在確認を先に行う**: `typeof API !== 'undefined'` でチェック
2. **`test.skip()` で明示的にスキップ**: スキップ理由をメッセージで明記
3. **代替テストを検討**: 可能であれば別のアプローチでテストを追加

## 参考

- [rules.md](./rules.md): コーディング規約・べからず集
- [service-template.md](./service-template.md): サービステンプレート
- [architecture.md](./architecture.md): アーキテクチャ方針
- [configs.md](./configs.md): 共通設定ファイル
