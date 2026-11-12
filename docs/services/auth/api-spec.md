# Auth サービス API 仕様書

この文書は、API 全体にかかわる方針 (ベース URL・バージョニング・後方互換) を書く。各 API の入出力・エラー・権限など、今どう動くかは[仕様カード](../../specs/README.md)にある。

---

## 1. API 概要

### 1.1 ベース URL

| 環境 | URL |
|------|-----|
| 開発 | `https://auth.dev.nagiyu.com` |
| 本番 | `https://auth.nagiyu.com` |

### 1.2 API の一覧と仕様カード

| 区分 | エンドポイント | 仕様カード |
|------|---------------|-----------|
| 認証 (Auth.js の受け口) | `/api/auth/*` | [システム系の API](../../specs/auth/api/system.md) |
| ヘルスチェック | `/api/health` | [システム系の API](../../specs/auth/api/system.md) |
| ユーザー管理 | `/api/users`、`/api/users/me`、`/api/users/{userId}` ほか | [ユーザー API](../../specs/auth/api/users.md) |
| 課金 | `/api/billing/checkout`、`/api/billing/plan-change`、`/api/billing/portal`、`/api/billing/scheduled-change/cancel` | [課金 API](../../specs/auth/api/billing.md) |
| Stripe の通知 | `/api/billing/webhook` | [Stripe 通知 API](../../specs/auth/api/billing-webhook.md) |

### 1.3 共通の決まり

- **認証**: セッションの Cookie (JWT) で行う。Cookie の名前・属性・有効期間は[システム系の API](../../specs/auth/api/system.md)、JWT に入るロールの扱いは[セッションのロール](../../specs/auth/term/session-roles.md)を参照する
- **エラーの形**: コードではなく日本語の文を `error` に入れる。形と、想定外の失敗を Admin のエラー履歴へ報告する仕組みは[認証 API のエラー応答](../../specs/auth/term/api-error.md)を参照する
- **認可**: ロールではなく権限で通すかを決める。ロールと権限の定義は[ロールと権限の定義](../../specs/platform/term/role.md)を参照する
- **データモデル**: ユーザーの保存形式は[アーキテクチャ設計書](./architecture.md)の「5.1 DynamoDB スキーマ設計」を参照する

---

## 2. バージョニング

### 2.1 バージョン管理方針

- **Phase 1**: バージョニングなし (v1 として扱う)
- **Phase 2 以降**: URL パスでバージョン指定 (`/api/v2/users`)

### 2.2 後方互換性

- 既存フィールドの削除は行わない
- 新規フィールド追加時は省略可能にする
- 破壊的変更時は新バージョンとして提供

### 2.3 レート制限

API のレート制限は実装していない。入れる場合は、アプリケーションではなく基盤側 (CloudFront など) の話として扱う。
