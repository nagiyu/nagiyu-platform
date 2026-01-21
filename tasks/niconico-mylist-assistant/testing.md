# niconico-mylist-assistant テスト仕様書

---

## 1. テスト戦略概要

### 1.1 テストの目的

本サービスのテストは、以下を目的として実施します:

- **主要機能の動作保証**: 動画インポート、ユーザー設定管理、マイリスト登録の正常動作を保証
- **リグレッション防止**: コード変更による既存機能の破壊を防止
- **UI 変更への耐性**: ニコニコ動画の HTML 構造変更を早期検知
- **品質保証**: ビジネスロジックの正確性を担保

### 1.2 テスト方針

本サービスは **3 パッケージ構成**（core / web / batch）を採用しており、各パッケージの特性に応じたテスト戦略を適用します。

- **ビジネスロジック集約**: ビジネスロジックは core パッケージに集約し、ユニットテストで品質を担保
- **E2E 重視**: web パッケージは E2E テストでユーザーフローをカバー
- **実環境テスト**: batch パッケージはテスト専用アカウントを使用した実環境統合テストで品質を担保
- **スマホファースト**: モバイル環境でのテストを優先

### 1.3 パッケージ別テスト戦略

| パッケージ | ユニットテスト | E2E / 統合テスト | カバレッジ目標 | 品質担保の方法 |
|-----------|--------------|-----------------|---------------|---------------|
| **core** | 重点的に実施 | - | 80% | ユニットテスト |
| **web** | 最小限 | E2E テスト | 対象外 | E2E テスト |
| **batch** | 最小限 | 統合テスト（実環境） | 対象外 | 統合テスト |

---

## 2. テストデバイス/ブラウザ構成

### 2.1 Playwright デバイス構成

| デバイス名 | 用途 | 画面サイズ | User Agent |
|-----------|------|-----------|------------|
| chromium-desktop | デスクトップ Chrome | 1920x1080 | Chrome (最新安定版) |
| chromium-mobile | モバイル Chrome | Pixel 5 相当 | Chrome Mobile (Android) |
| webkit-mobile | モバイル Safari | iPhone 相当 | Safari Mobile (iOS) |

### 2.2 テスト優先順位

#### Fast CI (高速フィードバック)

- **対象**: chromium-mobile のみ
- **目的**: 開発中の素早いフィードバック
- **トリガー**: `integration/**` ブランチへの PR

#### Full CI (完全テスト)

- **対象**: chromium-desktop, chromium-mobile, webkit-mobile
- **目的**: マージ前の完全な品質検証
- **トリガー**: `develop` ブランチへの PR

---

## 3. カバレッジ目標

### 3.1 カバレッジ目標値

| パッケージ | カバレッジ目標 | 測定方法 | 備考 |
|-----------|--------------|----------|------|
| core (ビジネスロジック) | 80% 以上 | Jest coverage | 必須 |
| web | 対象外 | - | E2E テストでカバー |
| batch | 対象外 | - | 統合テストでカバー |

### 3.2 カバレッジ対象外

以下は Jest のカバレッジ対象外とします（E2E テストまたは統合テストでカバー）:

- `web/app/**/page.tsx` - Next.js App Router の page コンポーネント
- `web/app/**/layout.tsx` - レイアウトコンポーネント
- `web/app/api/**` - API Routes（E2E でカバー）
- `batch/**` - バッチ処理（統合テストでカバー）

### 3.3 カバレッジ計測方法

```bash
# core パッケージのカバレッジレポート生成
npm run test:coverage --workspace=niconico-mylist-assistant-core

# カバレッジ結果の確認
# - コンソール出力: サマリー
# - coverage/lcov-report/index.html: 詳細レポート
```

---

## 4. E2E テストシナリオ

### 4.1 テストシナリオ一覧

