---
id: share-together/flow/session-start
title: 起動時の流れ (利用者登録と前回の画面の復元)
kind: flow
service: share-together
sources:
  - services/share-together/web/src/app/layout.tsx
  - services/share-together/web/src/components/UserRegistrationInitializer.tsx
  - services/share-together/web/src/components/LastVisitedPathController.tsx
  - services/share-together/web/src/lib/lastVisitedPath.ts
  - services/share-together/web/src/middleware.ts
  - services/share-together/web/src/app/api/users/route.ts
sources_hash: cdb96849c2a4f3c1f9fafe9e1dad732d4bbbfeec4ba4e42ae3e63bb9bdc149bc
related_cards: [share-together/api/users, share-together/screen/home, share-together/screen/lists]
related_adr:
  - services/share-together/architecture.md#2.14 PWA 起動時の最終訪問パスをクライアント側 LocalStorage で復元する
---

# 起動時の流れ (利用者登録と前回の画面の復元)

ログイン後に画面を開いたときに、全画面のレイアウトが行う 2 つの処理。利用者の登録と、前回開いていた画面への復元。

## 起点

- どの画面でも、レイアウトが描かれたとき (ブラウザのセッションごと。タブや PWA のウィンドウを閉じるまで)

## 経路

```mermaid
flowchart TD
    A[① 未ログインでページを開く] --> B[Auth のサインインへ]
    C[② ログイン済みで画面を開く] --> D{③ 登録済みの印が<br/>セッションにあるか}
    D -->|ない| E[④ ユーザー API を呼ぶ]
    E -->|成功| F[印を残す]
    D -->|ある| G[呼ばない]
    C --> H{⑤ このセッション<br/>最初の表示が /<br/>で、前回の訪問先がある}
    H -->|はい| I[⑥ 前回の画面へ移る]
    H -->|いいえ| J[⑦ 今の画面を保存]
```

| 段階 | 内容 |
|---|---|
| ① 未ログイン | ミドルウェアが Auth のサインインへ送る。戻り先は開いたパスとクエリ。`/api` は対象外で、API は 401 を返す |
| ③④ 登録 | 画面ごとに、ブラウザのセッションに印があるかを見る。なければ [ユーザー API](../api/users.md) を呼び、成功したら印を残す。失敗した場合は印を残さず、次の画面の表示で再び呼ぶ。失敗は `console.error` に出すだけで、利用者には知らせない |
| ⑤⑥ 復元 | セッションの最初の表示で、パスが `/` で、保存された前回の訪問先が `/` 以外ならそこへ移る (履歴は置き換える)。移るときは保存しない |
| ⑦ 保存 | それ以外のとき、パスとクエリを 1 つの文字列にして、ブラウザに保存する (`/` で始まるものだけ)。リスト画面のクエリ (`scope`、`groupId`、`listId`) も含めて保存するので、選んでいたリストへ戻れる |

- 保存先はブラウザ (端末ごと)。ほかの端末やブラウザには引き継がれない
- 復元は、`/` を一度描いてから移る。トップ画面が一瞬見える
- 2 回目以降の `/` (ヘッダーのタイトルを押すなど) では移らない

## 届く先

- ユーザー API が作る利用者とデフォルトの個人リスト ([個人リスト](../term/personal-list.md))
- 前回の訪問先 (ブラウザの保存領域)

## つながり

```mermaid
flowchart TD
    L[全画面のレイアウト] --> U[ユーザー API]
    L --> P[(ブラウザの保存領域<br/>前回の訪問先)]
    P -->|セッション最初の / のとき| S[前回の画面]
```
