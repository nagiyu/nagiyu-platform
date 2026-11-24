---
sources:
  - libs/ui/src/components/Chip/Chip.tsx
  - libs/ui/src/components/Chip/Chip.module.css
sources_hash: e8f763c026695f7ee1423a9237b861b7de409137e8d73c38c8035ea92a77aa06
---

# Chip

タグやステータスを示す小さな部品。素の HTML 要素と CSS Modules で描く。`@nagiyu/ui` から `Chip` を import する。

## 使い方

```tsx
<Chip color="success" variant="outline" size="sm">公開中</Chip>
```

| Props | 型 | 既定値 | 内容 |
|---|---|---|---|
| `variant` | `solid` / `outline` | `solid` | 塗りつぶし / 枠線のみ |
| `color` | `primary` / `secondary` / `danger` / `success` / `warning` / `neutral` | `neutral` | 色の意味 |
| `size` | `sm` / `md` / `lg` | `md` | 最小の高さが 20 / 24 / 32 px |
| `asChild` | boolean | `false` | 子要素に props とスタイルを渡す |
| `children` | ReactNode | 必須 | ラベル。`asChild` のときは 1 つの React 要素 |
| `className` | string | なし | 追加のクラス |
| その他 | `HTMLAttributes` (`color` を除く) | | そのまま渡す |

## 振る舞い

描く要素は次の順で決まる。

| 条件 | 要素 |
|---|---|
| `asChild` が真 | 子要素 (props を合成する) |
| `onClick` がある | `<button type="button">` (フォームを送信しない。キーボードでも操作できる) |
| それ以外 | `<span>` |

- `onClick` があるか `asChild` のとき、操作できる見た目 (カーソル・ホバー) にする
