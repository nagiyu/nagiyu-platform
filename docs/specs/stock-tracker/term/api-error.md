---
id: stock-tracker/term/api-error
title: API のエラー応答
kind: term
service: stock-tracker
sources:
  - libs/nextjs/src/error.ts
  - libs/nextjs/src/error-reporting.ts
  - services/stock-tracker/web/lib/api-error-reporting.ts
sources_hash: 8bc404e84e8e7d25c261b8dc14e6c1a23ce7ccded83dfa9f3f23c9b4875c0e08
terms: [platform/term/error-event]
related_cards: [stock-tracker/term/permission]
---

# API のエラー応答

Stock Tracker の API が失敗したときに返す共通の形と、500 以上を Admin へ報告する仕組み。

## 説明

- 本文は `{ error: <コード>, message: <日本語の説明> }` の形。検証の失敗では `details` (エラーの配列) が付くことがある
- 各カードのエラー表に書くコードは、この形の `error` の値である

| 失敗の種類 | 状態 | `error` |
|---|---|---|
| 未ログイン | 401 | `UNAUTHORIZED` |
| 権限なし | 403 | `FORBIDDEN` |
| 入力の不正 | 400 | `INVALID_REQUEST` (`limit` の範囲外は `VALIDATION_ERROR`) |
| 対象が見つからない | 404 | `NOT_FOUND` |
| 想定していない失敗 | 500 | `INTERNAL_ERROR` |

- 想定していない失敗は、例外が投げられたときに、次の 2 通りのどちらかで返す
    - 共通の変換: 名前に NotFound を含む例外は 404、AlreadyExists を含む例外は 400 (`ALREADY_EXISTS`)、Invalid を含む例外は 400 (`VALIDATION_ERROR`)、それ以外は 500 (`内部エラーが発生しました`)
    - 500 固定: 変換せず、API ごとに決めた日本語の文言で 500 を返す。チャート、サマリー、確度、成績、Push の更新と解除はこちら
- 状態が 500 以上になったときは、[ErrorEvent](../../platform/term/error-event.md) として Admin へ報告する。チャートが返す 429 と 504 は、例外ではなく直接返すので報告しない
- 一覧 API の `limit` は 1〜100 で、省略すると 50。範囲外は 400

## 関連するカード

- [権限とロール](./permission.md): 401 と 403 の条件
