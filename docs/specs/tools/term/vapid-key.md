---
id: tools/term/vapid-key
title: VAPID キー
kind: term
service: tools
sources:
  - services/tools/src/app/api/vapid/route.ts
  - services/tools/src/app/vapid-generator/page.tsx
sources_hash: c747927412220d8994b22e646836b9b06bce1998312acdad21096e27a51c7359
related_cards: [tools/api/vapid, tools/screen/vapid-generator]
related_adr:
  - services/tools/tools-catalog.md#置くツールの方針
---

# VAPID キー

Web Push の送信元を示す、公開鍵と秘密鍵のペア。このサービスが作るのは、楕円曲線 P-256 (`prime256v1`) の鍵で、どちらも Base64url (パディングなし) で表す。

## 説明

| 鍵 | 中身 | 長さ |
|---|---|---|
| 公開鍵 | `0x04` + 点の x + 点の y (65 バイト) | 87 文字 |
| 秘密鍵 | 秘密の値 d (32 バイト) | 43 文字 |

- 画面の注意書きは、公開鍵はクライアント側、秘密鍵はサーバー側で安全に保管するよう求める
- 鍵は生成のたびに新しく作る。サーバーは鍵を保存せず、ログにも出さない。画面を閉じるか、もう一度生成すると、前の鍵は画面から消える

## 関連するカード

- [VAPID キー API](../api/vapid.md)・[VAPID キー生成ツール](../screen/vapid-generator.md)
