---
id: admin/screen/dashboard
title: ダッシュボード画面
kind: screen
service: admin
sources:
  - services/admin/web/src/app/page.tsx
  - services/admin/web/src/app/(protected)/dashboard/page.tsx
  - services/admin/web/src/components/dashboard/DashboardRoleCards.tsx
  - services/admin/web/src/components/notify/NotifyButton.tsx
  - services/admin/web/src/app/layout.tsx
  - services/admin/web/src/middleware.ts
  - libs/browser/src/push.ts
sources_hash: 1d40ee384e3f11ea3f658ba05443a53bf82d32c6649d38a46e56ee26955e7806
terms: [admin/term/permission, admin/term/push-subscription]
related_cards: [admin/screen/errors, admin/api/notify, admin/api/system, admin/flow/push-subscription]
---

# ダッシュボード画面

ログインしている利用者の情報を見て、通知の有効化とエラー履歴への入口を使う、Admin の最初の画面。

## 入口

- パスは `/dashboard`。`/` を開くと、ここへリダイレクトする
- ヘッダーの「Admin」(ホームに戻るリンク) から来る
- 未ログインのときは、Auth サービスのサインイン画面 (`/signin`) へリダイレクトされ、ログイン後に戻る ([システム系の API](../api/system.md))

## 表示の条件

- ログインしていれば、権限がなくても開ける
- カードは権限で出し分ける ([権限とロール](../term/permission.md))
    - 「通知設定」は `notifications:write` を持つときだけ
    - 「エラー履歴」は `errors:read` を持つときだけ

## 表示するもの

| カード | 内容 | 出る条件 |
|---|---|---|
| ユーザー情報 | メールアドレスと、持っているロールの一覧 (ロールごとのバッジ) | 常に |
| 認証ステータス | 「✓ Auth サービスとの SSO 連携が正常に動作しています」と「JWT トークンによる認証が有効です」。固定の文言で、実際の状態は確かめていない | 常に |
| 通知設定 | 「通知を有効にする」ボタン | `notifications:write` |
| エラー履歴 | 説明と、「エラー履歴を表示」のリンク | `errors:read` |

- ヘッダーは「Admin」のタイトルとアカウントメニュー (ログアウト)。フッターはバージョン (環境変数 `APP_VERSION`、なければ `1.0.0`)、プライバシーポリシー、利用規約

## 状態

- 「通知を有効にする」を押している間は、ボタンに読み込みの表示を出す
- 結果は、ボタンの下に出す
    - 成功は「通知を有効化しました」(成功の表示)
    - 失敗は、エラーの表示。文言は、ブラウザが対応していないなら「このブラウザはプッシュ通知に対応していません」、拒否されたなら「通知が拒否されました。ブラウザ設定から通知を許可してください」、登録 API の失敗なら「サブスクリプションの登録に失敗しました」。理由が分からない失敗は「通知設定中にエラーが発生しました」
- 押すたびに、前の結果は消える。有効にしたあとも、ボタンは「通知を有効にする」のままで、購読済みの表示や解除の操作はない

## 操作

| 操作 | 結果 |
|---|---|
| 通知を有効にする | ブラウザの許可を求め、公開鍵と購読の登録に [Push 購読 API](../api/notify.md) を使う。流れは[Push 購読の経路](../flow/push-subscription.md) |
| エラー履歴を表示 | [エラー履歴一覧画面](./errors.md) (`/errors`) を開く |

## 画面の見た目

### 通常表示

`admin` ロール。ユーザー情報、認証ステータス、通知設定、エラー履歴の 4 つのカードが出る。

| スマホ | PC |
|---|---|
| ![ダッシュボード画面 通常表示 (スマホ)](../../../images/specs/admin/screen/dashboard-default-mobile.png) | ![ダッシュボード画面 通常表示 (PC)](../../../images/specs/admin/screen/dashboard-default-desktop.png) |

### 通知・履歴の権限がないロール (`user-manager`)

ユーザー情報と認証ステータスだけが出る。

| スマホ | PC |
|---|---|
| ![ダッシュボード画面 通知・履歴の権限がないロール (`user-manager`) (スマホ)](../../../images/specs/admin/screen/dashboard-no-permission-mobile.png) | ![ダッシュボード画面 通知・履歴の権限がないロール (`user-manager`) (PC)](../../../images/specs/admin/screen/dashboard-no-permission-desktop.png) |

### 通知を有効にできたとき

「通知を有効化しました」を緑で出す。

| スマホ | PC |
|---|---|
| ![ダッシュボード画面 通知を有効にできたとき (スマホ)](../../../images/specs/admin/screen/dashboard-notify-enabled-mobile.png) | ![ダッシュボード画面 通知を有効にできたとき (PC)](../../../images/specs/admin/screen/dashboard-notify-enabled-desktop.png) |

### ブラウザで通知を拒否したとき

拒否された旨のエラーを出す。

| スマホ | PC |
|---|---|
| ![ダッシュボード画面 ブラウザで通知を拒否したとき (スマホ)](../../../images/specs/admin/screen/dashboard-notify-denied-mobile.png) | ![ダッシュボード画面 ブラウザで通知を拒否したとき (PC)](../../../images/specs/admin/screen/dashboard-notify-denied-desktop.png) |

### ブラウザが Push に対応していないとき

対応していない旨のエラーを出す。

| スマホ | PC |
|---|---|
| ![ダッシュボード画面 ブラウザが Push に対応していないとき (スマホ)](../../../images/specs/admin/screen/dashboard-notify-unsupported-mobile.png) | ![ダッシュボード画面 ブラウザが Push に対応していないとき (PC)](../../../images/specs/admin/screen/dashboard-notify-unsupported-desktop.png) |

### 購読の登録 API が失敗したとき

「サブスクリプションの登録に失敗しました」を出す。

| スマホ | PC |
|---|---|
| ![ダッシュボード画面 購読の登録 API が失敗したとき (スマホ)](../../../images/specs/admin/screen/dashboard-notify-failed-mobile.png) | ![ダッシュボード画面 購読の登録 API が失敗したとき (PC)](../../../images/specs/admin/screen/dashboard-notify-failed-desktop.png) |

## つながり

```mermaid
flowchart TD
    R["/ (リダイレクト)"] --> S[ダッシュボード画面]
    H[ヘッダーの Admin] --> S
    S -->|公開鍵・購読の登録| A1[Push 購読 API]
    S -->|エラー履歴を表示| S2[エラー履歴一覧画面]
    S -->|ログイン状態| A2[システム系の API]
```
