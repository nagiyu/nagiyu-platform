---
id: livetalk/term/note
title: ノート
kind: term
service: livetalk
sources:
  - services/livetalk/core/src/entities/note.entity.ts
  - services/livetalk/core/src/constants.ts
sources_hash: 4da51b129201050f3c7cf0bd887f1037f57ef3760de5787d933991137748b546
terms: [livetalk/term/topic, livetalk/term/care]
related_cards: [livetalk/batch/consolidate-conversations, livetalk/api/notes, livetalk/screen/notes, livetalk/screen/note-detail]
related_adr:
  - services/livetalk/architecture.md#2.24
  - services/livetalk/architecture.md#2.29
---

# ノート

キャラクターが利用者に贈る「手紙」。[Topic](./topic.md) を参照する記録で、贈った瞬間の文面は変わらない。

## 説明

- 持ち物は、参照する Topic、贈った時点の主題、手紙の文面 (headline)、利用者の感想 (後から付く)
- 中身 (調べた内容・出典) は持たず、詳細画面が Topic の最新を都度読む
- 作るのは集約バッチの後段。条件は[集約バッチ](../batch/consolidate-conversations.md)を参照
- 1 つの Topic につき 1 つまで
- 会話には、直近 7 日以内に贈った最大 3 件を文脈として渡し、利用者の感想にキャラクターが反応できるようにする

## 関連するカード

- [集約バッチ](../batch/consolidate-conversations.md): 作る
- [ノート API](../api/notes.md)、[ノート一覧画面](../screen/notes.md)、[ノート詳細画面](../screen/note-detail.md): 見せる
