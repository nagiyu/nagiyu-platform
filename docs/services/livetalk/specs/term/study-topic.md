---
sources:
  - services/livetalk/core/src/entities/study-topic.entity.ts
  - services/livetalk/core/src/study/knowledge-gate.ts
  - services/livetalk/core/src/usecases/chat-usecase.ts
  - services/livetalk/core/src/repositories/dynamodb-study-topic.repository.ts
  - services/livetalk/core/src/constants.ts
sources_hash: d9291bc6da10e2fbf4e0035e95b5878f84fa551c09bec5562876cb84306e8d70
---

# 勉強の依頼 (StudyTopic)

会話で「知らない話題」と判定されたときに積む、勉強バッチへの依頼。

## 説明

- 積む条件: 会話に関連する Topic のうち [WEB fact](./web-fact.md) を持つものがなく、推論なしで呼ぶ LLM の分類が「Web で調べるべき外部の話題」と判定したとき。判定は、利用者自身のこと・一般常識・雑談を除く
- 積むとき、LLM は使わず「勉強しておくね」の定型文を返す。同じ話題の依頼が pending か in_progress であれば、積み直さない (大文字小文字を区別しない)
- 優先度は 10 で、30 日で自動削除する
- 状態は pending → in_progress → done と進む。勉強バッチが優先度の高い順、同じなら古い順に処理する
- 積むのに失敗しても、会話の応答は止めない (定型文は返す)

## 理由

- 知らない話題への切り替えは、プロンプトで「知らなければ知らないと答えて」と頼まず、コードで行う。LLM は学習済みの知識で、聞かれればすぐ答えてしまい、プロンプトで頼んでも守らない。コードが定型文に切り替えるので、「調べておく」という約束が確実になり、プロンプトの注入にも強い
- 判定の対象を「Web で調べるべき外部の話題」に絞るのは、利用者自身のことは Web で答えが出ず、記憶で答えるべきだからである
- 一般常識まで「勉強しておくね」と返すおそれがあるので、分類の精度に注意が要る
