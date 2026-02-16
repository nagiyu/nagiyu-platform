# niconico-mylist-assistant テスト戦略

## 1. テスト方針

### 1.1 テストレベル

- **ユニットテスト**: core パッケージのビジネスロジック（カバレッジ 80% 以上）
- **統合テスト**: batch パッケージの Playwright 自動化
- **E2E テスト**: web パッケージの主要フロー

### 1.2 パッケージ別テスト戦略

#### core パッケージ

- **重点テスト対象**: `libs/` の Pure Business Logic Functions
- **カバレッジ目標**: 80% 以上
- **テストツール**: Jest
- **テストアプローチ**:
  - 副作用のない関数は入力と出力のテストのみ
  - Repository は Interface に対してテスト
  - Mapper は Entity ↔ DynamoDB Item 変換のテスト

#### web パッケージ

- **重点テスト対象**: API Routes、主要ユーザーフロー
- **テストツール**: Jest (API Routes), Playwright (E2E)
- **テストアプローチ**:
  - API Routes は InMemory Repository を使用してテスト
  - E2E は `USE_IN_MEMORY_DB=true` でインメモリストアを使用
  - 認証は `SKIP_AUTH_CHECK=true` でバイパス

#### batch パッケージ

- **重点テスト対象**: Playwright 自動化スクリプト
- **テストツール**: Jest (統合テスト)
- **テストアプローチ**:
  - テスト用ニコニコアカウントで実際に登録テスト
  - セレクタのフォールバック動作を確認

## 2. テスタビリティ向上の設計

### 2.1 Repository Pattern

DynamoDB実装とInMemory実装を切り替え可能にすることで、E2Eテストのテスタビリティを向上。

- **DynamoDB Repository**: 本番・開発環境
- **InMemory Repository**: E2Eテスト環境（`@nagiyu/aws` の `InMemorySingleTableStore` を活用）

### 2.2 環境変数による切り替え

- `USE_IN_MEMORY_DB=true`: InMemory Repository を使用
- `SKIP_AUTH_CHECK=true`: 認証をバイパス（テスト用固定ユーザーID）

### 2.3 テストデータの独立性

- E2Eテストは `beforeEach` でインメモリストアをクリア
- テスト間でデータが独立し、並列実行が可能

## 3. テストシナリオ

### 3.1 ユニットテスト（core）

- 動画選択ロジック（フィルタリング、ランダム選択）
- バリデーション（動画ID、設定値）
- データフォーマット（日時、動画情報）
- Entity ↔ DynamoDB Item 変換

### 3.2 統合テスト（batch）

- ニコニコ動画ログイン処理
- マイリスト作成・削除処理
- 動画登録処理（2秒待機の確認）
- エラーハンドリング・リトライロジック

### 3.3 E2Eテスト（web）

- 動画一括インポートフロー
- 動画一覧表示・フィルタリング
- ユーザー設定編集（お気に入り、スキップ、メモ）
- マイリスト登録バッチ投入

## 4. テスト実行

### 4.1 ローカル実行

```bash
# ユニットテスト
npm run test

# E2E テスト（InMemory）
npm run test:e2e
```

### 4.2 CI 実行

- Fast CI: ビルド、品質チェック、ユニットテスト、E2E（chromium-mobile のみ）
- Full CI: Fast CI + カバレッジチェック（80%未満で失敗）+ E2E（全デバイス）

## 5. カバレッジ目標

- **core パッケージ**: 80% 以上（必須）
- **web パッケージ**: API Routes を重点的にカバー
- **batch パッケージ**: 統合テストで主要フローをカバー
