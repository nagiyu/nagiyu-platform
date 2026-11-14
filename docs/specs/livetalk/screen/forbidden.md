---
id: livetalk/screen/forbidden
title: 権限なし画面
kind: screen
service: livetalk
sources:
  - services/livetalk/web/src/app/forbidden/page.tsx
  - services/livetalk/web/src/app/forbidden/ForbiddenContent.tsx
  - libs/ui/src/components/feedback/AccessDeniedView.tsx
sources_hash: 0ce4b5110d6be6f3a244f89c9d32f280f32af8cf5356e1ae8319637c71eea4a9
terms: [livetalk/term/permission]
related_cards: [livetalk/screen/home, livetalk/screen/status]
---

# 権限なし画面

ログインしているが、リブトークを使う権限 (`livetalk:chat`) がない利用者に、権限を更新するか、ログインし直す導線を出す画面。

## 入口

- パスは `/forbidden`。ミドルウェアが、権限のない利用者のページへのアクセスを、元のパスと検索文字列を `from` に付けて移す ([権限とロール](../term/permission.md))
- ログインなしでも開ける (権限の判定の対象外)

## 表示するもの

- 見出し「アクセス権限がありません」、説明「この機能を利用する権限がありません。管理者の承認後、下のボタンでアクセスを更新してください。」、「アクセスを更新」と「再ログイン」のボタン
- 画面の描画はサーバーが Auth サービスの URL を決めて渡す

## 操作

| 操作 | 結果 |
|---|---|
| アクセスを更新 | Auth サービスの更新へ移る。戻り先は、サービスの公開 URL に `from` を付けたもの。`from` がなければサービスのトップ |
| 再ログイン | Auth サービスのサインアウトへ移る。戻り先は同じ |

## 画面の見た目

### 通常表示

`/notes` から移された例。

| スマホ |
|---|
| ![権限なし画面 通常表示 (スマホ)](../../../images/specs/livetalk/screen/forbidden-default-mobile.png) |

## つながり

```mermaid
flowchart TD
    M[ミドルウェア] -->|権限なし| F[権限なし画面]
    F -->|更新・再ログイン| A[Auth サービス]
    A -->|戻り先| H[元のページ]
```
