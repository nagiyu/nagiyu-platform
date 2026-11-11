---
id: stock-tracker/term/temporary-alert
title: 一時通知
kind: term
service: stock-tracker
sources:
  - services/stock-tracker/core/src/services/trading-hours-checker.ts
  - services/stock-tracker/core/src/repositories/dynamodb-alert.repository.ts
  - services/stock-tracker/web/app/api/alerts/route.ts
sources_hash: f00ca210b32433c44a7f1833783a37f73bd8b9550b7f4626121a5e6e3d39ecbf
related_cards: [stock-tracker/api/alerts, stock-tracker/screen/alerts]
related_adr:
  - services/stock-tracker/architecture.md#2.11
---

# 一時通知

期限つきのアラート。通常のアラートと違い、次の取引終了までで失効する。画面では「一時」、通常のアラートは「常設」と出る。

## 説明

- 作るとき (または更新で一時にするとき)、期限の取引日を決めて持たせる
    - 取引時間内: 当日
    - 取引時間外: 最後の取引日の次の平日。日付は取引所のタイムゾーンで決める
- 一時を外す更新をすると、期限の取引日は消える
- 期限が過ぎたアラートは、バッチが無効にして削除用の期限 (TTL) を付ける。TTL が付いたアラートは、一覧 API に出ない
- 手動で無効にしただけのアラートは、一覧に残る

## 関連するカード

- [アラート API](../api/alerts.md): 一時の指定と期限の算出
- [アラート一覧画面](../screen/alerts.md): 「一時通知」列
