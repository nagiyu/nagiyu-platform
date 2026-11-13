---
id: stock-tracker/term/permission
title: 権限とロール
kind: term
service: stock-tracker
sources:
  - libs/common/src/auth/roles.ts
  - libs/nextjs/src/auth.ts
sources_hash: 00d77c57925352ef8b48ff72bdead7d59a2d2e69dc53fbc4f6b2177b671aab59
terms: [stock-tracker/term/api-error]
related_cards: [stock-tracker/api/system, stock-tracker/batch/summary]
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

## 関連するカード

- [システム系の API](../api/system.md): 認証セッションを返す
