# Auth サービス テスト仕様書

---

## 1. テスト戦略概要

### 1.1 テストの目的

Auth サービスは nagiyu プラットフォームの認証・認可の中核を担うため、高い品質とセキュリティが求められます。テストの実施により、以下を保証します:

- Google OAuth 認証フローの正常動作
- JWT トークン発行・検証の正確性
- ユーザー管理 API の動作保証
- ロール・権限チェックの確実性
- リグレッションの防止
- セキュリティ脆弱性の早期発見

### 1.2 テスト方針

- **スマホファースト**: モバイル Chrome を最優先でテスト (Fast CI)
- **カバレッジ重視**: ビジネスロジックのテストカバレッジ 80%以上を必須
- **セキュリティ重視**: 権限チェック、入力検証、CSRF対策を重点的にテスト
- **自動化**: CI/CD パイプラインで全テストを自動実行
- **E2Eでクリティカルパス**: 認証フロー、ユーザー管理の主要機能を E2E でカバー

---

## 2. テストデバイス/ブラウザ構成

### 2.1 Playwright デバイス構成

| デバイス名       | 用途               | 画面サイズ  | User Agent              |
| ---------------- | ------------------ | ----------- | ----------------------- |
| chromium-desktop | デスクトップChrome | 1920x1080   | Chrome (最新安定版)     |
| chromium-mobile  | モバイルChrome     | Pixel 5相当 | Chrome Mobile (Android) |
| webkit-mobile    | モバイルSafari     | iPhone相当  | Safari Mobile (iOS)     |

### 2.2 テスト優先順位

#### Fast CI (高速フィードバック)

- **対象**: chromium-mobile のみ
- **目的**: 開発中の素早いフィードバック
- **トリガー**: `integration/**` ブランチへのPR

#### Full CI (完全テスト)

- **対象**: chromium-desktop, chromium-mobile, webkit-mobile
- **目的**: マージ前の完全な品質検証
- **トリガー**: `develop` ブランチへのPR

---

## 3. カバレッジ目標

### 3.1 カバレッジ目標値

| カテゴリ                  | カバレッジ目標     | 測定方法      |
| ------------------------- | ------------------ | ------------- |
| ビジネスロジック (lib/)   | 80%以上            | Jest coverage |
| ユーティリティ関数        | 80%以上            | Jest coverage |
| UI コンポーネント         | 任意 (E2Eでカバー) | E2E テスト    |
| API Routes                | 任意 (E2Eでカバー) | E2E テスト    |

**Full CI では Jest の `coverageThreshold` により、80%未満でビルドが失敗します。**

### 3.2 カバレッジ対象外

以下は Jest のカバレッジ対象外とします（E2E テストでカバー）:

- `app/**/page.tsx` - Next.js App Router の page コンポーネント
- `app/**/layout.tsx` - レイアウトコンポーネント
- `app/api/**/route.ts` - API Routes (E2E でカバー)
- `middleware.ts` - Next.js ミドルウェア (E2E でカバー)

### 3.3 カバレッジ計測方法

```bash
# カバレッジレポート生成
npm run test:coverage -w auth

# カバレッジ結果の確認
# - コンソール出力: サマリー
# - coverage/lcov-report/index.html: 詳細レポート
```

---

## 4. E2Eテストシナリオ

### 4.1 テストシナリオ一覧

| シナリオID | シナリオ名                 | 概要                                           | 優先度 | 対象デバイス |
| ---------- | -------------------------- | ---------------------------------------------- | ------ | ------------ |
| E2E-001    | Google OAuth ログイン      | Google アカウントでログインする                | 高     | 全デバイス   |
| E2E-002    | サインアウト               | ログアウトする                                 | 高     | 全デバイス   |
| E2E-003    | ユーザー一覧の閲覧         | 管理者がユーザー一覧を閲覧する                 | 高     | 全デバイス   |
| E2E-004    | ユーザー情報の編集         | 管理者がユーザー名を編集する                   | 高     | 全デバイス   |
| E2E-005    | ロールの割り当て           | 管理者がユーザーにロールを割り当てる           | 高     | 全デバイス   |
| E2E-006    | 権限チェック (403 エラー)  | 権限不足のユーザーがアクセスできないことを確認 | 高     | chromium-mobile のみ |
| E2E-007    | SSO (他サービスへのアクセス) | Auth ログイン後、admin サービスにアクセス      | 中     | chromium-mobile のみ |

### 4.2 シナリオ詳細

#### E2E-001: Google OAuth ログイン

**目的**: Google アカウントを使用した認証フローが正常に動作することを確認

**前提条件**:
- テスト用 Google アカウントが用意されている
- Auth サービスがデプロイされている

