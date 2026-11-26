---
sources: []
---

# ダッシュボードから通知を有効にする

管理者が、自分の端末に Push 通知が届くように、ダッシュボードから通知を有効にする。

## 前提

- Admin にログインしている
- `notifications:write` 権限を持つ。現在は `admin` ロールだけが持つ ([権限とロール](../../specs/term/permission.md))

## 流れ

1. 管理者が、ダッシュボードの「通知設定」で「通知を有効にする」を押す ([ダッシュボード画面](../../specs/screen/dashboard.md))
2. ブラウザが、通知を出してよいかを確かめる。管理者が許可する
3. Admin が、その端末の購読を保存する ([Push 購読の経路](../../specs/flow/push-subscription.md))

## 結果

- その端末に、Push 通知が届くようになる ([エラーが記録されると Push が届く](receive-error-notification.md))

## 例外

- `notifications:write` 権限がないときは、ダッシュボードに「通知設定」が出ない。API を直接呼んでも登録できない
- ブラウザが Push に対応していないとき、または管理者が通知を許可しなかったときは、登録されず、その旨が示される
