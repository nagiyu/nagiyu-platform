---
sources:
  - libs/nextjs/src/health.ts
sources_hash: b10c3fcaf25a57eb95579042b7568d77dfd6dcc086c247f3f9094e4a83a7ddb5
---

# ヘルスチェックのルート

サービスのヘルスチェック用の GET ハンドラを作る。`@nagiyu/nextjs` から import する。

## 使い方

`createHealthRoute({ service, version })` が GET のルートハンドラを返す。

| オプション | 内容 |
|---|---|
| `service` | サービスの名前 |
| `version` | サービスのバージョン |

```typescript
export const GET = createHealthRoute({ service: 'admin', version: '1.0.0' });
```

## 振る舞い

常に 200 で、次の JSON を返す。認証や外部への確認はしない。

| 項目 | 値 |
|---|---|
| `status` | `ok` |
| `service` | オプションの `service` |
| `version` | オプションの `version` |
| `timestamp` | 呼び出した時刻 (ISO 8601) |