| シナリオ ID | シナリオ名 | 概要 | 優先度 | Fast CI | Full CI |
|------------|-----------|------|--------|---------|---------|
| E2E-001 | 動画一括インポート | 動画 ID 入力 → API 呼び出し → 結果表示 | 高 | ✅ | ✅ |
| E2E-002 | 動画一覧表示 | 動画一覧取得 → フィルタリング → ページネーション | 高 | ✅ | ✅ |
| E2E-003 | ユーザー設定編集 | お気に入り/スキップトグル、メモ編集 | 高 | ✅ | ✅ |
| E2E-004 | 動画削除 | 確認ダイアログ → 削除実行 → 一覧更新 | 中 | - | ✅ |
| E2E-005 | マイリスト登録（バッチ投入） | 条件指定 → アカウント入力 → バッチ投入 | 中 | - | ✅ |
| E2E-006 | エラーハンドリング | 不正な動画 ID、API エラー時の表示 | 中 | - | ✅ |
| E2E-007 | 未認証時のリダイレクト | 未ログイン状態でのアクセス制御 | 低 | - | ✅ |

### 4.2 シナリオ詳細

#### E2E-001: 動画一括インポート

**目的**: 動画 ID を入力し、ニコニコ動画 API から動画基本情報を取得して DynamoDB に保存する機能をテスト

**前提条件**:

- ユーザーが認証済み（モック JWT）
- DynamoDB (dev) にアクセス可能

**テスト手順**:

1. 一括インポート画面にアクセス
2. 動画 ID を入力（例: `sm12345678`）
3. 「インポート実行」ボタンをクリック
4. 進捗表示を確認
5. 結果サマリー（成功数、スキップ数、失敗数）を確認

**期待結果**:

- 動画基本情報が DynamoDB に保存される
- 結果サマリーが正しく表示される

**テストファイル**: `web/tests/e2e/bulk-import.spec.ts`

**実行環境要件**:

- ニコニコ動画 API（getthumbinfo）への実アクセス
- DynamoDB (dev) への実アクセス

---

#### E2E-002: 動画一覧表示

**目的**: 登録済み動画の一覧表示とフィルタリング機能をテスト

**前提条件**:

- ユーザーが認証済み（モック JWT）
- テスト用動画データが DynamoDB に登録済み

**テスト手順**:

1. 動画管理画面にアクセス
2. 動画一覧が表示されることを確認
3. 「お気に入りのみ」フィルタを適用
4. フィルタ結果を確認
5. ページネーション操作（該当する場合）

**期待結果**:

- 動画一覧が正しく表示される
- フィルタリングが正しく動作する

**テストファイル**: `web/tests/e2e/video-list.spec.ts`

---

#### E2E-003: ユーザー設定編集

**目的**: お気に入りフラグ、スキップフラグ、メモの編集機能をテスト

**前提条件**:

- ユーザーが認証済み（モック JWT）
- テスト用動画データが DynamoDB に登録済み

**テスト手順**:

1. 動画管理画面にアクセス
2. お気に入りアイコンをクリックしてトグル
3. スキップアイコンをクリックしてトグル
4. メモ欄をクリックして編集、フォーカスアウト

**期待結果**:

- 各設定が即座に DynamoDB に保存される
- UI が更新される

**テストファイル**: `web/tests/e2e/user-settings.spec.ts`

---

#### E2E-004: 動画削除

**目的**: 動画削除機能と確認ダイアログをテスト

**前提条件**:

- ユーザーが認証済み（モック JWT）
- テスト用動画データが DynamoDB に登録済み

**テスト手順**:

1. 動画管理画面にアクセス
2. 削除ボタンをクリック
3. 確認ダイアログが表示されることを確認
4. 「削除」を確定
5. 一覧から動画が削除されることを確認

**期待結果**:

- 確認ダイアログが表示される
- 削除後、一覧が更新される

**テストファイル**: `web/tests/e2e/video-delete.spec.ts`

---

#### E2E-005: マイリスト登録（バッチ投入）

**目的**: マイリスト登録条件の指定とバッチジョブ投入機能をテスト

**前提条件**:

- ユーザーが認証済み（モック JWT）
- テスト用動画データが DynamoDB に登録済み

**テスト手順**:

1. マイリスト登録画面にアクセス
2. 登録条件を指定（「スキップを除く」等）
3. ニコニコアカウント情報を入力
4. 「登録開始」ボタンをクリック
5. バッチ投入成功メッセージを確認

**期待結果**:

