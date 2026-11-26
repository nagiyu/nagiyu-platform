---
sources:
  - services/livetalk/core/src/entities/freshness-check-request.entity.ts
  - services/livetalk/core/src/study/freshness-check.ts
  - services/livetalk/core/src/constants.ts
sources_hash: f1588cc08ace1d24813e77b6c6af603f7d328176da8a258a4ecdab3d6f5bcfc6
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
