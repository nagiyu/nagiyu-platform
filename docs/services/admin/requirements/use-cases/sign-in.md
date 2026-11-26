---
sources: []
---

# Auth でログイン済みの運用者が Admin を使う

Auth でログイン済みの運用者が、再ログインなしで Admin を使う。

## 前提

- Auth でログインしている ([Google アカウントでログインする](../../../auth/requirements/use-cases/sign-in.md))

## 流れ

1. 運用者が、Admin の画面を開く
2. Admin が、Auth のログインの状態を確かめる ([サインイン](../functional/sign-in.md))
3. 運用者が、そのままダッシュボードを開く ([ダッシュボード画面](../../specs/screen/dashboard.md))

## 結果

- 運用者は Admin でログインし直さずに、権限の範囲で使える

## 例外

- Auth でログインしていない、またはログインの状態が無効なときは、Auth のサインインへ送られる。ログイン後は、元の画面へ戻る
