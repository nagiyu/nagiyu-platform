# Admin E2E テスト

## 概要

Admin サービスの E2E テストは、**認証後の機能テスト**に焦点を当てています。

認証フロー自体（Google OAuth、JWT 発行、SSO リダイレクト等）は **Auth プロジェクトの責務** として、Auth サービスでテストします。

## テスト戦略

### テスト対象
- ✅ ダッシュボードの表示と機能
- ✅ ユーザー情報の表示
- ✅ 認証ステータスの表示
- ✅ レスポンシブデザイン

### テスト対象外
- ❌ Google OAuth ログインフロー → **Auth プロジェクトでテスト**
- ❌ JWT 発行・検証ロジック → **Auth プロジェクトでテスト**
- ❌ Auth ↔ Admin 間の SSO フロー全体 → **実環境で確認**
- ❌ ログアウトフロー → **実環境で確認**
- ❌ JWT 期限切れ処理 → **実環境で確認**

## 実行方法

### ローカルでの実行

```bash
# ワークスペースルートから
npm run test:e2e -w @nagiyu/admin

# 特定のブラウザのみ
npm run test:e2e -w @nagiyu/admin -- --project=chromium-desktop

# UI モードで実行
npm run test:e2e:ui -w @nagiyu/admin

# デバッグモード（headed）
npm run test:e2e:headed -w @nagiyu/admin
```

### テストレポート

```bash
npm run test:e2e:report -w @nagiyu/admin
```

## テスト環境

### 環境変数

テストは `.env.test` の設定を使用します:

```env
# 認証チェックをスキップ（テスト環境のみ）
SKIP_AUTH_CHECK=true

# テストユーザー設定
TEST_USER_EMAIL=test@example.com
TEST_USER_ROLES=admin
```

### 認証のスキップ

`SKIP_AUTH_CHECK=true` を設定することで:

1. **Middleware** ([src/middleware.ts](../../../services/admin/web/src/middleware.ts#L15-L19)) で認証チェックがスキップされる
2. **getSession()** ([src/lib/auth/session.ts](../../../services/admin/web/src/lib/auth/session.ts#L14-L22)) がモックセッションを返す

これにより、Auth サービスを起動せずに Admin の機能テストが可能になります。

## テストファイル構成

```
services/admin/web/tests/e2e/
├── dashboard.spec.ts              # ダッシュボード基本機能テスト
└── dashboard-display.spec.ts      # ダッシュボード表示詳細テスト
```

## CI/CD での実行

CI 環境では `.env.test` が自動的に読み込まれ、`SKIP_AUTH_CHECK=true` が設定されます。

```yaml
# GitHub Actions の例
- name: Run E2E tests
  run: npm run test:e2e -w @nagiyu/admin
  env:
    CI: true
```

## 実環境での確認事項

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

## トラブルシューティング

### テストが失敗する

1. `.env.test` に `SKIP_AUTH_CHECK=true` が設定されているか確認
2. Next.js dev サーバーが正常に起動しているか確認（ポート 3000）
3. Playwright のブラウザがインストールされているか確認
    ```bash
    npx playwright install
    ```

### 本番環境で認証が動作しない

`SKIP_AUTH_CHECK` は**テスト環境専用**の設定です。本番環境では以下を確認:

- `.env` や `.env.production` に `SKIP_AUTH_CHECK=true` が設定されていないこと
- `NEXT_PUBLIC_AUTH_URL` が正しく設定されていること
- Auth サービスが正常に動作していること