- バッチジョブが投入される（モック）
- ステータスが「処理を開始しました」と表示される

**テストファイル**: `web/tests/e2e/batch-submit.spec.ts`

**実行環境要件**:

- AWS Batch API はモック

---

#### E2E-006: エラーハンドリング

**目的**: 各種エラー時の適切なエラー表示をテスト

**前提条件**:

- ユーザーが認証済み（モック JWT）

**テスト手順**:

1. 不正な動画 ID でインポートを実行
2. エラーメッセージが表示されることを確認
3. 存在しない動画 ID でインポートを実行
4. 失敗数にカウントされることを確認

**期待結果**:

- 適切なエラーメッセージが表示される
- 処理は継続され、結果サマリーに反映される

**テストファイル**: `web/tests/e2e/error-handling.spec.ts`

---

#### E2E-007: 未認証時のリダイレクト

**目的**: 未認証状態でのアクセス制御をテスト

**前提条件**:

- 未認証状態（JWT Cookie なし）

**テスト手順**:

1. 認証が必要な画面に直接アクセス
2. ログインページへリダイレクトされることを確認

**期待結果**:

- 401 エラーまたはログインページへリダイレクト

**テストファイル**: `web/tests/e2e/auth-redirect.spec.ts`

---

## 5. ユニットテスト対象

### 5.1 テスト対象の分類

#### core パッケージ (packages/core/)

ビジネスロジックを集約し、重点的にユニットテストを実施します。

- **型定義・定数** (`src/types/`, `src/constants/`)
    - 動画基本情報、ユーザー設定、バッチジョブの型定義
    - 待機時間、上限数などの定数

- **Playwright ヘルパー** (`src/playwright/`)
    - ニコニコ動画ログイン処理
    - マイリスト操作（作成、削除、動画登録）
    - セレクタ定義と要素取得

- **ニコニコ動画 API 連携** (`src/api/`)
    - getthumbinfo API の呼び出し
    - XML レスポンスのパース

- **暗号化処理** (`src/crypto/`)
    - パスワードの暗号化・復号化（AES-256-GCM）

- **バリデーション** (`src/validation/`)
    - 動画 ID の形式チェック
    - リクエストパラメータのバリデーション

#### web パッケージ (web/)

最小限のユニットテストのみ。主に E2E でカバー。

- ユニットテスト対象なし（E2E でカバー）

#### batch パッケージ (batch/)

最小限のユニットテストのみ。主に統合テストでカバー。

- ユニットテスト対象なし（統合テストでカバー）

### 5.2 テスト対象外

以下はユニットテストの対象外とします:

- ❌ `web/app/**/page.tsx` - E2E でカバー（React 19 + Jest 互換性問題）
- ❌ `web/app/api/**` - E2E でカバー
- ❌ `batch/src/**` - 統合テストでカバー

---

## 6. 統合テスト（batch パッケージ）

### 6.1 テスト戦略

batch パッケージは、テスト専用ニコニコアカウントを使用した実環境統合テストで品質を担保します。

| 項目 | 内容 |
|-----|------|
| **テスト用アカウント** | テスト専用ニコニコアカウントを使用 |
| **実行タイミング** | Full CI |
| **認証情報管理** | AWS Secrets Manager |

### 6.2 統合テストシナリオ

#### BATCH-001: マイリスト登録フロー

**目的**: ニコニコ動画へのログインからマイリスト登録までの一連のフローをテスト

**テストフロー**:

1. テスト専用アカウントでログイン
2. 既存のテスト用マイリストがあれば削除
3. テスト用マイリスト作成（例: `CI_TEST_YYYYMMDD_HHMMSS`）
4. 動画登録（1-2 件程度、待機時間 2 秒）
5. 登録結果の確認
6. テスト用マイリスト削除
7. ログアウト

**期待結果**:

- 各ステップが正常に完了する
- セレクタが正しく動作する（UI 変更の検知）

**テストファイル**: `batch/tests/integration/mylist-registration.spec.ts`

**実行環境要件**:

- テスト専用ニコニコアカウント
- AWS Secrets Manager からの認証情報取得
- 事前に DynamoDB に登録済みの動画データ

### 6.3 テスト用データの準備

