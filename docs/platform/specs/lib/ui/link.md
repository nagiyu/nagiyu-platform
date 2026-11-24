---
sources:
  - libs/ui/src/components/Link/Link.tsx
  - libs/ui/src/components/Link/Link.module.css
sources_hash: 8488947cf73aef0c2d0d5272183d8fdabc3e12cd3efee6a31530f1c495089cbc
---

# Link

スタイル付きのリンク。素の `<a>` と CSS Modules で描く。`@nagiyu/ui` から `Link` を import する。

## 使い方

```tsx
<Link href="/terms" underline="always">利用規約</Link>
```

| Props | 型 | 既定値 | 内容 |
|---|---|---|---|
| `color` | `primary` / `secondary` / `danger` / `success` / `warning` / `neutral` / `inherit` | `primary` | 色の意味。`inherit` は親の文字色を引き継ぐ |
| `underline` | `none` / `hover` / `always` | `hover` | 下線を出さない / ホバー時だけ / 常に |
| `asChild` | boolean | `false` | 子要素に props とスタイルを渡す |
| `children` | ReactNode | 必須 | リンクの中身。`asChild` のときは 1 つの React 要素 |
| `className` | string | なし | 追加のクラス |
| その他 | `AnchorHTMLAttributes` (`color` を除く) | | `href` や `target` などをそのまま渡す |

## 振る舞い

- 通常は `<a>` を描く。`asChild` が真のときは子要素に props を合成する (Next.js の `Link` などをリンクの見た目で描くとき)
- ref は描いた要素に渡る
