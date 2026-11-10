---
id: livetalk/term/freshness-check-request
title: 鮮度確認の依頼
kind: term
service: livetalk
sources:
  - services/livetalk/core/src/entities/freshness-check-request.entity.ts
  - services/livetalk/core/src/study/freshness-check.ts
  - services/livetalk/core/src/constants.ts
sources_hash: ad3ff8466f03d20fe858427324945efedef275dc2bc7fcc99745aa2c2d153220
terms: [livetalk/term/topic, livetalk/term/web-fact]
related_cards: [livetalk/batch/acquire, livetalk/batch/notify]
related_adr:
  - services/livetalk/architecture.md#2.26
---

# 鮮度確認の依頼

使われた [Topic](./topic.md) に確認が要る [WEB fact](./web-fact.md) があるときに記録する、再取得の依頼。

## 説明

- 記録するきっかけは、Topic が使われたとき。期限ごとに全 Topic を調べ直さないためである
    - 会話で直接想起された Topic (関連展開で付いてきた Topic は含めない)
    - 通知の重要通知の判定にかけた Topic と、平常通知の話題に選んだ Topic
- 確認が要る WEB fact を 1 件でも持つ Topic だけを記録する
- 同じ Topic への依頼がすでにあれば、最初の依頼を残す。依頼時刻を新しくすると、よく使われる Topic ほど後回しになるため
- 7 日で自動削除する。消えても、次に使われたときに再び記録される
- 記録に失敗しても、会話や通知は止めない

## 関連するカード

- [勉強バッチ](../batch/acquire.md): 古い順に処理して消す
- [通知バッチ](../batch/notify.md): 記録する
