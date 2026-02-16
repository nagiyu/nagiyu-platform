# Admin サービス テスト仕様書

---

## 1. テスト戦略概要

### 1.1 テストの目的

Admin サービスのテストは、以下の目的で実施します：

- **Phase 1 の主要機能の動作保証**: SSO 連携、JWT 検証、ダッシュボード表示の正常動作を確認
- **リグレッション防止**: コード変更によって既存機能が壊れないことを保証
- **品質保証**: ビジネスロジックの正確性、UI の適切な動作を検証

### 1.2 テスト方針

- **スマホファースト**: モバイルデバイスでの動作を優先的にテスト（chromium-mobile を Fast CI で実行）
- **ビジネスロジック重視**: JWT 検証、RBAC などのビジネスロジックを重点的にユニットテスト
- **E2E でクリティカルパスをカバー**: ダッシュボード表示、認証フローを E2E でカバー
- **認証フロー分離**: Google OAuth、JWT 発行は Auth サービスの責務としてテスト対象外

---

## 2. テストデバイス/ブラウザ構成

### 2.1 Playwright デバイス構成

| デバイス名       | 用途               | 画面サイズ  | User Agent              |
| ---------------- | ------------------ | ----------- | ----------------------- |
| chromium-desktop | デスクトップChrome | 1920x1080   | Chrome (最新安定版)     |
| chromium-mobile  | モバイルChrome     | Pixel 5相当 | Chrome Mobile (Android) |
| webkit-mobile    | モバイルSafari     | iPhone相当  | Safari Mobile (iOS)     |

### 2.2 テスト優先順位

