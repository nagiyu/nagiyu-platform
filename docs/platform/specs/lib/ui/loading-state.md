---
sources:
  - libs/ui/src/components/loading/LoadingState.tsx
sources_hash: c19bc40937fbeecf433a985452f9642c658f0bbc48e43645369e9cb3488e4b54
---

# LoadingState

読み込み中の表示。スピナーとメッセージを中央に出す。MUI の `CircularProgress` で描く。`@nagiyu/ui` から `LoadingState` を import する。

## 使い方

```tsx
<LoadingState variant="inline" />
```

| Props | 型 | 既定値 | 内容 |
|---|---|---|---|
| `message` | string | `読み込み中...` | メッセージ |
| `variant` | `page` / `inline` | `page` | 画面全体の読み込み / 一覧や表の中の読み込み |
| `minHeight` | 数値、文字列、`xs` 〜 `xl` ごとの数値 | `page` は 400、`inline` は指定なし | 最小の高さ |
| `size` | number | 40 | スピナーの大きさ (px) |
| `data-testid` | string | なし | 外側の要素の ID。E2E から特定するため |

## 振る舞い

| `variant` | メッセージの表示 | 余白 |
|---|---|---|
| `page` | スピナーの下に出す | なし |
| `inline` | 出さない。読み上げ用にスピナーの `aria-label` だけに使う | 上下に余白を付ける |

- 呼び出し側が `minHeight` を指定したら、`inline` でもそれを使う
- 外側に `role="status"`、`aria-live="polite"`、`aria-busy="true"` を付ける。入れ子の読み上げ領域は二重に読まれるので、内側の要素には `aria-live` を付けない
