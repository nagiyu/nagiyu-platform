---
sources:
  - services/livetalk/core/src/affection/calculator.ts
  - services/livetalk/core/src/usecases/chat-usecase.ts
  - services/livetalk/core/src/repositories/dynamodb-character-state.repository.ts
  - services/livetalk/core/src/mappers/character-state.mapper.ts
  - services/livetalk/core/src/constants.ts
sources_hash: 4cc178a9021fa9ccd6eafe5adb61b5a96cf2730428b8ecad23ee6630c6aa148f
---

# 親密度

利用者と[キャラクター](./character.md)の組ごとに溜まる、会話の累積を表す数値。会話した日が増えるたびに上がり、下がらない。今は、プロンプトにも通知にも使っていない。

## 説明

- 値は、キャラクターの状態の項目 (キー `CHAR#{characterId}#STATE`、利用者のキーの配下) の `AffectionLevel` に持つ。未設定は 0 として扱う。同じ項目に、最後に加算した時刻 (`LastInteractionAt`) も持つ
- 上げるのは、[会話](../api/chat.md)の応答を保存し終えたあとだけ。加算量は 1.0 で、次のどちらかのときに加算する
    - その組に状態の項目がない (初めての会話)
    - 最後に加算した時刻と今が、UTC の暦日で別の日 (日本時間ではない)

    同じ日の 2 回目以降の会話では加算せず、最後に加算した時刻も書き換えない。値は、実質は会話した日の数になる
- 加算は、応答の終了を待たずに裏で行う。失敗しても、警告をログに残して会話は続ける
- 下げる処理はない。加算量が負でも、今の値を下回らない。長期間話さなくても値は変わらない
- 値は、画面にも API の応答にも出さず、応答のプロンプトや通知の判定にも使わない。溜まるだけの値である
- 退会するとほかの状態と一緒に消える ([アカウント API](../api/account.md))

## 理由

- 親密度は、上がるだけにして、下げない。下げない理由は[親密度の要件](../../requirements/functional/affection.md)にある。時間の経過は、値を下げずに、通知の文面の口調 ([通知バッチ](../batch/notify.md)) で表す
- 上がるだけなので、値の意味は「関係の良さ」ではなく、累積の接触量になる。恣意的な値だが、許容する
