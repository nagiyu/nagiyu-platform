---
sources:
  - libs/ui/src/components/layout/ServiceLayout.tsx
  - libs/ui/src/components/layout/AppLayout.tsx
  - libs/ui/src/components/providers/AppThemeProvider.tsx
  - libs/ui/package.json
sources_hash: a3d938f76008a55971dd9af6d71991153b1b79e6a01bf7f09eab63193396e0ed
---

# サービスのレイアウト

サービスのページ全体の枠。MUI のテーマと `CssBaseline` を当てたうえで、ヘッダー、本文、フッターを縦に並べる。`ServiceLayout` を `@nagiyu/ui/service-layout` (メインの `@nagiyu/ui` からも import できる) から使う。テーマだけを当てる `AppThemeProvider` も提供する。

## 使い方

```tsx
<ServiceLayout headerProps={{ title: 'Tools' }} footerProps={{ version: '1.2.0' }}>
    {children}
</ServiceLayout>
```

### ServiceLayout

| Props | 型 | 内容 |
|---|---|---|
| `children` | ReactNode | 本文 |
| `headerProps` | `Partial<HeaderProps>` | [Header](./header.md) に渡す props。未指定なら Header の既定値 |
| `footerProps` | `Partial<FooterProps>` | [Footer](./footer.md) に渡す props。未指定なら Footer の既定値 |
| `headerSlot` | ReactNode | Header の代わりに置く要素 |
| `footerSlot` | ReactNode | Footer の代わりに置く要素 |

### AppThemeProvider

`children` だけを受け取る。`ServiceLayout` を使わないサービスや、エラー画面が使う。

### AppLayout

`children` と、省略できる `themeOverride` (MUI の `Theme`) を受け取る。`@nagiyu/ui` から import できる。

## 振る舞い

- 3 つとも、MUI の App Router 用のキャッシュ (`AppRouterCacheProvider`)、`ThemeProvider`、`CssBaseline` を重ねる。テーマは [デザイントークン](./design-tokens.md) の `theme`。`AppLayout` だけ `themeOverride` で差し替えられる
- `ServiceLayout` は `AppLayout` の中に、高さが画面いっぱい (`100vh`) の縦並びの箱を作る。上からヘッダー、本文 (`main`、残りの高さを占める)、フッター
- `headerSlot` / `footerSlot` があれば、対応する Header / Footer は描かず (`headerProps` / `footerProps` も使われない)、その要素を置く
- フッターは本文が短くても、箱の下端に寄る
