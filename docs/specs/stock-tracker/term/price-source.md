---
id: stock-tracker/term/price-source
title: 価格の取得元
kind: term
service: stock-tracker
sources:
  - services/stock-tracker/core/src/entities/exchange.entity.ts
  - services/stock-tracker/core/src/services/market-data/router.ts
  - services/stock-tracker/core/src/services/market-data/finnhub-quote-provider.ts
  - services/stock-tracker/core/src/services/market-data/tradingview-quote-provider.ts
sources_hash: abcc7adaef5e4a12426b5bbea7da720f6f4634d64a61bdf1bfd40c3c448da707
related_cards: [stock-tracker/batch/minute, stock-tracker/batch/hourly, stock-tracker/api/exchanges, stock-tracker/flow/alert-notification]
related_adr:
  - services/stock-tracker/architecture.md#2.18
---

# 価格の取得元

アラートの判定に使う現在価格を、どこから取るか。取引所ごとの設定 `priceSource` で決まる。

## 説明

| 値 | 取得元 | 取り方 |
|---|---|---|
| `tradingview` (省略時) | TradingView | WebSocket で現在値を取る |
| `finnhub` | Finnhub | REST の現在値 (`/quote`) を 1 回呼ぶ。API キーは環境変数から読む |

- 値が `finnhub` のときだけ Finnhub を使い、それ以外 (未設定・未知の値) は TradingView になる
- Finnhub は次の場合に失敗する: API キーがない、ティッカー ID に `:` がない、HTTP 429、HTTP エラー、現在値が 0 以下 (未知のシンボル)、タイムアウト。タイムアウトの既定は 4 秒
- この設定が決めるのは現在価格だけ。日足 (サマリー・チャート) は取引所によらず TradingView から取る

## 関連するカード

- [分次バッチ](../batch/minute.md)・[時間次バッチ](../batch/hourly.md): 取引所の設定に従って現在価格を取る
- [取引所 API](../api/exchanges.md): `priceSource` を設定する
- [アラート通知の経路](../flow/alert-notification.md): 価格を取ってから通知するまで
