---
id: stock-tracker/term/axis
title: 判断軸
kind: term
service: stock-tracker
sources:
  - services/stock-tracker/core/src/forecast/axes.ts
  - services/stock-tracker/core/src/forecast/constants.ts
sources_hash: daa93498a6239baa7664ae87f71ce182c0910de235addeefea8c3667e21a8f7d
terms: [stock-tracker/term/question, stock-tracker/term/forecast]
related_cards: [stock-tracker/api/forecasts, stock-tracker/api/axis-performance, stock-tracker/screen/axis-performance]
related_adr:
  - services/stock-tracker/architecture.md#2.21
  - services/stock-tracker/architecture.md#2.26
---

# 判断軸

当日までの足 (始値・高値・安値・終値・出来高) だけから機械的に求める、[確度](./forecast.md)の材料。軸ごとの成績を溜め、その成績で重みを付けて確度に合成する。

## 説明

| 種類 | 軸 | 使う問い |
|---|---|---|
| 単一パターン (点灯型) | 日足パターンごとに 1 軸。買い 11 種、売り 16 種 | 方向 |
| 複合パターン (点灯型) | 「買い合致数 2 以上」「売り合致数 2 以上」 | 方向 |
| 値動きの大きさ (数値型) | 直近 5 日の値幅 (Parkinson)、当日の値幅、出来高。いずれも銘柄の平常比 | 荒れ |
| 市場レベル (数値型) | 上の 3 つの市場平均。同じ市場の全銘柄で同じ値 | 荒れ、市場の荒れ |
| 市場平均値幅 (数値型) | 市場平均値幅の平常比 | 市場の荒れ |

- 点灯型は、パターンが成立したとき (または合致数が 2 以上のとき) に「点灯」する。数値型は平常比 (倍) で表す。平常は直近 20 営業日の平均
- 軸は、定義に書いた[問い](./question.md)にだけ使う
- 確度への寄与は、軸ごとの「確率への上乗せ (pt)」で表す。全軸の寄与の合計が、確度と「ふだん」の差になる
- 点灯型の軸は、採点済みの点灯が 30 件未満の間は「件数不足」として、参考扱いにする

## 関連するカード

- [確度 API](../api/forecasts.md): 銘柄の確度の軸別内訳を返す
- [成績 API](../api/axis-performance.md): 軸ごとの成績と現在の重みを返す
- [判断軸の成績画面](../screen/axis-performance.md): 軸の成績を表にする
