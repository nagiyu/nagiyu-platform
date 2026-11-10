---
id: livetalk/term/self-fact
title: SELF fact
kind: term
service: livetalk
sources:
  - services/livetalk/core/src/entities/self-fact.entity.ts
  - services/livetalk/core/src/usecases/forget-self-fact.usecase.ts
sources_hash: 6ecac58677d5a6b288b5ef90cc8ce71f3b5e97116aec58d087ac4b4998e960cb
terms: [livetalk/term/topic, livetalk/term/care]
related_cards: [livetalk/batch/consolidate-conversations]
related_adr:
  - services/livetalk/architecture.md#2.24
---

# SELF fact

利用者自身についての事実。[Topic](./topic.md) の配下に 1 件ずつ持つ。

## 説明

- 会話から集約バッチが取り出す。出所のメモ (provenance) を添え、誤ってまとめたときに辿れるようにする
- 利用者が削除できる単位である。削除は物理削除で、残った SELF fact と [WEB fact](./web-fact.md) から Topic の要約をその場で作り直す。要約の作り直しに失敗しても SELF fact は消えたままで、押し直すと要約だけを作り直す
- 生まれた回の集約は [care](./care.md) を上げる。care を上げる唯一の根拠である

## 関連するカード

- [集約バッチ](../batch/consolidate-conversations.md): SELF fact を作る
