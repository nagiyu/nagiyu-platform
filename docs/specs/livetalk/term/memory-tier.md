---
id: livetalk/term/memory-tier
title: Memory Tier (廃止)
kind: term
service: livetalk
status: deprecated
replaced_by: [livetalk/term/topic, livetalk/term/self-fact]
sources: []
sources_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
related_adr:
  - services/livetalk/architecture.md#2.7
  - services/livetalk/architecture.md#2.24
---

# Memory Tier (廃止)

旧: 利用者の記憶を Tier A〜D に階層化し、信頼度と cooldown で想起を制御する仕組み。

## 説明

- 廃止済みで、コードに残っていない。Tier ごとのタブやピン留めの画面もない
- 置き換え先は、[Topic](./topic.md) 中心のモデルである
    - 利用者についての記憶は、Topic 配下の [SELF fact](./self-fact.md) に持つ
    - 想起は、発話との関連度だけで決める。階層、信頼度、cooldown は使わない
    - 忘れさせるときは SELF fact を物理削除し、要約を作り直す
- 併せて、会話の圧縮要約 (MemorySummary) も廃止した

## 関連するカード

- [Topic](./topic.md)
- [SELF fact](./self-fact.md)
