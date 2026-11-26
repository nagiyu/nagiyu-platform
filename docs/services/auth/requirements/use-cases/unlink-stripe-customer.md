---
sources: []
---

# Stripe の顧客との対応を外す

Stripe で顧客を削除したとき、管理者が、ユーザーと Stripe の顧客の対応を外す。

## 前提

- ログインしている
- `roles:assign` 権限を持っている ([ロールと権限](../../../../platform/specs/lib/common/roles-and-permissions.md))
- 対象のユーザーが Stripe の顧客と対応している

## 流れ

1. 管理者が、対象のユーザーの編集画面を開く ([ユーザー編集画面](../../specs/screen/user-edit.md))
2. 管理者が、顧客との対応を外すことを確認して確定する ([ユーザー API](../../specs/api/users.md))

## 結果

- ユーザーと Stripe の顧客の対応が外れる。同じ書き込みで、Stripe 由来の有効な課金の権利も取り消される
- Stripe 上の顧客と契約は変わらない

## 例外

- 対象のユーザーが Stripe の顧客と対応していないときは、エラーにする
- 他の更新と競合したときは、再読み込みを促す
