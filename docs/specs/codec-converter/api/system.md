---
id: codec-converter/api/system
title: システム系の API
kind: api
service: codec-converter
sources:
  - services/codec-converter/web/src/app/api/health/route.ts
  - libs/nextjs/src/health.ts
sources_hash: bcdf592b216db8bcecc54dae24e240cf75ccb473b0491675b840eeece5ed2890
---

# システム系の API

業務の機能ではない API。死活確認だけがある。

## エンドポイント

| メソッド | パス | 権限 |
|---|---|---|
| GET | `/api/health` | なし |

## 入力と出力

- `{ status: 'ok', service: 'codec-converter', version, timestamp }` を返す。`version` は環境変数 `APP_VERSION`、なければ `1.0.0`。`timestamp` は ISO 8601
- 入力はない。DynamoDB、S3、Batch への接続は確かめず、サーバーが応答できるかだけを示す

## エラー

- ここで返すエラーを決めていない

## つながり

```mermaid
flowchart TD
    M[死活確認の呼び出し元] --> H["/api/health"]
```
