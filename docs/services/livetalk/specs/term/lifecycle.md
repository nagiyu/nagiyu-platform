---
sources:
  - services/livetalk/core/src/entities/lifecycle.entity.ts
  - services/livetalk/core/src/lifecycle/state-resolver.ts
  - services/livetalk/core/src/constants.ts
sources_hash: e9a2785325242c71ade77de6cf9cb33b2e11b7442918a98f2cf19e972439bdaa
---

# lifecycle (生活サイクル)

利用者 × キャラクターごとの、キャラクターの就寝・起床時刻と、[活動時間プロファイル](./user-activity-profile.md) をまとめたもの。

## 説明

- 就寝時刻の既定は 01:30、起床時刻の既定は 09:30 (日本時間)。就寝から起床までの間が「就寝中」で、0 時をまたぐ設定も扱う
- 作るのは、週次の[活動時間学習バッチ](../batch/learn-user-activity.md)だけである。直近 30 日に利用者の発話が 5 件以上あった組に、既定の時刻で作る。それまでは lifecycle がなく、勉強バッチと通知バッチはその組を対象にしない
- 学習のたびに、キャラクターの起床・就寝時刻は利用者の活動に合わせて少しずつずれる
- 就寝中は、勉強バッチがその回を飛ばし、通知バッチは重要通知を含めて送らない

## 理由

- 就寝中でも会話の応答は止めず、口調だけを眠そうに変える。「寝ている間は応答しない」にすると、夜に使う人が使えなくなる。いつでも話せることを保ち、寝起きの会話そのものを、キャラクターらしさの演出にする
- 口調の維持は、プロンプトで眠い状態を指示して行う。LLM が眠そうな口調を保ち続ける保証はない
