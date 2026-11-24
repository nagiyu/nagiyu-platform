---
sources:
  - libs/browser/src/clipboard.ts
sources_hash: 6393de827bdd0bbc38562ac0c17cc0c073dfdfb54d6791f572f0f131373159cb
---

# クリップボード

クリップボードのテキストを読み書きする。`@nagiyu/browser` から import する。

## 使い方

| 関数 | 引数 | 戻り値 |
|---|---|---|
| `readFromClipboard` | なし | クリップボードのテキスト (Promise) |
| `writeToClipboard` | 書き込むテキスト | なし (Promise) |

```ts
import { readFromClipboard, writeToClipboard } from '@nagiyu/browser';

await writeToClipboard('コピーする文字列');
const text = await readFromClipboard();
```

## 振る舞い

- どちらも `navigator.clipboard` が無いときは、API を呼ばずに失敗として扱う。SSR 用の判定は持たず、`navigator` が無い環境でも同じく失敗になる
- 読み取りは `navigator.clipboard.readText()`、書き込みは `navigator.clipboard.writeText()` を呼ぶ

### 失敗したとき

API が無い場合も、API が拒否した場合 (権限がない、ユーザーが許可しないなど) も、元の例外は捨てて、次の固定メッセージの `Error` を投げる。

| 関数 | メッセージ |
|---|---|
| `readFromClipboard` | クリップボードの読み取りに失敗しました。手動で貼り付けてください。 |
| `writeToClipboard` | クリップボードへの書き込みに失敗しました。 |
