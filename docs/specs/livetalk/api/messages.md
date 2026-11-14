---
id: livetalk/api/messages
title: メッセージ API
kind: api
service: livetalk
sources:
  - services/livetalk/web/src/app/api/messages/route.ts
  - services/livetalk/web/src/app/api/messages/constants.ts
  - services/livetalk/core/src/constants.ts
sources_hash: 1cb7de10179c74f8f1457aa1dc3f15bfb0609e2095301e2b2fb70d45982117ba
terms: [livetalk/term/permission, livetalk/term/api-error, livetalk/term/character]
related_cards: [livetalk/api/chat]
related_adr:
  - services/livetalk/architecture.md#2.2
---

# メッセージ API

認証した利用者の、直近の会話履歴を返す。画面は呼ばない。

## エンドポイント

| メソッド | パス | 権限 |
|---|---|---|
| GET | `/api/messages` | `livetalk:chat` |

## 入力と出力

| 問い合わせ | 条件 |
|---|---|
| `characterId` | 任意。省略すると `hiyori`。登録の有無は確かめない |
| `tokenLimit` | 任意。100〜200,000 の整数。省略すると環境変数 `LLM_CONTEXT_TOKEN_LIMIT`、なければ 40,000 |

- 新しい側から `tokenLimit` に収まる分だけを取り、古い順に並べて返す
- 出力は `{ messages: [{ messageId, characterId, role, text, createdAt }], totalTokens, truncated }`。`role` は利用者かキャラクターか。`truncated` はトークンの上限か件数の上限で打ち切ったとき true
- 会話履歴は 90 日で自動削除される

## エラー

| 条件 | 状態 | `error` |
|---|---|---|
| `tokenLimit` が整数でない、または範囲外 | 400 | `INVALID_REQUEST` |
| 読み取りの失敗 | 500 | `FETCH_FAILED` |

- 権限の不足は 401 / 403。形は [API のエラー応答](../term/api-error.md)

## つながり

```mermaid
flowchart TD
    C[呼び出し元] --> A[メッセージ API]
    A --> M[(会話履歴)]
    B[チャット API] --> M
```