プラットフォーム共通のCI戦略については、[ブランチ戦略 - CI/CD戦略](../../branching.md#cicd-戦略) を参照してください。

**概要**:
- **Fast CI**: `integration/**` へのPR時に chromium-mobile のみでテスト
- **Full CI**: `develop` へのPR時に全デバイスでテストし、カバレッジ80%以上を必須とする

---

## 3. カバレッジ目標

### 3.1 カバレッジ目標値

| カテゴリ                | カバレッジ目標     | 測定方法      |
| ----------------------- | ------------------ | ------------- |
| ビジネスロジック (lib/) | 80%以上            | Jest coverage |
| ユーティリティ関数      | 80%以上            | Jest coverage |
| UI コンポーネント       | 任意 (E2Eでカバー) | E2E テスト    |
| API Routes              | 任意 (E2Eでカバー) | E2E テスト    |

### 3.2 カバレッジ対象外

以下は Jest のカバレッジ対象外とします（E2E テストでカバー）:

- `app/**/page.tsx` - Next.js App Router の page コンポーネント
- `app/**/layout.tsx` - レイアウトコンポーネント
- `middleware.ts` - Next.js Middleware（E2E で間接的にテスト）
- `next.config.ts` - Next.js 設定ファイル

### 3.3 カバレッジ計測方法

```bash
# カバレッジレポート生成
npm run test:coverage -w @nagiyu/admin

# カバレッジ結果の確認
# - コンソール出力: サマリー
# - coverage/lcov-report/index.html: 詳細レポート
```

**カバレッジ閾値**:

`jest.config.ts` で 80% 未満の場合はテストを失敗させる設定:

```typescript
coverageThreshold: {
  global: {
    branches: 80,
    functions: 80,
    lines: 80,
    statements: 80,
  },
}
```

---

## 4. E2Eテストシナリオ

### 4.1 テストシナリオ一覧

| シナリオID | シナリオ名                     | 概要                                                        | 優先度 | 対象デバイス |
| ---------- | ------------------------------ | ----------------------------------------------------------- | ------ | ------------ |
| E2E-001    | ダッシュボード基本表示         | 認証後のダッシュボードが正常に表示されることを確認          | 高     | 全デバイス   |
| E2E-002    | ユーザー情報表示               | ダッシュボードでユーザー情報が正しく表示されることを確認    | 高     | 全デバイス   |
| E2E-003    | 認証ステータス表示             | JWT 有効期限などの認証情報が表示されることを確認            | 中     | 全デバイス   |
| E2E-004    | レスポンシブデザイン           | モバイル・デスクトップで適切にレイアウトが切り替わることを確認 | 中     | 全デバイス   |

**テスト対象外**:

- ❌ Google OAuth ログインフロー → **Auth サービスでテスト**
- ❌ JWT 発行・検証ロジック → **Auth サービスでテスト**
- ❌ Auth ↔ Admin 間の SSO フロー全体 → **実環境で確認**
- ❌ ログアウトフロー → **実環境で確認**
- ❌ JWT 期限切れ処理 → **実環境で確認**

### 4.2 シナリオ詳細

#### E2E-001: ダッシュボード基本表示

**目的**: 認証後のダッシュボードが正常に表示されることを確認

**前提条件**:

- テスト環境では `SKIP_AUTH_CHECK=true` を設定
- モックセッションが提供される

**テスト手順**:

1. ダッシュボード (`/dashboard`) にアクセス
2. Header に "Admin" タイトルが表示される
3. ユーザー情報カードが表示される
4. 認証ステータスカードが表示される
5. Footer が表示される

**期待結果**:

- 全ての UI コンポーネントが正常に表示される
- レイアウトが崩れていない

**テストファイル**: `tests/e2e/dashboard.spec.ts`

**実行環境要件**:

- `.env.test` に `SKIP_AUTH_CHECK=true` が設定されている

#### E2E-002: ユーザー情報表示

**目的**: ダッシュボードでユーザー情報が正しく表示されることを確認

**前提条件**:

- E2E-001 が正常に完了
- モックセッションに以下の情報が含まれる:
  - `email`: `test@example.com`
  - `roles`: `["admin"]`

**テスト手順**:

1. ダッシュボードにアクセス
2. ユーザー情報カードを確認
3. メールアドレスが表示される
4. ロール一覧が表示される

**期待結果**:

- メールアドレス: `test@example.com`
- ロール: `admin` バッジが表示される

**テストファイル**: `tests/e2e/dashboard-display.spec.ts`

#### E2E-003: 認証ステータス表示

**目的**: JWT 有効期限などの認証情報が表示されることを確認

**前提条件**:

- E2E-001 が正常に完了

**テスト手順**:

1. ダッシュボードにアクセス
2. 認証ステータスカードを確認
3. 動作確認メッセージが表示される

**期待結果**:

- "Auth サービスとの SSO 連携が正常に動作しています" メッセージが表示される

**テストファイル**: `tests/e2e/dashboard-display.spec.ts`

#### E2E-004: レスポンシブデザイン

**目的**: モバイル・デスクトップで適切にレイアウトが切り替わることを確認

**前提条件**:

- E2E-001 が正常に完了

**テスト手順**:

1. chromium-mobile でダッシュボードにアクセス
2. UI が縦積みレイアウトで表示されることを確認
3. chromium-desktop でダッシュボードにアクセス
4. UI が横並びレイアウトで表示されることを確認

**期待結果**:

- モバイル: 375px 幅で縦積みレイアウト
- デスクトップ: 1920px 幅で横並びレイアウト

**テストファイル**: `tests/e2e/dashboard.spec.ts`

---

## 5. ユニットテスト対象

### 5.1 テスト対象の分類

#### ビジネスロジック (lib/)

- **JWT 検証** (`lib/auth/jwt.ts`)
    - JWT の署名検証
    - 有効期限チェック
    - 発行者（issuer）検証
    - クレームの抽出
- **権限チェック** (`lib/auth/permissions.ts`)
    - ロールベースの権限チェック
    - 権限不足時のエラーハンドリング

#### ユーティリティ関数

現時点では Admin サービスに独自のユーティリティ関数は存在しません。必要に応じて追加します。

#### UI コンポーネント

基本的には E2E でカバーしますが、複雑なロジックを持つコンポーネントはユニットテストを追加します。

### 5.2 テスト対象外

以下はユニットテストの対象外とします:

- ❌ Next.js App Router の page コンポーネント (`app/**/page.tsx`) - E2E でカバー
- ❌ レイアウトコンポーネント (`app/**/layout.tsx`) - E2E でカバー
- ❌ Next.js Middleware (`middleware.ts`) - E2E で間接的にテスト
- ❌ シンプルな UI コンポーネント - E2E でカバー

---

## 6. テスト実行方法

### 6.1 ローカル環境での実行

#### ユニットテスト

```bash
# すべてのユニットテストを実行
npm run test -w @nagiyu/admin

# ウォッチモード（ファイル変更時に自動実行）
npm run test:watch -w @nagiyu/admin

# カバレッジレポート生成
npm run test:coverage -w @nagiyu/admin

# 特定のテストファイルのみ実行
npm run test -w @nagiyu/admin -- tests/unit/lib/auth/jwt.test.ts
```

#### E2Eテスト

```bash
# すべての E2E テストを実行
npm run test:e2e -w @nagiyu/admin

# 特定のデバイスのみ実行
npm run test:e2e -w @nagiyu/admin -- --project=chromium-mobile
npm run test:e2e -w @nagiyu/admin -- --project=chromium-desktop
npm run test:e2e -w @nagiyu/admin -- --project=webkit-mobile

# 特定のテストファイルのみ実行
npm run test:e2e -w @nagiyu/admin -- tests/e2e/dashboard.spec.ts

# UI モードで実行（デバッグ用）
npm run test:e2e:ui -w @nagiyu/admin

# ブラウザ表示モード（headed モード）
npm run test:e2e:headed -w @nagiyu/admin
```

### 6.2 CI環境での実行

#### GitHub Actions

GitHub Actions で自動実行されます:

**Fast CI** (`.github/workflows/admin-verify-fast.yml`):

- トリガー: `integration/**` ブランチへのPR
- テスト: ユニットテスト + E2E (chromium-mobile のみ)

**Full CI** (`.github/workflows/admin-verify-full.yml`):

- トリガー: `develop` ブランチへのPR
- テスト: ユニットテスト + カバレッジチェック + E2E (全デバイス)
- カバレッジ: 80%未満で失敗

#### 環境変数

CI 環境で必要な環境変数:

```bash
SKIP_AUTH_CHECK=true           # 認証チェックをスキップ（テスト環境のみ）
TEST_USER_EMAIL=test@example.com
TEST_USER_ROLES=admin
CI=true                        # CI 環境フラグ
```

---

## 7. CI/CD統合

### 7.1 ワークフロー構成

| ワークフロー        | トリガー                | 実行内容                                       |
| ------------------- | ----------------------- | ---------------------------------------------- |
| admin-verify-fast   | PR to `integration/**`  | ビルド、ユニット、E2E (chromium-mobile)        |
| admin-verify-full   | PR to `develop`         | ビルド、ユニット、カバレッジ、E2E (全デバイス) |
| admin-deploy        | Push to `develop` or `master` | デプロイ（テストは verify で完了済み）         |

### 7.2 ブランチ保護ルール

#### `integration/**` ブランチ

- ✅ PR 必須（直接プッシュ禁止）
- ✅ `admin-verify-fast` ワークフローの成功が必須
- ✅ リントチェック、フォーマットチェックの成功が必須

#### `develop` ブランチ

- ✅ PR 必須（直接プッシュ禁止）
- ✅ `admin-verify-full` ワークフローの成功が必須
- ✅ カバレッジ 80%以上の確保（Jest の `coverageThreshold` により自動チェック）
- ✅ リントチェック、フォーマットチェックの成功が必須

#### `master` ブランチ

- ✅ PR 必須（直接プッシュ禁止）
- ✅ 全ての CI/CD チェックの成功が必須
- ✅ レビュー承認が必須（推奨）

### 7.3 テスト失敗時の対応

#### ユニットテスト失敗

1. ローカルで再現確認
2. 該当テストを修正
3. カバレッジを再確認

```bash
# ローカルで再現確認
npm run test -w @nagiyu/admin -- tests/unit/lib/auth/jwt.test.ts
```

#### E2Eテスト失敗

1. GitHub Actions のアーティファクトを確認（スクリーンショット、動画、トレース）
2. ローカルで再現確認（`npm run test:e2e:ui -w @nagiyu/admin`）
3. 不安定なテストの場合はリトライ設定を追加

```bash
# ローカルで UI モードで再現確認
npm run test:e2e:ui -w @nagiyu/admin
```

#### カバレッジ不足

1. カバレッジレポートを確認（`coverage/lcov-report/index.html`）
2. カバーされていないコードを特定
3. 必要なテストを追加

```bash
# カバレッジレポート生成
npm run test:coverage -w @nagiyu/admin
# → coverage/lcov-report/index.html をブラウザで開く
```

---

## 8. テスト環境

### 8.1 環境変数

テストは `.env.test` の設定を使用します:

```env
# 認証チェックをスキップ（テスト環境のみ）
SKIP_AUTH_CHECK=true

# テストユーザー設定
TEST_USER_EMAIL=test@example.com
TEST_USER_ROLES=admin
```

### 8.2 認証のスキップ

`SKIP_AUTH_CHECK=true` を設定することで:

1. **Middleware** (`src/middleware.ts`) で認証チェックがスキップされる
2. **getSession()** (`src/lib/auth/session.ts`) がモックセッションを返す

これにより、Auth サービスを起動せずに Admin の機能テストが可能になります。

**注意**: `SKIP_AUTH_CHECK` は**テスト環境専用**の設定です。本番環境では設定しないでください。

---

## 9. 実環境での確認事項

以下の項目は E2E テストではカバーできないため、実環境（または統合テスト環境）で手動確認が必要です:

1. **Google OAuth ログイン**
    - Auth サービスの `/signin` から Google でログイン
    - 正しくユーザー情報が取得できるか
2. **Auth → Admin SSO フロー**
    - Auth でログイン後、Admin にアクセス
    - セッションが共有されているか（`.nagiyu.com` ドメインのクッキー）
3. **JWT 期限切れ処理**
    - JWT の有効期限が切れた後、Auth にリダイレクトされるか
4. **ログアウトフロー**
    - Admin からログアウト
    - Auth サービスのログアウトが実行されるか
    - 全サービスでセッションが無効化されるか

---

## 10. 既知の問題・制約

### 10.1 技術的制約

#### React 19 + Jest の互換性問題

**問題内容**: React 19 は Jest との互換性に問題がある可能性があります。

**影響範囲**: ユニットテストでコンポーネントをテストする場合

**回避策**: E2E テストでコンポーネントの動作を検証し、ユニットテストはビジネスロジックに集中

**将来の対応**: React Testing Library の React 19 対応が完了次第、コンポーネントのユニットテストを追加

### 10.2 環境依存のテスト

以下のテストは特定の環境が必要です:

- **SSO フロー全体**: Auth サービスが稼働している統合テスト環境、または実環境
- **JWT 期限切れ処理**: 実際の JWT を発行できる環境

---

## 11. テスト作成ガイドライン

### 11.1 ユニットテスト作成ガイドライン

#### 原則

- **純粋関数を優先**: 副作用のないテストしやすいコード
- **一つのテストで一つの検証**: テストケースを小さく保つ
- **AAA パターン**: Arrange（準備）、Act（実行）、Assert（検証）

#### 命名規則

```typescript
describe('JWT 検証', () => {
    describe('verifyJWT', () => {
        it('正常系: 有効な JWT の場合、ペイロードを返す', () => {
            // テストコード
        });

        it('異常系: 署名が無効な場合、エラーをスロー', () => {
            // テストコード
        });

        it('エッジケース: 有効期限切れの場合、エラーをスロー', () => {
            // テストコード
        });
    });
});
```

#### モック対象

以下のような副作用がある処理のみモック化:

- 外部 API 呼び出し
- 環境変数の読み取り
- 時刻依存の処理（`Date.now()` など）

### 11.2 E2Eテスト作成ガイドライン

#### 原則

- **ユーザー視点**: 実際の利用シナリオに沿って記述
- **安定性優先**: 不安定なテストは修正するか削除
- **独立性**: テスト間で状態を共有しない

#### テスト粒度

- 主要フローは細かくテスト
- 枝葉の機能は重要度に応じて判断
- 過度に細かいテストは避ける（メンテナンスコスト増）

---

## 12. トラブルシューティング

### 12.1 よくある問題

#### テストが失敗する

**症状**: E2E テストが失敗する

**原因**: `.env.test` に `SKIP_AUTH_CHECK=true` が設定されていない

**解決方法**:

```bash
# .env.test を作成
echo "SKIP_AUTH_CHECK=true" > services/admin/web/.env.test
echo "TEST_USER_EMAIL=test@example.com" >> services/admin/web/.env.test
echo "TEST_USER_ROLES=admin" >> services/admin/web/.env.test
```

#### Playwright のブラウザがインストールされていない

**症状**: E2E テストで "Executable doesn't exist" エラー

**解決方法**:

```bash
npx playwright install
```

#### 本番環境で認証が動作しない

**症状**: 本番環境で認証が無効化されている

**原因**: `.env` や `.env.production` に `SKIP_AUTH_CHECK=true` が設定されている

**解決方法**: 本番環境の環境変数から `SKIP_AUTH_CHECK` を削除

### 12.2 デバッグ方法

#### ユニットテストのデバッグ

```bash
# 特定のテストのみ実行
npm run test -w @nagiyu/admin -- tests/unit/lib/auth/jwt.test.ts

# デバッグ情報を出力
npm run test -w @nagiyu/admin -- --verbose
```

#### E2Eテストのデバッグ

```bash
# UI モードで実行（ステップバイステップで確認）
npm run test:e2e:ui -w @nagiyu/admin

# ブラウザ表示モードで実行
npm run test:e2e:headed -w @nagiyu/admin

# トレースビューアーで結果を確認
npx playwright show-trace test-results/{trace-file}
```

---

## 13. 参考資料

### プラットフォームドキュメント

- [テスト戦略 (全体方針)](../../development/testing.md)
- [コーディング規約](../../development/rules.md)
- [共通設定ファイル](../../development/configs.md)

### サービス固有ドキュメント

- [要件定義](./requirements.md)
- [アーキテクチャ設計](./architecture.md)
- [デプロイ・運用](./deployment.md)
