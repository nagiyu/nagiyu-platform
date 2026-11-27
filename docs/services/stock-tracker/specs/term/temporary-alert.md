---
sources:
  - services/stock-tracker/core/src/services/trading-hours-checker.ts
  - services/stock-tracker/core/src/repositories/dynamodb-alert.repository.ts
  - services/stock-tracker/web/app/api/alerts/route.ts
sources_hash: f00ca210b32433c44a7f1833783a37f73bd8b9550b7f4626121a5e6e3d39ecbf
---

# 一時通知

期限つきのアラート。通常のアラートと違い、次の取引終了までで失効する。画面では「一時」、通常のアラートは「常設」と出る。

## 説明

- 作るとき (または更新で一時にするとき)、期限の取引日を決めて持たせる ([取引時間](./trading-hours.md))
    - 取引時間内: 当日
    - 取引時間外: 最後の取引日の次の平日。日付は取引所のタイムゾーンで決める
- 一時を外す更新をすると、期限の取引日は消える
- 期限が過ぎたアラートは、[失効バッチ](../batch/temporary-alert-expiry.md)が無効にして削除用の期限 (TTL) を付ける。TTL が付いたアラートは、一覧 API に出ない
- 手動で無効にしただけのアラートは、一覧に残る
- 画面と API は[アラート API](../api/alerts.md)と[アラート一覧画面](../screen/alerts.md)

## 理由

- 期限は平日 = 取引日のまま決め、祝日に期限を迎えることを許す。期限は「これから来る日」なので、実際に存在した日だけが載る日足の日付では判定できない。祝日マスターを持たずに正しく直せないため、祝日に期限を迎える (実質 1 取引日短くなる) ことを許容する
