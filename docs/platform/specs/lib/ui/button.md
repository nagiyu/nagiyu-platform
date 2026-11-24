---
sources:
  - libs/ui/src/components/Button/Button.tsx
  - libs/ui/src/components/Button/Button.module.css
sources_hash: 446996f9157ced8869fef2d7c59654a8f0e6a502d98b104af17a7b23d16a7232
---

# Button

ボタン。素の `<button>` と CSS Modules で描き、色はデザイントークンの Semantic 変数から取る。`@nagiyu/ui` から `Button` を import する。

## 使い方

```tsx
<Button variant="outline" color="danger" loading={saving} onClick={onSave}>
    保存
</Button>
```

| Props | 型 | 既定値 | 内容 |
|---|---|---|---|
| `variant` | `solid` / `outline` / `ghost` | `solid` | 塗りつぶし / 枠線のみ / 背景なし |
| `color` | `primary` / `secondary` / `danger` / `success` / `warning` / `neutral` | `primary` | 色の意味 |
| `size` | `sm` / `md` / `lg` | `md` | 最小の高さが 32 / 40 / 48 px |
| `loading` | boolean | `false` | スピナーを出し、操作を止める |
| `startIcon` | ReactNode | なし | 左側の装飾アイコン。`asChild` と同時に指定できない (型エラー) |
| `asChild` | boolean | `false` | 子要素にボタンの props とスタイルを渡す |
| `className` | string | なし | 追加のクラス |
| その他 | `<button>` の属性 (`color` を除く) | | そのまま渡す |

`sx` と `style` を受け取る専用の口はない。見た目を足すときは `className` を使う。ref は `<button>` (または `asChild` の子) に渡る。

## 振る舞い

### 通常

- `type` の既定値は `button` (フォームを意図せず送信しない)
- `disabled` と `loading` のどちらかが真なら、`disabled` 属性を付け、無効の見た目にする
- `loading` が真のとき、スピナーを出し、ラベルとアイコンは見えない状態にして幅を保つ。`aria-busy` を付ける
- `startIcon` は `aria-hidden` で包んで描く。`loading` 中はスピナーに置き換わる
- `aria-busy` と `aria-disabled` は、呼び出し側が指定した値を優先する

### asChild

`<a>` などをボタンの見た目で出すときに使う。子要素は 1 つの React 要素にする。

- `disabled` 属性は付けない (子が `<button>` とは限らないため)。代わりに `aria-disabled` を付け、CSS で操作を止める
- `loading` の `aria-busy` は付くが、スピナーは出ない (子要素を差し替えられないため)。見た目は無効と同じ減光だけになる
- `startIcon` は使えない。アイコンは子要素の中に自分で置く

## 理由

- 素の HTML 要素と CSS Modules で作る。MUI のテーマや emotion に依存せず、Semantic 変数だけでライト・ダークに追従するため
- `asChild` で変身させる。Next.js の `Link` などを、ボタンの見た目のままリンクとして描けるようにするため
