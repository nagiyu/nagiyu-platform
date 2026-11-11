---
id: livetalk/term/chat-event
title: チャットのイベント
kind: term
service: livetalk
sources:
  - services/livetalk/core/src/usecases/chat-usecase.ts
  - services/livetalk/web/src/lib/home/useChatStream.ts
sources_hash: 24616c06038a886cf349db9937468582d2ed2f2089be20b90a884db1ac3f32b5
related_cards: [livetalk/api/chat, livetalk/screen/home, livetalk/flow/conversation]
---

# チャットのイベント

会話の API が、応答を 1 行 1 件の JSON (NDJSON) で少しずつ返すときの、1 件ぶんの単位。

## 説明

| `type` | 中身 | 画面での扱い |
|---|---|---|
| `text` | 応答の断片 (`delta`) | 応答の吹き出しに追記する |
| `sentence` | 1 文ぶんの音声 (base64 の WAV) と文 | 順に再生する |
| `lifecycle` | 生活サイクルの状態 (`awake`、`sleeping`) | キャラクターの表示に反映する |
| `safety` | セーフティの発動と相談先。出力の検査で止めたときは差し替え文も付く | 相談先のダイアログを開く。差し替え文があれば応答を置き換える |
| `done` | 終わり | 音声の再生が終わると待機に戻る |
| `error` | 失敗の通知 | 共通の失敗の文言を出す |

- 音声は、文の区切りごとに作る。作れなかった文の `sentence` は送らず、文字だけが残る
- `done` も `error` も来ずに閉じたときは、画面が終わりと見なして待機に戻す

## 関連するカード

- [チャット API](../api/chat.md)
- [ホーム画面](../screen/home.md)
- [会話の経路](../flow/conversation.md)
