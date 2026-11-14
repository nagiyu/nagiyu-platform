---
id: stock-tracker/term/forecast
title: 確度
kind: term
service: stock-tracker
sources:
  - services/stock-tracker/core/src/forecast/neutral-band.ts
  - services/stock-tracker/core/src/forecast/constants.ts
  - services/stock-tracker/web/lib/forecast-view/labels.ts
  - services/stock-tracker/web/lib/forecast/market-forecast.ts
sources_hash: 456a07788cc95ddf3ee734fdcbd1dde048842a488ca073a163f9439b55e6e294
terms: [stock-tracker/term/question, stock-tracker/term/axis]
related_cards: [stock-tracker/api/forecasts, stock-tracker/api/summaries, stock-tracker/screen/summaries, stock-tracker/batch/forecast]
related_adr:
  - services/stock-tracker/architecture.md#2.22
  - services/stock-tracker/architecture.md#2.27
---

# 確度

翌営業日についての[問い](./question.md)に答える確率。銘柄 × 日 (市場の荒れは市場 × 日) で 1 件あり、[判断軸](./axis.md)から合成する。画面の「方向」「荒れ」「市場の荒れ予報」に出る。

## 説明

| 項目 | 意味 |
|---|---|
| 確率 (`probability`) | 判断軸を合成した、問いが当たる確率 |
| ふだん (`baseline`) | どの軸も効いていないときの確率。直近 60 営業日の的中率 (20 件未満なら全期間) |
| 中立帯 | 確率とふだんの差が「中立」に収まる幅。実績から決まり、有意な差がなければ閉じない (下限 -1 / 上限 1 は「その側なし」) |
| 寄り (`lean`) | 確率とふだんの差を中立帯と比べた結果 |

| 問い | 寄りの種類と画面の言葉 |
|---|---|
| 方向 | 差が上限以上で `UP` (強含み)、下限未満で `DOWN` (弱含み)、それ以外は `NEUTRAL` (中立) |
| 荒れ | 差が上限以上で `HIGH` (荒れそう)、それ以外は `NEUTRAL` (平常) |
| 市場の荒れ | 荒れと同じ |

- 確率は、予測時点の値を一度だけ書き、後から書き換えない。答え合わせは別に追記する
- 学習に使える採点済みの日が 30 営業日分たまるまでは、確率を出さない (軸の値だけ記録する)
- 市場の荒れは、採点済みの日数が 250 営業日に満たない間、「参考値」と明示する
- 確度がない日・銘柄は、画面で「—」や「この日の確度はありません」になる

## 関連するカード

- [確度 API](../api/forecasts.md): 銘柄の確度と内訳
- [サマリー API](../api/summaries.md): 一覧と市場の荒れ予報
- [サマリー画面](../screen/summaries.md): 確度を並べて見る
- [確度算出バッチ](../batch/forecast.md): 確度を作る
