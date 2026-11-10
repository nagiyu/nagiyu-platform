---
id: livetalk/term/study-topic
title: 勉強の依頼 (StudyTopic)
kind: term
service: livetalk
status: active
sources:
  - services/livetalk/core/src/entities/study-topic.entity.ts
  - services/livetalk/core/src/study/knowledge-gate.ts
  - services/livetalk/core/src/usecases/chat-usecase.ts
  - services/livetalk/core/src/repositories/dynamodb-study-topic.repository.ts
  - services/livetalk/core/src/constants.ts
sources_hash: ffb6dba1bfaacaf7f7cb57af8ed504c511d70f63217009620b5337be5e4c6a7e
terms: [livetalk/term/topic, livetalk/term/web-fact]
related_cards: [livetalk/batch/acquire]
related_adr:
  - services/livetalk/architecture.md#2.12
  - services/livetalk/architecture.md#2.24
---

# 勉強の依頼 (StudyTopic)

会話で「知らない話題」と判定されたときに積む、勉強バッチへの依頼。

## 説明

- 積む条件: 会話に関連する Topic のうち [WEB fact](./web-fact.md) を持つものがなく、軽い LLM の分類が「Web で調べるべき外部の話題」と判定したとき。判定は、利用者自身のこと・一般常識・雑談を除く
- 積むとき、LLM は使わず「勉強しておくね」の定型文を返す。同じ話題の依頼が pending か in_progress であれば、積み直さない (大文字小文字を区別しない)
- 優先度は 10 で、30 日で自動削除する
- 状態は pending → in_progress → done と進む。勉強バッチが優先度の高い順、同じなら古い順に処理する
- 積むのに失敗しても、会話の応答は止めない (定型文は返す)

## 関連するカード

- [勉強バッチ](../batch/acquire.md): 依頼を消費して Web から取得する
