---
id: niconico-mylist-assistant/term/user-session
title: user_session (ニコニコセッション)
kind: term
service: niconico-mylist-assistant
sources:
  - services/niconico-mylist-assistant/core/src/niconico/session.ts
  - services/niconico-mylist-assistant/core/src/entities/niconico-credential.entity.ts
  - services/niconico-mylist-assistant/web/src/lib/niconico-session/index.ts
sources_hash: 71a88a454fca3d85c002d81fd6a086d536818ae0d31717d39657a22e447cf287
related_cards: [niconico-mylist-assistant/api/niconico-session, niconico-mylist-assistant/screen/mylist-register, niconico-mylist-assistant/flow/session-injection, niconico-mylist-assistant/batch/mylist-register]
related_adr:
  - services/niconico-mylist-assistant/architecture.md#2.13 認証方式：自動ログインから user_session 注入への移行
---

# user_session (ニコニコセッション)

利用者がブラウザでニコニコ動画にログインして得た `user_session` クッキーの値。このサービスはログインを自動化せず、利用者が貼り付けたこの値を預かり、バッチのブラウザに注入してニコニコを操作する。

## 説明

- 利用者ごとに 1 件だけ保存する。保存し直すと上書きする
- 保存するのは、AES-256-GCM で暗号化した値 (`ciphertext`、`iv`、`authTag` の JSON 文字列) と、取得日時、推定有効期限。鍵は Secrets Manager のシークレットから読む
- 推定有効期限は「保存した時刻 + 30 日」で決める。ニコニコ側の本当の期限は読まない
- 生の値は画面・API の応答・ログに出さない。画面の入力欄は伏せ字で、復号の失敗などはメッセージだけをログに残す

有効性は 3 状態で扱う。`https://www.nicovideo.jp/my/mylist` を、リダイレクトを追わずにクッキー付きで取得して決める。

| 状態 | 条件 | 扱い |
|---|---|---|
| `valid` (有効) | 200 | 保存できる。登録できる |
| `invalid` (無効) | 302 で、`Location` が `account.nicovideo.jp` を含む | 保存を断る。画面は登録を止めて更新を促す。バッチは実行を止める |
| `unknown` (判定不能) | 上以外 (5xx、想定外のステータス、通信の失敗、ログインページ以外への 302) | 保存は断る。画面は登録を止めず、バッチも続行する |

- 保存済みの値を復号できない (壊れている) ときは、状態の取得は失敗にせず `invalid` として返す。画面から削除して入れ直せる

## 関連するカード

- [ニコニコセッション API](../api/niconico-session.md): 保存・状態の取得・削除
- [セッションの登録から利用まで](../flow/session-injection.md): 保存した値がバッチで使われるまで