**テスト手順**:
1. `/signin` にアクセス
2. 「Google でログイン」ボタンをクリック
3. Google OAuth 認証画面で認証情報を入力
4. 同意画面で「許可」をクリック
5. Auth サービスにリダイレクトされる

**期待結果**:
- JWT クッキー (`nagiyu-session`) がセットされている
- ダッシュボードまたは指定された callbackUrl にリダイレクトされる
- `/api/auth/session` にアクセスすると、ユーザー情報が取得できる

**テストファイル**: `tests/e2e/auth-login.spec.ts`

**実行環境要件**:
- Google OAuth テスト用アカウント認証情報が環境変数で設定されている

#### E2E-002: サインアウト

**目的**: サインアウト機能が正常に動作することを確認

**前提条件**:
- ログイン済み

**テスト手順**:
1. 「サインアウト」ボタンをクリック
2. サインインページにリダイレクトされる

**期待結果**:
- JWT クッキー (`nagiyu-session`) が削除されている
- `/api/auth/session` にアクセスすると、ユーザー情報が null

**テストファイル**: `tests/e2e/auth-logout.spec.ts`

**実行環境要件**:
- なし

#### E2E-003: ユーザー一覧の閲覧

**目的**: 管理者がユーザー一覧を閲覧できることを確認

**前提条件**:
- 管理者権限 (users:read) を持つユーザーでログイン済み
- DynamoDB に複数のユーザーが登録されている

**テスト手順**:
1. `/users` にアクセス
2. ユーザー一覧テーブルが表示される
3. 各ユーザーのメールアドレス、名前、ロールが表示されている

**期待結果**:
- ユーザー一覧が表示される
- ページネーションが機能する
- 各ユーザーをクリックすると詳細ページに遷移

**テストファイル**: `tests/e2e/user-list.spec.ts`

**実行環境要件**:
- DynamoDB にテストユーザーが登録されている

#### E2E-004: ユーザー情報の編集

**目的**: 管理者がユーザー情報を編集できることを確認

**前提条件**:
- 管理者権限 (users:write) を持つユーザーでログイン済み
- 編集対象のテストユーザーが存在

**テスト手順**:
1. ユーザー一覧からテストユーザーをクリック
2. ユーザー詳細・編集ページが表示される
3. 名前を変更
4. 「保存」ボタンをクリック

**期待結果**:
- 名前が DynamoDB に保存される
- ユーザー一覧に戻り、変更が反映されている

**テストファイル**: `tests/e2e/user-edit.spec.ts`

**実行環境要件**:
- DynamoDB にテストユーザーが登録されている

#### E2E-005: ロールの割り当て

**目的**: 管理者がユーザーにロールを割り当てられることを確認

**前提条件**:
- 管理者権限 (roles:assign) を持つユーザーでログイン済み
- ロール割り当て対象のテストユーザーが存在

**テスト手順**:
1. ユーザー一覧からテストユーザーをクリック
2. ロールセレクトボックスから "user-manager" を選択
3. 「保存」ボタンをクリック

**期待結果**:
- ロールが DynamoDB に保存される
- ユーザー一覧に戻り、ロールが "user-manager" に変更されている

**テストファイル**: `tests/e2e/user-role-assign.spec.ts`

**実行環境要件**:
- DynamoDB にテストユーザーが登録されている

#### E2E-006: 権限チェック (403 エラー)

**目的**: 権限不足のユーザーがアクセスできないことを確認

**前提条件**:
- 一般ユーザー (users:read 権限なし) でログイン済み

**テスト手順**:
1. `/users` にアクセス

**期待結果**:
- 403 Forbidden エラーが表示される
- または、エラーページにリダイレクトされる

**テストファイル**: `tests/e2e/permission-check.spec.ts`

**実行環境要件**:
- DynamoDB に権限のないテストユーザーが登録されている

#### E2E-007: SSO (他サービスへのアクセス)

**目的**: Auth サービスでログイン後、他サービスに自動的にログインできることを確認

**前提条件**:
- Auth サービスでログイン済み
- Admin サービスがデプロイされている (Phase 2+)

**テスト手順**:
1. Auth サービスでログイン
2. `admin.nagiyu.com` にアクセス

**期待結果**:
- 再ログインなしで Admin サービスのダッシュボードが表示される
- JWT クッキーが自動的に送信される

**テストファイル**: `tests/e2e/sso.spec.ts`

**実行環境要件**:
- Admin サービスがデプロイされている (Phase 2 以降)

---

## 5. ユニットテスト対象

### 5.1 テスト対象の分類

#### ビジネスロジック (lib/)

- **認証・権限チェック** (`lib/auth/`)
    - `hasPermission()` - 単一権限チェック
    - `hasAnyPermission()` - OR 条件チェック
    - `hasAllPermissions()` - AND 条件チェック
    - `requirePermission()` - 権限なしの場合にエラーをスロー

