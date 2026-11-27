---
sources:
  - services/livetalk/core/src/entities/webraw.entity.ts
  - services/livetalk/core/src/constants.ts
sources_hash: a85aa79de24b11d246799b6e484cb16adf72963c6234a3c2759c9e322793e50a
---

# WebRaw (Web 取得の生データ)

勉強バッチが Web から取ってきた要約文を、そのまま保存したもの。集約バッチが [WEB fact](./web-fact.md) に畳む前の元データである。

## 説明

- 持ち物は、検索語、取得した本文、参照 URL、由来 (origin)、依頼由来のときの依頼文と依頼日時
- 由来は 3 種類

| origin | 取得したきっかけ |
|---|---|
| request | 利用者の勉強の依頼 |
| stale | WEB fact の鮮度確認 |
| auto | care による自発リサーチ |

- 90 日で自動削除する
- 集約バッチは、前回の続きから未処理の WebRaw だけを読む
