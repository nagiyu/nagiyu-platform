---
sources:
  - libs/ui/src/components/Select/Select.tsx
  - libs/ui/src/components/Select/Select.module.css
sources_hash: fafebb81616438206d667777dca87c24635364db926fe0a516e192b0ff21d337
---

# Select

単一選択のプルダウン。素の `<select>` を使うので、キーボード操作とモバイルの選択 UI は OS の標準に従う。`@nagiyu/ui` から `Select` を import する。

## 使い方

```tsx
<Select
    label="並び順"
    value={order}
    onChange={setOrder}
    options={[
        { value: 'asc', label: '昇順' },
        { value: 'desc', label: '降順' },
    ]}
/>
```

| Props | 型 | 既定値 | 内容 |
|---|---|---|---|
| `value` | string | 必須 | 選択中の値。未選択は空文字 |
| `onChange` | `(value: string) => void` | 必須 | 選んだ値を直接受け取る (イベントではない) |
| `options` | `{ value, label, disabled? }` の配列 | 必須 | 選択肢 |
| `label` | ReactNode | なし | ラベル |
| `placeholder` | string | なし | 指定すると、先頭に値が空文字の選択肢を足す |
| `helperText` | ReactNode | なし | 下の補助テキスト |
| `disabled` / `required` / `error` | boolean | `false` | 状態 |
| `fullWidth` | boolean | `false` | 親の幅いっぱいに広げる |
| `size` | `sm` / `md` / `lg` | `md` | 最小の高さが 32 / 40 / 48 px |
| `onBlur` / `onFocus` | `<select>` のイベントのハンドラ | なし | |
| `id` / `name` / `autoFocus` / `aria-label` / `className` | | なし | 同名の属性。`className` は外側の要素に付く |

制御専用で、`value` と `onChange` は必須。非制御には対応しない。ref は外側の `<div>` に渡る。

## 振る舞い

- ラベルと `<select>` は `htmlFor` と `id` で結ぶ。`id` を渡さなければ自動で作る
- `required` のとき、ラベルの後ろに `*` を出す (スクリーンリーダーには読ませない)。`placeholder` の選択肢は `required` のとき選べない
- `helperText` があるとき、`aria-describedby` でそれを指す
- `error` のとき、`aria-invalid` を付け、枠線と補助テキストを danger 色にする
- 右端の矢印は装飾で、スクリーンリーダーには読ませない
