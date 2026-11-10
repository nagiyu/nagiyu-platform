---
id: livetalk/term/exploration
title: 探索の記録
kind: term
service: livetalk
status: active
sources:
  - services/livetalk/core/src/entities/exploration.entity.ts
  - services/livetalk/core/src/research/exploration-angle-generator.ts
  - services/livetalk/core/src/constants.ts
sources_hash: ebe2817308e7697f6fd62521ac39579da84b0e1f36f778c447c673e2c63c4487
terms: [livetalk/term/topic, livetalk/term/care]
related_cards: [livetalk/batch/acquire]
related_adr:
  - services/livetalk/architecture.md#2.28
---

# 探索の記録

自発リサーチで起点にした [Topic](./topic.md) ごとの、最後に探索した時刻と、最近の角度の記録。

## 説明

- 角度は、起点の Topic から広げた Web 検索の語句。軽い LLM が 1 つ作る。作れなかったときは「{主題} 最新情報」に落とす
- 角度の生成には、起点の要約、利用者の発言由来の [SELF fact](./self-fact.md) (最大 5 件)、すでに知っている [WEB fact](./web-fact.md) (新しい側 5 件)、最近の角度を渡す
- 時刻は探索を試した時点で残し、成否は問わない。最近の角度は新しい順に 5 件までを保つ
- 探索の結果は別の Topic に集約されうるため、起点の WEB fact の観測日時は進まない。時刻の記録があるのはそのためである
- Topic のヘッダとは別のアイテムに持つ。ヘッダは集約が楽観ロックで書き換えるため

## 関連するカード

- [勉強バッチ](../batch/acquire.md): 読んで書く
