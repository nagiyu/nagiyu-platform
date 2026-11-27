---
sources:
  - services/stock-tracker/core/src/entities/daily-summary.entity.ts
  - services/stock-tracker/core/src/types.ts
  - services/stock-tracker/core/src/patterns/pattern-registry.ts
sources_hash: 6e23cf1195939c1b4ca281a3e4fb39c73edc54499e13d598fc1376c56fde00a6
---

# 日次サマリー

ティッカー × 取引日で 1 件の、その日の足とパターン判定の記録。

## 説明

| 項目 | 内容 |
|---|---|
| 足 | 始値、高値、安値、終値、出来高 (出来高は任意) |
| パターン判定 | パターンごとに `MATCHED` (成立)、`NOT_MATCHED` (不成立)、`INSUFFICIENT_DATA` (判定不能) |
| 成立数 | 買いパターン、売りパターンそれぞれの成立数 |

- 確度は日次サマリーに入れず、別のアイテムに持つ。理由は[確度](./forecast.md)
- 確度の算出は、足とパターン判定を読む
- [サマリーバッチ](../batch/summary.md)が作り、[確度算出バッチ](../batch/forecast.md)が読む。[サマリー API](../api/summaries.md)と[サマリー画面](../screen/summaries.md)が確度とあわせて見せる

## 理由

- パターンは、ユーザーが条件式を組むものではなく、固定の定義をコードで持つ。ユーザー定義の条件式は複雑度が高く、確実に動作するパターンから提供するため
- 判定を成立・不成立・判定不能の 3 状態にする。取得できた日足が、そのパターンの判定に要る本数に満たないときは「判定不能」として、成立判定を行わない。足りない足で成否を決めて、精度を損なわないため
- 判定結果は、確度の[判断軸](./axis.md)として使う
