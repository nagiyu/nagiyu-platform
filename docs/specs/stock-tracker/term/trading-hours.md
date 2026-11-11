---
id: stock-tracker/term/trading-hours
title: 取引時間と最新取引日
kind: term
service: stock-tracker
sources:
  - services/stock-tracker/core/src/services/trading-hours-checker.ts
sources_hash: 30b50d501a7056b24f058b04d4d4c54734a9b5ade65e8eafcd881145fcebcef1
related_cards: [stock-tracker/batch/minute, stock-tracker/batch/hourly, stock-tracker/batch/summary, stock-tracker/batch/temporary-alert-expiry, stock-tracker/term/temporary-alert, stock-tracker/api/exchanges]
related_adr:
  - services/stock-tracker/architecture.md#2.19
---

# 取引時間と最新取引日

取引所のタイムゾーンと、取引所マスタの開始・終了時刻から決まる 2 つの判定。バッチが「いま判定してよいか」「どの日を対象にするか」を決めるのに使う。

## 説明

| 判定 | 内容 |
|---|---|
| 取引時間内 | 取引所のタイムゾーンで、平日 (月〜金) かつ、開始時刻以上で終了時刻より前 (分単位)。土日は常に取引時間外 |
| 最新取引日 | 平日で終了時刻を過ぎていれば当日。それ以外は、1 日ずつ遡った最初の平日。取引所のタイムゾーンの日付 (`YYYY-MM-DD`) で返す |
| 翌平日 | 日付の次の日から、土日を飛ばした最初の平日 |

- 祝日は考慮しない。祝日も平日として扱う
- 開始・終了時刻は `HH:MM` 形式。形式やタイムゾーンが不正だと、取引時間内の判定は例外で失敗する
- 一時通知の期限は、取引時間内なら当日、取引時間外なら最新取引日の翌平日になる ([一時通知](./temporary-alert.md))

## 関連するカード

- [分次バッチ](../batch/minute.md)・[時間次バッチ](../batch/hourly.md): 取引時間外のアラートを判定しない
- [サマリーバッチ](../batch/summary.md): 最新取引日を、サマリーを作る対象日にする
- [一時通知アラート失効バッチ](../batch/temporary-alert-expiry.md): 取引時間外にだけ失効させる
- [取引所 API](../api/exchanges.md): タイムゾーンと開始・終了時刻を持つ