統合テストで使用する動画データは、事前に DynamoDB (dev) に登録しておきます。

| 項目 | 内容 |
|-----|------|
| **動画数** | 2-3 件程度 |
| **データ管理** | テスト開始時に存在確認、なければスキップ |
| **クリーンアップ** | テスト用マイリストは削除、DynamoDB のデータは保持 |

---

## 7. 外部連携のモック方針

### 7.1 方針一覧

| 連携先 | E2E テスト | 統合テスト (batch) | 備考 |
|-------|-----------|-------------------|------|
| ニコニコ動画 API (getthumbinfo) | 実 API | - | 負荷のかからない程度に |
| ニコニコ動画 Web サイト | - | 実環境 | テスト専用アカウント使用 |
| Auth プロジェクト | モック | - | JWT を直接発行 |
| DynamoDB | 実環境 (dev) | 実環境 (dev) | テストデータはクリーンアップ |
| AWS Batch | モック | - | 投入 API のレスポンスのみ |

### 7.2 テストデータのクリーンアップ

E2E テスト後、テストで作成したデータは削除します。

```typescript
// テストデータのクリーンアップ例
afterEach(async () => {
    // テストで作成した動画データを削除
    await cleanupTestVideos(testVideoIds);
});
```

---

## 8. テスト実行方法

### 8.1 ローカル環境での実行

#### ユニットテスト (core)

```bash
# すべてのユニットテストを実行
npm run test --workspace=niconico-mylist-assistant-core

# ウォッチモード（ファイル変更時に自動実行）
npm run test:watch --workspace=niconico-mylist-assistant-core

# カバレッジレポート生成
npm run test:coverage --workspace=niconico-mylist-assistant-core
```

#### E2E テスト (web)

```bash
# すべての E2E テストを実行
npm run test:e2e --workspace=niconico-mylist-assistant-web

# 特定のデバイスのみ実行
npm run test:e2e --workspace=niconico-mylist-assistant-web -- --project=chromium-mobile
npm run test:e2e --workspace=niconico-mylist-assistant-web -- --project=chromium-desktop
npm run test:e2e --workspace=niconico-mylist-assistant-web -- --project=webkit-mobile

# UI モードで実行（デバッグ用）
npm run test:e2e:ui --workspace=niconico-mylist-assistant-web

# ブラウザ表示モード（headed モード）
npm run test:e2e:headed --workspace=niconico-mylist-assistant-web
```

#### 統合テスト (batch)

```bash
# 統合テストを実行（要: 認証情報設定）
npm run test:integration --workspace=niconico-mylist-assistant-batch
```

### 8.2 CI 環境での実行

#### GitHub Actions

GitHub Actions で自動実行されます:

**Fast CI** (`.github/workflows/niconico-mylist-assistant-verify-fast.yml`):

- トリガー: `integration/**` ブランチへの PR
- テスト: core ユニットテスト + E2E (chromium-mobile のみ)

**Full CI** (`.github/workflows/niconico-mylist-assistant-verify-full.yml`):

- トリガー: `develop` ブランチへの PR
- テスト: core ユニットテスト + カバレッジチェック + E2E (全デバイス) + batch 統合テスト
- カバレッジ: core パッケージで 80% 未満は失敗

#### 環境変数

CI 環境で必要な環境変数:

```bash
# AWS 認証（GitHub Secrets から取得）
AWS_ACCESS_KEY_ID=<GitHub Secrets>
AWS_SECRET_ACCESS_KEY=<GitHub Secrets>
AWS_REGION=us-east-1

# テスト用認証情報（AWS Secrets Manager から取得）
# - ニコニコ動画テスト用アカウント
# - 暗号化キー（SHARED_SECRET_KEY）
```

---

## 9. CI/CD 統合

### 9.1 ワークフロー構成

| ワークフロー | トリガー | 実行内容 |
|------------|---------|---------|
| niconico-mylist-assistant-verify-fast | PR to `integration/**` | ビルド、core ユニット、E2E (chromium-mobile) |
| niconico-mylist-assistant-verify-full | PR to `develop` | ビルド、core ユニット + カバレッジ、E2E (全デバイス)、batch 統合 |
| niconico-mylist-assistant-deploy | Push to `develop` or `master` | デプロイ（テストは verify で完了済み） |

