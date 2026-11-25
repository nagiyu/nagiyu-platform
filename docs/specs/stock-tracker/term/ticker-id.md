---
id: stock-tracker/term/ticker-id
title: ティッカー ID と保有 ID
kind: term
service: stock-tracker
sources:
  - services/stock-tracker/web/app/api/tickers/route.ts
  - services/stock-tracker/web/app/api/holdings/[id]/route.ts
sources_hash: 8d02cd4ae7514c4dd29d75e9329edf832b602e019c5595f41d0bc529369d1208
related_cards: [stock-tracker/api/tickers, stock-tracker/api/holdings]
---

# ティッカー ID と保有 ID

銘柄と保有株式を指す文字列の ID。どちらも別の ID を組み合わせて作る。

## 説明

| ID | 形 | 例 |
|---|---|---|
| ティッカー ID | `{取引所キー}:{シンボル}` | `NSDQ:AAPL` |
| 保有 ID | `{利用者 ID}#{ティッカー ID}` | `user-1#NSDQ:AAPL` |

- 取引所キーは取引所の `key` (TradingView の API キー。英大文字と数字の 1〜20 文字)。取引所 ID とは別の値
- ティッカー ID は、ティッカーを作るときに取引所キーとシンボルから決まり、変えられない
- 保有 ID は URL に載せるとき、`#` を含むためエンコードして渡す。自分の利用者 ID 以外の保有 ID は 403
- 1 人の利用者が同じティッカー ID の保有株式を 2 件持つことはない

## 関連するカード

- [ティッカー API](../api/tickers.md): ティッカー ID を決める
- [保有株式 API](../api/holdings.md): 保有 ID を使う
