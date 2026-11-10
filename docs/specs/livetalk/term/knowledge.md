---
id: livetalk/term/knowledge
title: Knowledge (廃止)
kind: term
service: livetalk
status: deprecated
replaced_by: [livetalk/term/web-fact]
sources: []
sources_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
related_adr:
  - services/livetalk/architecture.md#2.24
---

# Knowledge (廃止)

旧: 勉強バッチの成果を、話題と無関係に貯めていた知識のサイロ。ノートも、Knowledge を昇格させて作っていた。

## 説明

- 廃止済みで、コードに残っていない
- 置き換え先は、[Topic](./topic.md) 配下の [WEB fact](./web-fact.md) である。勉強の成果は、いったん [WebRaw](./webraw.md) に置き、集約バッチが Topic にまとめる
- ノートは、Knowledge ではなく Topic を参照する形に変えた。[ノート](./note.md)を参照

## 関連するカード

- [WEB fact](./web-fact.md)
- [WebRaw](./webraw.md)
- [ノート](./note.md)
