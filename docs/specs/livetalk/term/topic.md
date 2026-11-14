---
id: livetalk/term/topic
title: Topic (話題)
kind: term
service: livetalk
sources:
  - services/livetalk/core/src/entities/topic.entity.ts
  - services/livetalk/core/src/knowledge/retrieval.ts
  - services/livetalk/core/src/constants.ts
sources_hash: 626e0d00cea20477673bf8aec3bc0ca40b998cde893b3829e0ae466c519b92a9
terms: [livetalk/term/care, livetalk/term/self-fact, livetalk/term/web-fact]
related_cards: [livetalk/batch/consolidate-conversations]
related_adr:
  - services/livetalk/architecture.md#2.24
---

# Topic (話題)

話題 1 つぶんの知識・記憶をまとめた集約体。「話したこと」と「調べたこと」を同じ話題でつなぐ。

## 説明

- 構成は、ヘッダ 1 件と、その配下の [SELF fact](./self-fact.md) と [WEB fact](./web-fact.md) の複数件である
- ヘッダの持ち物: 主題 (subject)、正規化した要約、カテゴリ、[care](./care.md)、座標 (embedding)、依頼由来の依頼文と依頼日時 (あるときだけ)
- 作る・更新するのは集約バッチだけ。会話の応答では書かない
- 想起は関連度だけで行う。会話では、発話の埋め込みとの類似度が 0.4 以上の上位 5 件を文脈に入れる。さらに、その 5 件との類似度が 0.8 以上の Topic を最大 2 件足す
- 集約時の名寄せ候補は、類似度 0.4 以上の上位 8 件である
- SELF fact を利用者が削除すると、その場で要約を作り直す

## 関連するカード

- [集約バッチ](../batch/consolidate-conversations.md): Topic を作る・更新する
- [care](./care.md)、[SELF fact](./self-fact.md)、[WEB fact](./web-fact.md)
