---
sources:
  - libs/browser/src/localStorage.ts
sources_hash: bc82c30b8c5918b2dba3bd794b287b069fd0eef14eee7f7fa4e5c12aaddb74f4
---

# localStorage

`localStorage` を、値の JSON 変換と SSR への対応つきで読み書きする。`@nagiyu/browser` から import する。

## 使い方

| 関数 | 引数 | 戻り値 |
|---|---|---|
| `getItem<T>` | キー | 値。無い・読めないときは `null` |
| `setItem<T>` | キー、値 | なし |
| `removeItem` | キー | なし |

```ts
import { getItem, setItem } from '@nagiyu/browser';

setItem('settings', { theme: 'dark' });
const settings = getItem<{ theme: string }>('settings');
```

## 振る舞い

`localStorage` を使えるかは、`window.localStorage` の有無で判定する。SSR や、アクセスが例外になる環境では、使えないとみなす。

| 関数 | 使えるとき | 使えないとき |
|---|---|---|
| `getItem` | 保存された文字列を `JSON.parse` して返す。パースできなければ文字列のまま返す。キーが無ければ `null` | `null` を返す |
| `setItem` | 文字列はそのまま、それ以外は `JSON.stringify` して保存する | `console.warn` を出して何もしない |
| `removeItem` | キーを削除する | `console.warn` を出して何もしない |

`getItem` は常に `JSON.parse` を試すので、`setItem('k', '123')` のように文字列で保存した値でも、数値 `123` で返る。

`getItem` は、読み取り中に例外が起きても `console.error` を出して `null` を返す。投げない。

### 失敗したとき

`setItem` と `removeItem` は、`localStorage` を使えるのに操作が例外になったとき、`console.error` を出し、日本語の固定メッセージの `Error` (`cause` に元の例外) を投げる。

| 関数 | 条件 | メッセージ |
|---|---|---|
| `setItem` | 容量超過 (`QuotaExceededError` など) | ストレージの容量が不足しています。不要なデータを削除してください。 |
| `setItem` | それ以外 | データの保存に失敗しました。 |
| `removeItem` | 例外 | データの削除に失敗しました。 |
