---
sources:
  - services/livetalk/core/src/safety/keywords.ts
  - services/livetalk/core/src/safety/resources.ts
  - services/livetalk/core/src/safety/moderation.ts
  - services/livetalk/core/src/entities/safety-event.entity.ts
  - services/livetalk/core/src/usecases/chat-usecase.ts
sources_hash: 81058e1930b4c7e1ed35962836a9ccc0af7260119ac6a3551cf5610977ae2a65
---

# セーフティ

自殺・自傷などを示す発言に、LLM に任せず介入する仕組み。入力のキーワード検出と、応答の検査 (Moderation) の 2 つがある。

## 説明

| 種類 | 発動の条件 | 動き |
|---|---|---|
| 入力のキーワード検出 | 利用者の発言が、辞書 (自殺念慮・自傷・絶望・手段への言及・危機的状態の 5 カテゴリ) に当たる | LLM を呼ばず、キャラクターの口調の固定文を返し、相談先を出す |
| 出力の検査 | 応答が Moderation API に止められる | 元の応答は音声にせず、差し替え文を返し、相談先を出す |

- 相談先は、いのちの電話、よりそいホットライン、TELL Lifeline、緊急時 (119) の 4 件
- 発動のたびに、検出の記録 (SafetyEvent) を残す。検出から 3 年たつと、DynamoDB の TTL で自動的に削除される。全利用者を横断して[ステータス画面](../screen/status.md)で見られる
- 検出の記録は、退会しても消さず、利用者から切り離して残す ([アカウント API](../api/account.md))。削除の期限は検出から 3 年のまま引き継ぐ
- 出力の検査は、インメモリ DB のテスト設定や API キーがない環境では、何も止めない
- 検査の呼び出しが失敗したときは、止めずに通常の応答を通す

## 理由

- 自殺・自傷への対応を、LLM や外部の安全機構に任せず、自前で検出する。LLM の安全機構だけでは不十分で、チャットのコンパニオンが自殺・自傷の相談に不適切に応じた事例 (Character.AI や OpenAI への訴訟) で、開発者の責任が問われている
- 入力は、LLM に渡す前にキーワードの辞書で検出する。当たったときは LLM を迂回し、キャラクターの口調の固定文と相談先を返す。LLM の出力に頼らないので、法的な責任を小さくでき、同種の事故を構造で避けられる。機械的にホットラインの番号を貼るのは避け、キャラクターの口調で心配を伝えたうえで案内を添える
- 応答は、返す前に OpenAI の Moderation API で検査する二段目を置く。主な防御はキーワードの検出で、Moderation は補助である。Moderation が失敗したときは止めずに応答を通す
- 辞書は、検出漏れをなくすことを優先し、誤検出を許容する。誤検出で会話が中断されても、安全側に倒すほうを選ぶ。慣用句や比喩 (「死ぬほど美味しい」など) は除外の一覧で外す。辞書の保守は要る
