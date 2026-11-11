---
id: tools/api/vapid
title: VAPID キー API
kind: api
service: tools
sources:
  - services/tools/src/app/api/vapid/route.ts
  - services/tools/src/lib/vapid.ts
sources_hash: 9f6fcc36e02d4562d34175f18dac77004f221fcab6c3c1c7551f4b2116813b33
terms: [tools/term/vapid-key]
related_cards: [tools/screen/vapid-generator]
related_adr:
  - services/tools/architecture.md#Next.js API Routes
---

# VAPID キー API

[VAPID キー](../term/vapid-key.md)のペアを 1 組作って返す API。ログインは要らない。

## エンドポイント

| メソッド | パス | 権限 |
|---|---|---|
| POST | `/api/vapid` | なし |

POST 以外のメソッドは定義していない。

## 入力と出力

- 入力はない。呼び出し元 ([VAPID キー生成ツール](../screen/vapid-generator.md)) は、本文なしで `Content-Type: application/json` だけを付けて送る
- 成功すると 200 で `{ publicKey, privateKey }` を返す。どちらも文字列で、形式は [VAPID キー](../term/vapid-key.md)のとおり
- 呼ぶたびに新しい鍵を作る。保存はしない

## 処理

```mermaid
flowchart TD
    A[POST を受ける] --> B[① P-256 の鍵ペアを作る]
    B --> C[② 公開鍵の x, y と 秘密鍵の d を取り出す]
    C --> D{③ x, y, d が<br/>すべて文字列か}
    D -->|はい| E[④ 公開鍵を 0x04 + x + y から組み立てる]
    E --> F[200 で返す]
    D -->|いいえ| G[500 で返す]
    B -->|例外| G
```

## エラー

| 条件 | 結果 |
|---|---|
| 鍵の生成で例外になった、または取り出した値の形式が不正 | 500 で `{ error: 'VAPIDキーの生成に失敗しました。' }`。原因はサーバーのログに残る (応答には含めない) |

## つながり

```mermaid
flowchart TD
    S[VAPID キー生成ツール] -->|POST| A["/api/vapid"]
```
