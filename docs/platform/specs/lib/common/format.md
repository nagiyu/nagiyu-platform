---
sources:
  - libs/common/src/format/file-size.ts
  - libs/common/src/format/jst.ts
  - libs/common/src/format/price.ts
  - libs/common/src/format/timestamp.ts
sources_hash: f88682fa3fa33e7b240393cc18d70d40f8ee48dcf637a3507c9849902064523e
---

# 表示用のフォーマッタ

ファイルサイズ・日時・価格を、表示用の文字列にする関数。メインの `@nagiyu/common` から import する。日本時間の期間のキーと TTL は [日本時間の期間](./jst-period.md) にある。

## 使い方

| 関数 | 引数 | 戻り値 |
|---|---|---|
| `formatFileSize(bytes)` | バイト数 | `1.5 KB` や `2.3 MB` の形の文字列 |
| `formatJstDateTime(value, options?)` | Unix ミリ秒または `Date`、`{ seconds?: boolean }` | 日本時間の `YYYY/MM/DD HH:mm`。`seconds: true` なら `YYYY/MM/DD HH:mm:ss` |
| `formatJstDate(value)` | Unix ミリ秒または `Date` | 日本時間の `YYYY/MM/DD` |
| `formatPrice(value)` | 数値 | 小数点以下 2 桁の文字列 |
| `getTimestamp()` | なし | 現在時刻の ISO 8601 (UTC) の文字列 |
| `formatLocalDate(date)` | `Date` | ローカルのタイムゾーンの `YYYY-MM-DD` |

```typescript
formatJstDateTime(Date.UTC(2026, 9, 5, 0, 3, 7)); // "2026/10/05 09:03"
formatFileSize(1536); // "1.5 KB"
formatPrice(120); // "120.00"
```

## 振る舞い

### ファイルサイズ

- 1 MB (1024 × 1024 バイト) 未満は、`バイト数 / 1024` を KB として、小数点以下 1 桁で表示する。0 は `0.0 KB`
- 1 MB 以上は、MB として小数点以下 1 桁で表示する。GB 以上の単位はなく、大きい値も MB で表す

### 日本時間の日時

- 実行環境のタイムゾーンに依存せず、常に `Asia/Tokyo` で整形する。サーバーでの描画とブラウザでの表示がそろう
- 24 時間制で、各要素は 2 桁にゼロ埋めする
- 無効な日時 (`NaN` など) を渡すと、`無効な日時が指定されました` の `Error` を投げる

### 価格・時刻

- `formatPrice` は `toFixed(2)`。通貨記号や桁区切りは付けない
- `getTimestamp` は `new Date().toISOString()`
- `formatLocalDate` は、`Date` のローカル時刻の getter で読む。UTC を基準にした日付は、ローカルのタイムゾーンでは別の日付になりうるので、必要なら呼び出し側でローカルの日付に直してから渡す

## 理由

日本時間の整形で `Intl.DateTimeFormat` の整形結果をそのまま使わず、年月日と時分秒の要素だけを取り出して書式を自前で組み立てる。ロケールの整形結果は、ICU の版によって区切り文字や `24:00` の表記が揺れるため。
