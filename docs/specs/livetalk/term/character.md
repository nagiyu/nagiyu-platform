---
id: livetalk/term/character
title: キャラクター
kind: term
service: livetalk
sources:
  - services/livetalk/core/src/constants.ts
  - services/livetalk/web/src/lib/characters/registry.ts
  - services/livetalk/web/src/lib/characters/client-profiles.ts
  - services/livetalk/web/src/lib/characters/CharacterContext.tsx
sources_hash: 278e94213c66790eb349e7fab8fb5fd56b7376672c1e96e387c9dede2af0e88f
related_cards: [livetalk/screen/home, livetalk/api/chat, livetalk/flow/conversation]
related_adr:
  - services/livetalk/architecture.md#2.15
  - services/livetalk/architecture.md#2.16
---

# キャラクター

利用者が会話する相手。ID で区別し、記憶・ノート・通知・生活サイクルはキャラクターごとに独立する。

## 説明

| ID | 名前 | 描き方 | 音声 |
|---|---|---|---|
| `hiyori` (既定) | 桃瀬ひより | Live2D | VOICEVOX (冥鳴ひまり) |
| `ageha` | 早瀬アゲハ | 一枚絵 (パーツの重ね合わせ) | OpenAI TTS (nova) |

- 選んだキャラクターは、ブラウザのローカルストレージ (`livetalk:selectedCharacterId`) に残る。初回は `hiyori`
- ホーム画面は URL の `?character={ID}` でも切り替えられる。通知からの起動で使う
- API の `characterId` を省略すると `hiyori` になる。登録のない ID は、API によって 400 (`INVALID_REQUEST` / `INVALID_CHARACTER`) になるか、既定に読み替える
- 記憶・ノート・通知の記録・生活サイクルを読む API は、`characterId` で絞る

## 関連するカード

- [ホーム画面](../screen/home.md): 切り替えのダイアログ
- [会話の経路](../flow/conversation.md)
