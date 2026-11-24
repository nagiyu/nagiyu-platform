---
sources:
  - libs/ui/src/components/TextField/TextField.tsx
  - libs/ui/src/components/TextField/TextField.module.css
sources_hash: 5fa0f278588cb5bd97882cae88085b86b2c70ff051d8609d8d35a6afae3ae669
---

# TextField

テキスト入力。ラベル・入力欄・補助テキストを 1 つにまとめる。素の `<input>` と `<textarea>` で描く。`@nagiyu/ui` から `TextField` を import する。

## 使い方

```tsx
<TextField label="名前" value={name} onChange={(e) => setName(e.target.value)} required fullWidth />
```

| Props | 型 | 既定値 | 内容 |
|---|---|---|---|
| `value` / `defaultValue` | string | なし | 制御 / 非制御の値 |
| `onChange` / `onBlur` / `onFocus` / `onKeyDown` | イベントハンドラ | なし | イベントは `<input>` または `<textarea>` のもの |
| `label` | ReactNode | なし | ラベル |
| `placeholder` | string | なし | |
| `helperText` | ReactNode | なし | 入力欄の下の補助テキスト |
| `type` | `text` / `password` / `email` / `number` / `search` / `tel` / `url` | `text` | |
| `disabled` / `required` / `readOnly` / `error` | boolean | `false` | 状態 |
| `fullWidth` | boolean | `false` | 親の幅いっぱいに広げる |
| `size` | `sm` / `md` / `lg` | `md` | 入力欄の最小の高さが 32 / 40 / 48 px |
| `multiline` | boolean | `false` | `<textarea>` で描く |
| `rows` / `minRows` / `maxRows` | number | なし | 複数行の行数 |
| `maxLength` | number | なし | `maxlength` 属性 |
| `id` / `name` / `autoFocus` / `autoComplete` / `inputMode` | | なし | 同名の HTML 属性 |
| `aria-label` | string | なし | `label` を使わないときの名前 |
| `className` | string | なし | 外側の要素に付くクラス |
| `inputRef` | ref | なし | 内側の `<input>` または `<textarea>` への ref |

外側の `<div>` への ref は、`forwardRef` の ref で受ける。

## 振る舞い

- ラベルと入力欄は `htmlFor` と `id` で結ぶ。`id` を渡さなければ自動で作る
- `required` のとき、ラベルの後ろに `*` を出す (スクリーンリーダーには読ませない)
- `helperText` があるとき、入力欄の `aria-describedby` でそれを指す
- `error` のとき、`aria-invalid` を付け、枠線と補助テキストを danger 色にする
- `multiline` のとき、行数は `rows` を使う。`rows` がなく `minRows` があれば `minRows` を行数にする。`maxRows` は `data-max-rows` 属性に出すだけで、高さの自動調整はしない
