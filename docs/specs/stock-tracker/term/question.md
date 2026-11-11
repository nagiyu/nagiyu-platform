---
id: stock-tracker/term/question
title: 問い (方向・荒れ・市場の荒れ)
kind: term
service: stock-tracker
sources:
  - services/stock-tracker/core/src/forecast/preprocessing.ts
  - services/stock-tracker/core/src/forecast/constants.ts
  - services/stock-tracker/web/lib/axis-performance-view/constants.ts
sources_hash: c1e351c7bd98e75b5283b4d199c5da767f38b6e366bb36412f88393eb542c2c6
terms: [stock-tracker/term/forecast, stock-tracker/term/axis]
related_cards: [stock-tracker/api/axis-performance, stock-tracker/api/forecasts, stock-tracker/batch/forecast]
related_adr:
  - services/stock-tracker/architecture.md#2.26
---

# 問い (方向・荒れ・市場の荒れ)

[確度](./forecast.md)が答える 3 種類の問い。内部の名前は `DIR`、`VOL`、`MKT`。

## 説明

| 問い | 内部名 | 翌営業日について答えること | 当たりの条件 | 対象 |
|---|---|---|---|---|
| 方向 | `DIR` | 市場平均を上回るか | 翌営業日のリターンが、同じ市場の有効な銘柄の平均を上回る | 銘柄 |
| 荒れ | `VOL` | その銘柄が平常より荒れるか | 翌営業日の値幅が、直近 20 営業日の値幅の平均を上回る | 銘柄 |
| 市場の荒れ | `MKT` | 市場全体が平常より荒れるか | 翌営業日の市場平均の値幅が、平常を上回る | 市場 (JP / US) |

- 当たりかどうかは、翌営業日の足が出た後に採点する。採点済みの件数が評価の単位になる
- リターンが ±20% を超えた銘柄は、方向と荒れの採点から外す
- 問いごとに使う[判断軸](./axis.md)は決まっていて、軸の側が対象の問いを持つ
- 荒れは、20 営業日分の履歴がない銘柄には確度を出さない

## 関連するカード

- [確度 API](../api/forecasts.md): 方向と荒れの内訳を返す
- [成績 API](../api/axis-performance.md): 3 つの問いの成績を返す
- [確度算出バッチ](../batch/forecast.md): 問いごとに採点し、重みを更新する