### 9.2 パスフィルター

```yaml
paths:
  - 'services/niconico-mylist-assistant/**'
  - 'infra/niconico-mylist-assistant/**'
  - 'libs/**'
  - 'package.json'
  - 'package-lock.json'
  - '.github/workflows/niconico-mylist-assistant-verify-*.yml'
```

### 9.3 ブランチ保護ルール

#### `integration/**` ブランチ

- ✅ PR 必須（直接プッシュ禁止）
- ✅ `niconico-mylist-assistant-verify-fast` ワークフローの成功が必須

#### `develop` ブランチ

- ✅ PR 必須（直接プッシュ禁止）
- ✅ `niconico-mylist-assistant-verify-full` ワークフローの成功が必須
- ✅ core パッケージのカバレッジ 80% 以上

#### `master` ブランチ

- ✅ PR 必須（直接プッシュ禁止）
- ✅ 全ての CI/CD チェックの成功が必須
- ✅ レビュー承認が必須

### 9.4 テスト失敗時の対応

#### ユニットテスト失敗

1. ローカルで再現確認
2. 該当テストを修正
3. カバレッジを再確認

#### E2E テスト失敗

1. GitHub Actions のアーティファクトを確認（スクリーンショット、動画、トレース）
2. ローカルで再現確認（`npm run test:e2e:ui`）
3. 不安定なテストの場合はリトライ設定を追加

#### 統合テスト失敗（batch）

1. CloudWatch Logs でエラーログを確認
2. ニコニコ動画の UI 変更の可能性を確認
3. セレクタの修正が必要な場合は core パッケージを更新

#### カバレッジ不足

1. カバレッジレポートを確認（`coverage/lcov-report/index.html`）
2. カバーされていないコードを特定
3. 必要なテストを追加

---

## 10. 既知の問題・制約

### 10.1 技術的制約

#### React 19 + Jest 互換性問題

**問題内容**: React 19 の新しいアーキテクチャと Jest の組み合わせにおいて、Next.js App Router の page コンポーネントを直接ユニットテストすることができない

**影響範囲**: `web/app/**/page.tsx`

**回避策**: E2E テストでカバー。page コンポーネントはカバレッジ対象外に設定

**将来の対応**: React 19 の testing ecosystem が成熟した時点で再評価

#### ニコニコ動画の HTML 構造依存

**問題内容**: Playwright によるブラウザ自動化でニコニコ動画を操作するため、HTML 構造に依存

**影響範囲**: batch パッケージの Playwright セレクタ

**回避策**:
- 統合テストで定期的にセレクタの動作を確認
- 複数の抽出戦略を並行実行（CSS セレクタ、JSON データ、正規表現など）

**将来の対応**: UI 変更検知時は速やかにセレクタを修正

### 10.2 環境依存のテスト

以下のテストは特定の環境が必要です:

| テスト | 必要な環境 |
|-------|-----------|
| E2E テスト | DynamoDB (dev) へのアクセス、ニコニコ動画 API へのアクセス |
| batch 統合テスト | AWS Secrets Manager からの認証情報取得、テスト専用ニコニコアカウント |

---

## 11. テスト作成ガイドライン

### 11.1 ユニットテスト作成ガイドライン

#### 原則

- **純粋関数を優先**: 副作用のないテストしやすいコード
- **一つのテストで一つの検証**: テストケースを小さく保つ
- **AAA パターン**: Arrange（準備）、Act（実行）、Assert（検証）

#### 命名規則

```typescript
describe('ニコニコ動画 API', () => {
    describe('getVideoInfo', () => {
        it('正常系: 動画 ID から動画情報を取得できる', () => {
            // テストコード
        });

        it('異常系: 存在しない動画 ID の場合はエラーを返す', () => {
            // テストコード
        });

        it('エッジケース: 空の動画 ID の場合はバリデーションエラー', () => {
            // テストコード
        });
    });
});
```

#### モック対象

以下のような副作用がある処理のみモック化:

