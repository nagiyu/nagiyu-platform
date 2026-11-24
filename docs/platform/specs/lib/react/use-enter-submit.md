---
sources:
  - libs/react/src/hooks/useEnterSubmit.ts
sources_hash: 9383706dc12a77449c356f886e15ea890a48730226f597e548236f3ab074f4a9
---

# useEnterSubmit

単一行の入力で、Enter キーを押したときに送信の処理を呼ぶ `onKeyDown` ハンドラを作るフック。IME の変換を確定する Enter では呼ばない。`@nagiyu/react` から import する。

## 使い方

| 引数 | 既定値 | 内容 |
|---|---|---|
| `onSubmit` | (必須) | Enter で確定したときに呼ぶ関数 |
| `options.disabled` | `false` | `true` の間は Enter で呼ばない |
| `options.preventDefault` | `true` | 呼ぶときに `event.preventDefault()` するか |

戻り値は `onKeyDown` に渡すハンドラ。イベントの対象の要素の型は型引数で変えられる (既定は `HTMLInputElement`)。

```tsx
const handleKeyDown = useEnterSubmit(() => search(value));

<input value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={handleKeyDown} />;
```

## 振る舞い

次のどれかに当たるイベントは、何もせずに返す (`preventDefault` もしない)。

| 条件 | 無視する理由 |
|---|---|
| `Enter` 以外のキー | 対象外 |
| IME の変換中 (`isComposing` が `true`、または `keyCode` が 229) | 変換の確定の Enter で誤って送信しないため。`keyCode` は、`isComposing` で検出できない環境のため |
| Shift・Ctrl・Meta・Alt のどれかが押されている | 改行やショートカットを壊さないため |
| `disabled` が `true` | 無効の指定 |

どれにも当たらなければ、`preventDefault` が `true` のときは `event.preventDefault()` してから、`onSubmit` を呼ぶ。ハンドラは、`onSubmit` と各オプションが変わったときだけ作り直される。
