---
sources:
  - libs/common/src/format/jst-period.ts
sources_hash: 87897f2f9abe3195f80c65057fc5046af5ea06cc43c72296bc3c50696f6dd2b4
---

# 日本時間の期間

日本時間 (JST、UTC+9) の暦日・暦月のキー、日の境界の時刻、日付の文字列との変換、記録の TTL を計算する関数。利用回数を日・月で区切って数えるときに使う。メインの `@nagiyu/common` から import する。

時刻はすべて Unix ミリ秒 (`nowMs`)。

## 使い方

| 関数 | 戻り値 | 例 |
|---|---|---|
| `toJstDayKey(nowMs)` | 日本時間の暦日のキー `YYYYMMDD` | `20261105` |
| `toJstMonthKey(nowMs)` | 日本時間の暦月のキー `YYYYMM` | `202611` |
| `toJstDayStartMs(nowMs)` | その時刻を含む日本時間の日の始まり (0 時 0 分 0 秒 0 ミリ秒) の Unix ミリ秒 | |
| `toJstDayEndMs(nowMs)` | その日の終わり (23 時 59 分 59 秒 999 ミリ秒) の Unix ミリ秒 | |
| `toJstDateString(nowMs)` | 日本時間の日付 `YYYY-MM-DD` | `2026-11-05` |
| `parseJstDateString(date)` | `YYYY-MM-DD` の日付の、日本時間の 0 時の Unix ミリ秒。解釈できなければ `null` | |
| `toDayTtlSeconds(nowMs)` | 日ごとの記録の TTL (エポック秒) | |
| `toMonthTtlSeconds(nowMs)` | 月ごとの記録の TTL (エポック秒) | |

## 振る舞い

- 日の境界は、UTC では 15 時にあたる
- `parseJstDateString` は、`YYYY-MM-DD` の形 (数字 4 桁、2 桁、2 桁) だけを受ける。形が違うもの、2 月 30 日のように実在しない日付は `null`

### TTL

| 関数 | TTL の時刻 |
|---|---|
| `toDayTtlSeconds` | その日の終わりの 1 日後。翌々日の日本時間 0 時 (エポック秒、小数点以下は切り捨て) |
| `toMonthTtlSeconds` | 翌月末の日本時間 24 時 (翌々月 1 日 0 時) に、7 日を足した時刻 (エポック秒、小数点以下は切り捨て) |

- TTL は、DynamoDB の TTL 属性に入れる値。期間が終わったあとも、記録を一定時間残すために使う
- DynamoDB の TTL による削除は遅れることがある。期間はキーで区切り、削除を前提にした判定はしない

## 理由

- 区切りは日本時間にする。利用者に説明しやすい。UTC で区切ると、日本の朝 9 時に回数が戻ってしまう
- 日本時間には夏時間がないので、固定の 9 時間のずれで換算する。`Date` のローカル時刻の機能は、実行環境のタイムゾーンに依存するので使わず、UTC の暦で計算する
- TTL は、期間が終わったあとも余裕を持って残す。回数を戻す処理は、記録が残っている期間に対してだけ行うため、期間が変わった直後まで記録を確実に残す必要がある
