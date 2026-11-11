---
id: stock-tracker/term/push-subscription
title: Web Push の購読
kind: term
service: stock-tracker
sources:
  - libs/common/src/push/types.ts
  - libs/common/src/push/client.ts
  - libs/nextjs/src/push.ts
  - services/stock-tracker/core/src/entities/alert.entity.ts
sources_hash: 31926696311054e42b78f2c6c8d89271d531efadae98a7aa46d5f0be8c203c2c
related_cards: [stock-tracker/flow/alert-notification, stock-tracker/api/push, stock-tracker/api/alerts, stock-tracker/batch/minute, stock-tracker/batch/hourly, stock-tracker/batch/daily]
related_adr:
  - services/stock-tracker/architecture.md#2.4
---

# Web Push の購読

利用者のブラウザが通知を受け取る宛先。`endpoint` (URL) と 2 つの鍵 (`keys.p256dh`、`keys.auth`) からなる。

## 説明

- アラートが 1 件ずつ自分の購読を持つ。購読だけを保存する場所はない
- 作成時に入り、アラートの更新では変えられない。画面を開いたときの再購読で、利用者のアラートの購読がまとめて書き換わる ([Push 通知 API](../api/push.md))
- 入力の検証は、`endpoint` が URL として解釈できることと、`keys.p256dh`・`keys.auth` が空でない文字列であること
- 送信したとき、通知の送り先のサービスが 404 か 410 を返した購読は「無効」になる。無効はエラーではなく、送信の結果として「送れなかった」を返す。アラートも購読も消えない
- 無効以外の送信の失敗 (VAPID 鍵がないなど) は例外になる

## 関連するカード

- [アラート通知の経路](../flow/alert-notification.md): 購読の宛先へ送り、端末に表示するまで
- [Push 通知 API](../api/push.md): 購読の登録と書き換え
- [アラート API](../api/alerts.md): アラートの作成で購読を受け取る
- [分次バッチ](../batch/minute.md)・[時間次バッチ](../batch/hourly.md): 条件を満たしたアラートの購読へ送る
- [日次バッチ](../batch/daily.md): 保存されている購読の形を点検する
