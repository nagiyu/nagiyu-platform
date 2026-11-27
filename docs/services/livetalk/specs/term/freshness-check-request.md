---
sources:
  - services/livetalk/core/src/entities/freshness-check-request.entity.ts
  - services/livetalk/core/src/study/freshness-check.ts
  - services/livetalk/core/src/constants.ts
sources_hash: 90c57dc236335473c59e297e84b9f468ef76a84545fbd92e093a1f64b41cb6be
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

## 理由

- 鮮度の確認は、Topic が使われそうになったときだけ依頼する。期限の来た WEB fact を全 Topic で走査して再取得する方式では、会話に出ない Topic まで調べ直し、勉強の枠の大半がそこに使われる。2026 年 10 月の prod では、リサーチ約 2,000 回のうち 1,829 回がこの再取得だった。再取得しても、変化の判定が dev で 9 割超「変化あり」になり、変化を絞れていなかった
- 会話の中では、その場で調べない。確認の依頼を記録して取得バッチが調べ直すので、使われた直後の会話は、期限切れの事実を含みうる
- 枠や予算で後回しになり続けた依頼は消える。消えても、その Topic が次に使われたときに再び記録される。最初の依頼を残すのは、依頼時刻を新しくすると、よく使われる Topic ほど後回しになるためである
