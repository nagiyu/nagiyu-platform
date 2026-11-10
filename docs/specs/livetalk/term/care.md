---
id: livetalk/term/care
title: care (話題への注目度)
kind: term
service: livetalk
sources:
  - services/livetalk/core/src/entities/topic.entity.ts
  - services/livetalk/core/src/usecases/consolidate.usecase.ts
  - services/livetalk/core/src/constants.ts
sources_hash: 397053a713ea4d03d6732af619f56ae8dd8637b147b2094e8428d128a7c1f980
terms: [livetalk/term/topic, livetalk/term/self-fact]
related_cards: [livetalk/batch/consolidate-conversations, livetalk/batch/acquire, livetalk/batch/notify]
related_adr:
  - services/livetalk/architecture.md#2.24
---

# care (話題への注目度)

利用者がその話題をどれだけ気にしているかを表す、[Topic](./topic.md) の回数ベースの数値。

## 説明

- 上げるのは集約バッチだけで、利用者が会話で触れたときに限る。その回の集約が [SELF fact](./self-fact.md) を生んだかどうかで判定する
    - 新規 Topic: SELF fact があれば 1、なければ 0
    - 既存 Topic への名寄せ: SELF fact があれば +1、なければそのまま
- キャラクターの自発リサーチ (Web 取得だけ) の集約では上がらない。自己強化で育たないようにするため
- 減衰はしない。累計回数で単調に増える

| 使い道 | 条件 |
|---|---|
| 自発リサーチの起点にする | care 1 以上のものを、高い順に |
| ノートにする | care 3 以上 |
| 重要通知の判定にかける | care 3 以上 |

## 関連するカード

- [集約バッチ](../batch/consolidate-conversations.md): care を上げる
- [勉強バッチ](../batch/acquire.md): 自発リサーチの起点を選ぶ
- [通知バッチ](../batch/notify.md): 重要通知の判定と話題の選択に使う
