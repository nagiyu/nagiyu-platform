---
id: tools/api/system
title: システム系の API
kind: api
service: tools
sources:
  - services/tools/src/app/api/health/route.ts
  - libs/nextjs/src/health.ts
sources_hash: 720ffcaf2e42d28cb0a196734ae5c0d33e2d5c664f1d1bd1876931dacc88621b
related_adr:
  - services/tools/architecture.md#Health API
---

# システム系の API

業務の機能ではない API。死活確認だけがある。

## エンドポイント

| メソッド | パス | 権限 |
|---|---|---|
| GET | `/api/health` | なし |

## 入力と出力

- `{ status: 'ok', service: 'tools', version, timestamp }` を返す。`version` は環境変数 `APP_VERSION`、なければ `1.0.0`。`timestamp` は ISO 8601
- 入力はない。サーバーが応答できるかだけを示す

## エラー

- ここで返すエラーを決めていない

## つながり

```mermaid
flowchart TD
    M[死活確認の呼び出し元] --> H["/api/health"]
```
