---
id: livetalk/term/safety
title: セーフティ
kind: term
service: livetalk
sources:
  - services/livetalk/core/src/safety/keywords.ts
  - services/livetalk/core/src/safety/resources.ts
  - services/livetalk/core/src/safety/moderation.ts
  - services/livetalk/core/src/entities/safety-event.entity.ts
  - services/livetalk/core/src/usecases/chat-usecase.ts
sources_hash: 1e5d174f3af7d22b3a777a8953e37cc22e60e7a7bdba07c4974b5a6be702f4aa
related_cards: [livetalk/api/chat, livetalk/screen/home, livetalk/screen/status, livetalk/api/account]
related_adr:
  - services/livetalk/architecture.md#2.9
  - services/livetalk/architecture.md#2.22
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

## 関連するカード

- [チャット API](../api/chat.md)
- [ホーム画面](../screen/home.md): 相談先のダイアログ
