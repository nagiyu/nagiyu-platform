---
sources:
  - libs/common/src/auth/roles.ts
  - libs/nextjs/src/auth.ts
sources_hash: a5e54ead124c3735e24ea0a15fec96e63c6e2a4990bff8ebb298f45afd883788
---

# 権限とロール

Stock Tracker の API と画面は、ログインした利用者のロールが持つ 3 つの権限で、使える操作を分ける。

## 説明

| 権限 | できること | 持つロール |
|---|---|---|
| `stocks:read` | チャート・取引所・ティッカー・サマリー・確度・成績の閲覧。自分の保有株式とアラートの閲覧 | `stock-viewer`、`stock-user`、`stock-admin` |
| `stocks:write-own` | 自分の保有株式・アラート・Push 購読の登録、更新、削除 | `stock-user`、`stock-admin` |
| `stocks:manage-data` | 取引所とティッカーのマスタ管理。サマリーバッチの手動実行 | `stock-admin` |

- 上の 3 つは積み上げで、`stock-admin` は 3 つとも持つ
- API は、未ログインなら 401 (`UNAUTHORIZED`)、権限がなければ 403 (`FORBIDDEN`) を返す。本文の形は [API のエラー応答](./api-error.md)
- 保有株式とアラートは利用者ごとに分かれ、ほかの利用者の分は読み書きできない
- 画面は、権限のない操作のボタンを出さない。管理系の画面は、権限がなければ「権限エラー」を出す
- 認証セッションは[システム系の API](../api/system.md)が返す

## 理由

- 確度と、その根拠になる成績 (判断軸の成績画面) を、どちらも `stocks:read` で見せる。確度は一般の利用者が見る判断材料であり、その根拠の成績も同じ人が見られるべきなため
- 閲覧に専用の権限を設けない。使われない権限が残ると、ロールの設計を読む人が混乱する。管理者向けの分析機能を分けたくなったら、そのときに改めて権限を設ける