- **ロール・権限定義** (`lib/auth/roles.ts`)
    - ROLES 定数の型チェック
    - ロール ID の一意性
    - 権限の命名規則 (`{resource}:{action}`)

#### ユーティリティ関数

- **ユーザー ID 生成** (`lib/utils/user-id.ts`)
    - UUID v4 形式の検証
    - 一意性の検証

- **日時フォーマット** (`lib/utils/date.ts`)
    - ISO 8601 形式への変換
    - タイムゾーン非依存

#### API Routes

**注意**: API Routes は基本的に E2E でカバーしますが、複雑なバリデーションロジックがある場合はユニットテストを追加します。

- **入力検証** (Zod スキーマ)
    - ユーザー情報更新の入力検証
    - エラーメッセージの確認

### 5.2 テスト対象外

以下はユニットテストの対象外とします:

- ❌ Next.js App Router の page コンポーネント (`app/**/page.tsx`) - E2E でカバー
- ❌ レイアウトコンポーネント (`app/**/layout.tsx`) - E2E でカバー
- ❌ API Routes (`app/api/**/route.ts`) - E2E でカバー
- ❌ シンプルな UI コンポーネント - E2E でカバー

---

## 6. テスト実行方法

### 6.1 ローカル環境での実行

#### ユニットテスト

```bash
# すべてのユニットテストを実行
npm run test -w auth

# ウォッチモード（ファイル変更時に自動実行）
npm run test:watch -w auth

# カバレッジレポート生成
npm run test:coverage -w auth

# 特定のテストファイルのみ実行
npm run test -w auth -- tests/unit/auth/permissions.test.ts
```

#### E2Eテスト

```bash
# すべての E2E テストを実行
npm run test:e2e -w auth

# 特定のデバイスのみ実行
npm run test:e2e -w auth -- --project=chromium-mobile
npm run test:e2e -w auth -- --project=chromium-desktop
npm run test:e2e -w auth -- --project=webkit-mobile

# 特定のテストファイルのみ実行
npm run test:e2e -w auth tests/e2e/auth-login.spec.ts

# UI モードで実行（デバッグ用）
npm run test:e2e:ui -w auth

# ブラウザ表示モード（headed モード）
npm run test:e2e:headed -w auth
```

### 6.2 CI環境での実行

#### GitHub Actions

GitHub Actions で自動実行されます:

**Fast CI** (`.github/workflows/auth-verify-fast.yml`):

- トリガー: `integration/**` ブランチへのPR
- テスト: ユニットテスト + E2E (chromium-mobile のみ)

**Full CI** (`.github/workflows/auth-verify-full.yml`):

- トリガー: `develop` ブランチへのPR
- テスト: ユニットテスト + カバレッジチェック + E2E (全デバイス)
- カバレッジ: 80%未満で失敗

#### 環境変数

CI 環境で必要な環境変数:

```bash
GOOGLE_TEST_EMAIL={テスト用 Google アカウント}
GOOGLE_TEST_PASSWORD={パスワード}
NEXTAUTH_URL=https://dev-auth.nagiyu.com
```

---

## 7. CI/CD統合

### 7.1 ワークフロー構成

| ワークフロー        | トリガー                | 実行内容                                       |
| ------------------- | ----------------------- | ---------------------------------------------- |
| auth-verify-fast    | PR to `integration/**`  | ビルド、ユニット、E2E (chromium-mobile)        |
| auth-verify-full    | PR to `develop`         | ビルド、ユニット、カバレッジ、E2E (全デバイス) |
| auth-deploy         | Push to `develop` or `master` | デプロイ（テストは verify で完了済み）         |

### 7.2 ブランチ保護ルール

#### `integration/**` ブランチ

- ✅ PR 必須（直接プッシュ禁止）
- ✅ `auth-verify-fast` ワークフローの成功が必須

#### `develop` ブランチ

- ✅ PR 必須（直接プッシュ禁止）
- ✅ `auth-verify-full` ワークフローの成功が必須
- ✅ カバレッジ 80%以上の確保（Jest の `coverageThreshold` により自動チェック）

#### `master` ブランチ

- ✅ PR 必須（直接プッシュ禁止）
- ✅ 全ての CI/CD チェックの成功が必須
- ✅ レビュー承認が必須（推奨）

### 7.3 テスト失敗時の対応

#### ユニットテスト失敗

1. ローカルで再現確認
2. 該当テストを修正
3. カバレッジを再確認

#### E2Eテスト失敗

1. GitHub Actions のアーティファクトを確認（スクリーンショット、動画、トレース）
2. ローカルで再現確認（`npm run test:e2e:ui -w auth`）
3. 不安定なテストの場合はリトライ設定を追加

#### カバレッジ不足

