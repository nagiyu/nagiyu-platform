---
id: stock-tracker/term/daily-summary
title: 日次サマリー
kind: term
service: stock-tracker
sources:
  - services/stock-tracker/core/src/entities/daily-summary.entity.ts
  - services/stock-tracker/core/src/types.ts
sources_hash: 86b91e2d56c239785f4d0c9d7e5d85c288788c29361b5b604730c46073d18aca
terms: [stock-tracker/term/forecast]
related_cards: [stock-tracker/batch/summary, stock-tracker/batch/forecast, stock-tracker/api/summaries, stock-tracker/screen/summaries]
related_adr:
  - services/stock-tracker/architecture.md#2.22
  - services/stock-tracker/architecture.md#2.7
---

# 日次サマリー

ティッカー × 取引日で 1 件の、その日の足とパターン判定の記録。

## 説明

| 項目 | 内容 |
|---|---|
| 足 | 始値、高値、安値、終値、出来高 (出来高は任意) |
| パターン判定 | パターンごとに `MATCHED` (成立)、`NOT_MATCHED` (不成立)、`INSUFFICIENT_DATA` (判定不能) |
| 成立数 | 買いパターン、売りパターンそれぞれの成立数 |

- 確度は日次サマリーに入れず、別のアイテムに持つ ([確度](./forecast.md))
- 確度の算出は、足とパターン判定を読む

## 関連するカード

- [サマリーバッチ](../batch/summary.md): 日次サマリーを作る
- [確度算出バッチ](../batch/forecast.md): 日次サマリーから確度を作る
- [サマリー API](../api/summaries.md): 日次サマリーを確度とあわせて返す
- [サマリー画面](../screen/summaries.md): 日次サマリーを並べて見る
