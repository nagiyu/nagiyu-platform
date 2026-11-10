---
id: livetalk/term/interest-category
title: InterestCategory (廃止)
kind: term
service: livetalk
status: deprecated
replaced_by: [livetalk/term/care]
sources: []
sources_hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
related_adr:
  - services/livetalk/architecture.md#2.24
---

# InterestCategory (廃止)

旧: 利用者の興味をカテゴリと重み (Weight) で表したもの。通知の重要度判定と、勉強する話題の選定に使っていた。

## 説明

- 廃止済みで、コードに残っていない
- 置き換え先は、[Topic](./topic.md) の [care](./care.md) である。通知の重要度判定も、自発リサーチの選定も care で行う

## 関連するカード

- [care](./care.md)
- [Topic](./topic.md)