1. カバレッジレポートを確認（`coverage/lcov-report/index.html`）
2. カバーされていないコードを特定
3. 必要なテストを追加

---

## 8. 既知の問題・制約

### 8.1 技術的制約

#### Google OAuth テスト

**問題内容**: Google OAuth は実際の Google アカウントが必要なため、完全な自動化が困難

**影響範囲**: E2E テストの OAuth フロー

**回避策**: 
- テスト用 Google アカウントを用意
- 環境変数で認証情報を管理
- CI 環境では GitHub Secrets で管理

**将来の対応**: Mock OAuth プロバイダーの導入を検討 (Phase 2 以降)

#### DynamoDB のモック

**問題内容**: ユニットテストで DynamoDB をモックする必要がある

**影響範囲**: ユーザー管理ロジックのユニットテスト

**回避策**: 
- AWS SDK のモックライブラリ (aws-sdk-client-mock) を使用
- E2E テストでは実際の DynamoDB を使用

**将来の対応**: DynamoDB Local の導入を検討

### 8.2 環境依存のテスト

以下のテストは特定の環境が必要です:

- **E2E テスト (OAuth ログイン)**: 実際の Google OAuth 認証情報が必要
- **E2E テスト (ユーザー管理)**: DynamoDB にテストデータが必要
- **E2E テスト (SSO)**: Admin サービスがデプロイされている必要がある (Phase 2 以降)

---

## 9. テスト作成ガイドライン

### 9.1 ユニットテスト作成ガイドライン

#### 原則

- **純粋関数を優先**: 副作用のないテストしやすいコード
- **一つのテストで一つの検証**: テストケースを小さく保つ
- **AAA パターン**: Arrange（準備）、Act（実行）、Assert（検証）

#### 命名規則

```typescript
describe('権限チェック機能', () => {
    describe('hasPermission()', () => {
        it('正常系: 権限を持つ場合、true を返す', () => {
            // テストコード
        });

        it('異常系: 権限を持たない場合、false を返す', () => {
            // テストコード
        });

        it('エッジケース: ロールが空の場合、false を返す', () => {
            // テストコード
        });
    });
});
```

#### モック対象

以下のような副作用がある処理のみモック化:

- DynamoDB アクセス (AWS SDK)
- Secrets Manager アクセス
- Next.js ルーティング (useRouter 等)
- 外部 API 呼び出し

### 9.2 E2Eテスト作成ガイドライン

#### 原則

- **ユーザー視点**: 実際の利用シナリオに沿って記述
- **安定性優先**: 不安定なテストは修正するか削除
- **独立性**: テスト間で状態を共有しない

#### テスト粒度

- 主要フローは細かくテスト (OAuth ログイン、ユーザー管理)
- 枝葉の機能は重要度に応じて判断
- 過度に細かいテストは避ける（メンテナンスコスト増）

---

## 10. トラブルシューティング

### 10.1 よくある問題

#### E2E テストで OAuth 認証が失敗する

**症状**: Google ログイン画面で認証情報を入力してもエラーになる

**原因**: テスト用アカウントの認証情報が誤っている、または環境変数が設定されていない

**解決方法**: 
1. 環境変数 `GOOGLE_TEST_EMAIL`, `GOOGLE_TEST_PASSWORD` を確認
2. Google アカウントのセキュリティ設定を確認（2段階認証が有効だとテストが失敗する場合がある）

#### カバレッジが 80% に達しない

**症状**: Full CI でカバレッジチェックが失敗する

**原因**: ビジネスロジックのテストが不足している

**解決方法**: 
1. カバレッジレポート (`coverage/lcov-report/index.html`) を開く
2. カバーされていないファイル・関数を特定
3. 必要なテストを追加

### 10.2 デバッグ方法

#### ユニットテストのデバッグ

```bash
# 特定のテストのみ実行
npm run test -w auth -- tests/unit/auth/permissions.test.ts

# デバッグ情報を出力
npm run test -w auth -- --verbose
```

#### E2Eテストのデバッグ

```bash
# UI モードで実行（ステップバイステップで確認）
npm run test:e2e:ui -w auth

# ブラウザ表示モードで実行
npm run test:e2e:headed -w auth

# トレースビューアーで結果を確認
npx playwright show-trace {trace-file}
```

---

## 11. 参考資料

### プラットフォームドキュメント

- [テスト戦略 (全体方針)](../../development/testing.md)
- [コーディング規約](../../development/rules.md)
- [共通設定ファイル](../../development/configs.md)

### サービス固有ドキュメント

- [要件定義](./requirements.md)
- [アーキテクチャ設計](./architecture.md)
- [デプロイ・運用](./deployment.md)

### 外部ドキュメント

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Playwright Documentation](https://playwright.dev/)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