- 外部 API 呼び出し（ニコニコ動画 API）
- DynamoDB 操作
- 暗号化キーの取得（Secrets Manager）

### 11.2 E2E テスト作成ガイドライン

#### 原則

- **ユーザー視点**: 実際の利用シナリオに沿って記述
- **安定性優先**: 不安定なテストは修正するか削除
- **独立性**: テスト間で状態を共有しない
- **クリーンアップ**: テストデータは必ず削除

#### テスト粒度

- 主要フローは細かくテスト
- 枝葉の機能は重要度に応じて判断
- 過度に細かいテストは避ける（メンテナンスコスト増）

#### 認証のモック

```typescript
// テスト用 JWT を直接設定
test.beforeEach(async ({ context }) => {
    await context.addCookies([
        {
            name: 'nagiyu-session',
            value: generateTestJWT({ userId: 'test-user-id' }),
            domain: 'localhost',
            path: '/',
        },
    ]);
});
```

### 11.3 統合テスト作成ガイドライン（batch）

#### 原則

- **実環境テスト**: テスト専用アカウントを使用した実環境テスト
- **クリーンアップ必須**: テスト用マイリストは必ず削除
- **待機時間の遵守**: 動画登録間の 2 秒待機を守る

#### テスト構造

```typescript
describe('マイリスト登録フロー', () => {
    let testMylistName: string;

    beforeAll(async () => {
        // テスト専用アカウントでログイン
        await login(testAccount);
    });

    afterAll(async () => {
        // テスト用マイリストを削除
        await deleteMylist(testMylistName);
        // ログアウト
        await logout();
    });

    it('マイリストを作成して動画を登録できる', async () => {
        testMylistName = `CI_TEST_${Date.now()}`;
        // テスト実行
    });
});
```

---

## 12. トラブルシューティング

### 12.1 よくある問題

#### E2E テストがタイムアウトする

**症状**: E2E テストが Playwright のタイムアウト（30 秒）で失敗

**原因**: ページのロードが遅い、または要素が見つからない

**解決方法**:
1. `npm run test:e2e:ui` で UI モードで確認
2. セレクタが正しいか確認
3. 必要に応じて `waitFor` を追加

#### 統合テストでログインに失敗する

**症状**: ニコニコ動画へのログインが失敗

**原因**: 認証情報の問題、または UI 変更

**解決方法**:
1. AWS Secrets Manager の認証情報を確認
2. ニコニコ動画のログインページの UI 変更を確認
3. セレクタを更新

#### カバレッジが 80% に達しない

**症状**: core パッケージのカバレッジが目標値未満

**原因**: テストケースの不足

**解決方法**:
1. カバレッジレポートで未カバーの行を確認
2. 不足しているテストケースを追加
3. テスト困難なコードは設計を見直す

### 12.2 デバッグ方法

#### ユニットテストのデバッグ

```bash
# 特定のテストのみ実行
npm run test --workspace=niconico-mylist-assistant-core -- --testNamePattern="getVideoInfo"

# デバッグ情報を出力
npm run test --workspace=niconico-mylist-assistant-core -- --verbose
```

#### E2E テストのデバッグ

```bash
# UI モードで実行（ステップバイステップで確認）
npm run test:e2e:ui --workspace=niconico-mylist-assistant-web

# ブラウザ表示モードで実行
npm run test:e2e:headed --workspace=niconico-mylist-assistant-web

# トレースビューアーで結果を確認
npx playwright show-trace {trace-file}
```

#### 統合テストのデバッグ

```bash
# ヘッドモードで実行（ブラウザ表示）
HEADLESS=false npm run test:integration --workspace=niconico-mylist-assistant-batch

# スクリーンショットを保存
# テストコード内で page.screenshot() を追加
```

---

## 13. 参考資料

### プラットフォームドキュメント

- [テスト戦略 (全体方針)](../../docs/development/testing.md)
- [コーディング規約](../../docs/development/rules.md)
- [共通設定ファイル](../../docs/development/configs.md)

### サービス固有ドキュメント

- [要件定義](./requirements.md)
- [アーキテクチャ設計](./architecture.md)
- [API 仕様書](./api-spec.md)
- [デプロイ・運用](./deployment.md)
