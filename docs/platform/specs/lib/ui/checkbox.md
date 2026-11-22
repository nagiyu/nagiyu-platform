---
sources:
  - libs/ui/src/components/Checkbox/Checkbox.tsx
  - libs/ui/src/components/Checkbox/Checkbox.module.css
sources_hash: 488da349a604ad8726fd4aa806a4c4faece957c59b64e159d180a9316be38d5f
---

# Checkbox

チェックボックス。素の `<input type="checkbox">` を視覚的に隠し、CSS で描き直す。ラベルも 1 つにまとめて渡せる。`@nagiyu/ui` から `Checkbox` を import する。

## 使い方

```tsx
<Checkbox label="利用規約に同意する" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
```

| Props | 型 | 既定値 | 内容 |
|---|---|---|---|
| `checked` / `defaultChecked` | boolean | なし | 制御 / 非制御の値 |
| `onChange` | `<input>` の変更イベントのハンドラ | なし | |
| `label` | ReactNode | なし | 右側に出すラベル |
| `disabled` / `required` | boolean | `false` | |
| `indeterminate` | boolean | `false` | 部分選択の状態 |
| `size` | `sm` / `md` / `lg` | `md` | ボックスが 16 / 20 / 24 px |
| `id` / `name` / `value` / `autoFocus` | | なし | 同名の HTML 属性 |
| `aria-label` / `aria-labelledby` | string | なし | `label` を使わないときの名前 |
| `className` | string | なし | 外側の要素に付くクラス |
| `inputRef` | ref | なし | `<input>` への ref |

`forwardRef` の ref も `<input>` に渡る。`ref` と `inputRef` を両方渡したら、どちらにも入る。

## 振る舞い

- `label` があるとき、外側を `<label>` にして入力欄と結ぶ。`id` を渡さなければ自動で作る。`label` がなければ `<span>` で包む
- `required` のとき、ラベルの後ろに `*` を出す (スクリーンリーダーには読ませない)
- `indeterminate` は HTML の属性ではなく DOM のプロパティなので、変わるたびに `<input>` へ反映する。見た目は横棒のアイコンになる (チェック済みのときのチェックマークとは別に描く)
