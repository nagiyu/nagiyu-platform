---
id: livetalk/term/web-fact
title: WEB fact
kind: term
service: livetalk
status: active
sources:
  - services/livetalk/core/src/entities/web-fact.entity.ts
  - services/livetalk/core/src/study/freshness-check.ts
  - services/livetalk/core/src/knowledge/recent-web-facts.ts
  - services/livetalk/core/src/constants.ts
sources_hash: d374748c75d12b87f04faaa6e21cbf2659cc2c8925ab515035f2b837abe5a952
terms: [livetalk/term/topic, livetalk/term/freshness-check-request]
related_cards: [livetalk/batch/consolidate-conversations, livetalk/batch/acquire]
related_adr:
  - services/livetalk/architecture.md#2.24
  - services/livetalk/architecture.md#2.26
---

# WEB fact

Web リサーチで得た外部の事実。[Topic](./topic.md) の配下に 1 件ずつ持つ。

## 説明

揮発性の区分ごとに、再確認の期限 (nextReview) と保持件数が決まる。

| 区分 | 再確認の間隔 | 保持の上限 |
|---|---|---|
| stable | なし (期限を持たない) | 10 件 |
| low | 30 日 | stable 以外の合計で 20 件 |
| medium | 7 日 | 同上 |
| high | 1 日 | 同上 |

- 上限を超えた分は、区分ごとに観測日時の古い順に消す。消すのは集約バッチ
- 確認が要る事実は、stable 以外で、再確認の期限を過ぎたもの
- 読む側は、観測日時の新しい順に 20 件までを使う。会話のプロンプトは 5 件、ノートは 10 件、探索の角度の生成は 5 件まで
- 作るのは集約バッチだけ。新しい事実は、既存の事実と見比べて追加・置き換え・重複 (観測日時と期限の更新だけ) のどれかで入れる

## 関連するカード

- [集約バッチ](../batch/consolidate-conversations.md): 作る・整理する
- [勉強バッチ](../batch/acquire.md): 期限を過ぎた事実を再確認する
- [鮮度確認の依頼](./freshness-check-request.md)
