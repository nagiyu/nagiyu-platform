---
sources:
  - services/livetalk/core/src/entities/topic.entity.ts
  - services/livetalk/core/src/usecases/consolidate.usecase.ts
  - services/livetalk/core/src/constants.ts
sources_hash: 3de3891eab24649b4ab77663ed86a4cf36335da78c31acab1eff7d1142fd61c4
---

# care (話題への注目度)

利用者がその話題をどれだけ気にしているかを表す、[Topic](./topic.md) の回数ベースの数値。

## 説明

- 上げるのは集約バッチだけで、利用者が会話で触れたときに限る。その回の集約が [SELF fact](./self-fact.md) を生んだかどうかで判定する
    - 新規 Topic: SELF fact があれば 1、なければ 0
    - 既存 Topic への名寄せ: SELF fact があれば +1、なければそのまま
- キャラクターの自発リサーチ (Web 取得だけ) の集約では上がらない
- 減衰はしない。累計回数で単調に増える

| 使い道 | 条件 |
|---|---|
| 自発リサーチの起点にする | care 1 以上のものを、高い順に |
| ノートにする | care 3 以上 |
| 重要通知の判定にかける | care 3 以上 |

## 理由

- care は、利用者がその話題をどれだけ気にしているかを表す。上げるのは、利用者が会話で触れた集約だけにし、その代理の信号として SELF fact を生んだかどうかを見る
- キャラクターの自発リサーチの集約でも上げると、「care が高い話題を自発リサーチする → 集約で care が上がる」と自己強化し、利用者が何も足していない話題が育つ。dev では、キャラクター自身のペルソナの Topic が育ち、キャラクターが自分自身を通知した
- 「◯◯を調べて」という一回きりの依頼で、SELF fact が出ないものは、興味とみなさず care に載せない
- 回数ベースで数え、感情の重みは付けない
