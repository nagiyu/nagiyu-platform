---
id: livetalk/term/webraw
title: WebRaw (Web 取得の生データ)
kind: term
service: livetalk
sources:
  - services/livetalk/core/src/entities/webraw.entity.ts
  - services/livetalk/core/src/constants.ts
sources_hash: e8ff62d7b6d551feec0f9cd4d425531a962fba4e7faf929eb85e136dfea0dd13
terms: [livetalk/term/web-fact]
related_cards: [livetalk/batch/acquire, livetalk/batch/consolidate-conversations]
related_adr:
  - services/livetalk/architecture.md#2.24
---

# WebRaw (Web 取得の生データ)

勉強バッチが Web から取ってきた要約文を、そのまま保存したもの。集約バッチが [WEB fact](./web-fact.md) に畳む前の元データである。

## 説明

- 持ち物は、検索語、取得した本文、参照 URL、由来 (origin)、依頼由来のときの依頼文と依頼日時
- 由来は 3 種類

| origin | 取得したきっかけ |
|---|---|
| request | 利用者の勉強の依頼 |
| stale | WEB fact の鮮度確認 |
| auto | care による自発リサーチ |

- 90 日で自動削除する
- 集約バッチは、前回の続きから未処理の WebRaw だけを読む

## 関連するカード

- [勉強バッチ](../batch/acquire.md): 書く
- [集約バッチ](../batch/consolidate-conversations.md): 読んで畳む
