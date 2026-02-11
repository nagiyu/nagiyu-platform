# Batch パッケージ テストガイド

## 概要

このドキュメントは、`@nagiyu/niconico-mylist-assistant-batch` パッケージのテスト実行方法と設定について説明します。

## テストの種類

### 1. ユニットテスト

ビジネスロジックとユーティリティ関数のユニットテストです。

**対象ファイル:**
- `src/utils.ts` - ユーティリティ関数（sleep, retry, getTimestamp, generateDefaultMylistName）
- `src/constants.ts` - 定数とエラーメッセージ

**実行方法:**
```bash
# ユニットテストのみ実行
npm test

# カバレッジレポート付き実行
npm test -- --coverage
```

**カバレッジ目標:**
- ビジネスロジック: 100%（達成済み）
- 全体: 80%以上

**テストファイル:**
- `tests/unit/utils.test.ts`
- `tests/unit/constants.test.ts`

### 2. 統合テスト（Playwright）

Playwright を使用した実環境での統合テストです。

**テストの種類:**

#### a. エラーケーステスト（`tests/integration/error-cases.spec.ts`）

資格情報不要で実行できるエラーハンドリングのテスト。

**テスト内容:**
- 環境変数の不足時のエラー処理
- 無効な動画IDフォーマットの検出
- JSONパースエラーのハンドリング
- 空の動画リストの処理
- タイムアウト値の妥当性
- URLの妥当性
- リトライ設定の検証

#### b. マイリスト登録フローテスト（`tests/integration/mylist-registration.spec.ts`）

**テスト専用アカウントが必要**です。実際のニコニコ動画にアクセスして動作を確認します。

**テスト内容:**
- Step 1: ログイン
- Step 2: マイリストページへのアクセス
- Step 3: マイリストの作成と削除
- Step 4: 動画のマイリスト登録

**実行方法:**
```bash
# ヘッドレスモードで実行
npm run test:integration

# ブラウザを表示して実行
HEADLESS=false npm run test:integration

# デバッグモード（ステップ実行）
PWDEBUG=1 npm run test:integration
```

## 環境変数の設定

### ユニットテスト

環境変数は不要です。

### 統合テスト

統合テストを実行するには、`.env.local` ファイルを作成して以下の環境変数を設定してください。

```bash
# .env.local ファイルの例
NICONICO_TEST_EMAIL=your-test-account@example.com
NICONICO_TEST_PASSWORD=your-test-password
TEST_VIDEO_IDS=sm9,sm10
```

**注意事項:**
- **テスト専用アカウント**を使用してください
- `.env.local` ファイルは `.gitignore` に含まれており、バージョン管理されません
- 本番アカウントは絶対に使用しないでください

`.env.local.example` ファイルを参考にしてください:
```bash
cp .env.local.example .env.local
# エディタで .env.local を編集して実際の値を設定
```

## CI/CD での実行

### GitHub Actions

統合テスト（マイリスト登録フロー）はテスト専用アカウントが必要なため、CI/CD では**実行されません**。

CI/CD では以下のテストのみ実行されます:
- ユニットテスト（`npm test`）
- エラーケーステスト（資格情報不要の統合テスト）

### ローカル開発

ローカル環境では、`.env.local` に設定した資格情報を使用して全ての統合テストを実行できます。

## テスト結果の確認

### ユニットテスト

```bash
npm test -- --coverage
```

カバレッジレポートは `coverage/` ディレクトリに出力されます。

### 統合テスト

テスト結果とアーティファクトは以下に保存されます:
- スクリーンショット: `test-results/*.png`
- ビデオ: `test-results/*.webm`（失敗時のみ）
- トレース: `test-results/*.zip`（失敗時のみ）
- HTMLレポート: `playwright-report/`

HTMLレポートを開く:
```bash
npx playwright show-report
```

## トラブルシューティング

### Jest が見つからない

```bash
# ルートディレクトリで依存関係をインストール
cd ../../../
npm install
```

### Playwright のブラウザがインストールされていない

```bash
npx playwright install chromium
```

### 統合テストが環境変数エラーで失敗する

`.env.local` ファイルが正しく設定されているか確認してください:
```bash
cat .env.local
```

必要な環境変数:
- `NICONICO_TEST_EMAIL`
- `NICONICO_TEST_PASSWORD`
- `TEST_VIDEO_IDS`（オプション）

### タイムアウトエラーが発生する

ニコニコ動画のサーバー応答が遅い場合があります。以下を試してください:

1. リトライする
2. タイムアウト値を増やす（`playwright.config.ts` の `timeout` 設定）
3. ネットワーク環境を確認する

## テスト戦略

### テストピラミッド

```
        /\
       /E2E\      ← 統合テスト（Playwright）
      /------\
     /  統合  \
    /----------\
   / ユニット  \  ← ユニットテスト（Jest）
  /--------------\
```

- **ユニットテスト**: 高速、多数、カバレッジ重視
- **統合テスト**: 実環境、セレクタ検証、UI変更の早期検知

### テストの役割

#### ユニットテスト
- ビジネスロジックの正確性を保証
- リファクタリングの安全性を担保
- 開発中の高速なフィードバック

#### 統合テスト
- 実際のニコニコ動画との連携を検証
- UIセレクタの動作確認
- UI変更の早期検知（ニコニコ動画のUI変更を検出）
- エンドツーエンドのフロー検証

## 参考資料

- [Playwright 公式ドキュメント](https://playwright.dev/)
- [Jest 公式ドキュメント](https://jestjs.io/)
- プラットフォーム全体のテスト戦略: `docs/development/testing.md`
