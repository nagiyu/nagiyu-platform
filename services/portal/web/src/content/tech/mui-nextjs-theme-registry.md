---
title: 'Material-UI v9 と Next.js App Router の SSR を両立する ThemeRegistry 実装'
description: 'MUI（Material-UI）v9 と Next.js App Router の Server Components で SSR とスタイル一貫性を両立する ThemeRegistry の実装方法を解説。Emotion キャッシュ・ハイドレーション・テーマ切替まで網羅します。'
slug: 'mui-nextjs-theme-registry'
publishedAt: '2026-04-15'
updatedAt: '2026-06-06'
author: 'なぎゆー'
tags: ['Next.js', 'MUI', 'App Router', 'Emotion']
categories: ['nextjs']
---

## はじめに

Material-UI（MUI）を Next.js App Router で使うと、Server Components の SSR と Emotion のスタイル管理が衝突しやすく、初期描画でスタイルなし HTML が一瞬見える「FOUC（Flash of Unstyled Content）」が発生しがちです。本記事では `ThemeRegistry` パターンを解説します。nagiyu-platform 自体では後述する MUI の公式プロバイダ構成を採用していますが、その背景理解として `ThemeRegistry` パターンの仕組みは押さえておく価値があります。

## 何が問題か

App Router では、ページ全体を Server Component として SSR した HTML をブラウザに返し、その後ハイドレーションが走ります。一方 MUI は **Emotion がスタイルをクライアントで動的注入する**ので、SSR された HTML には Emotion のスタイルが含まれていません。結果としてスタイルなし HTML が見えてしまいます。

これを解決するには、**SSR 時に Emotion の `<style>` を HTML head に流し込む**必要があります。Next.js では `useServerInsertedHTML` フックがその受け皿です。

## ThemeRegistry の実装

```tsx
// src/components/ThemeRegistry.tsx
'use client';

import { useState } from 'react';
import { useServerInsertedHTML } from 'next/navigation';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { theme } from '@/theme';

export default function ThemeRegistry({ children }: { children: React.ReactNode }) {
  const [{ cache, flush }] = useState(() => {
    const cache = createCache({ key: 'mui', prepend: true });
    cache.compat = true;

    const prevInsert = cache.insert;
    let inserted: string[] = [];
    cache.insert = (...args) => {
      const serialized = args[1];
      if (cache.inserted[serialized.name] === undefined) {
        inserted.push(serialized.name);
      }
      return prevInsert(...args);
    };

    const flush = () => {
      const prev = inserted;
      inserted = [];
      return prev;
    };
    return { cache, flush };
  });

  useServerInsertedHTML(() => {
    const names = flush();
    if (names.length === 0) return null;
    let styles = '';
    for (const name of names) {
      styles += cache.inserted[name];
    }
    return (
      <style
        data-emotion={`${cache.key} ${names.join(' ')}`}
        dangerouslySetInnerHTML={{ __html: styles }}
      />
    );
  });

  return (
    <CacheProvider value={cache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </CacheProvider>
  );
}
```

ポイントを整理します。

- **`'use client'`** が必要：`useState` と `useServerInsertedHTML` はクライアント境界の API
- **`prepend: true`**：Emotion のスタイルを `<head>` の先頭に挿入。CSS の優先順位を下げて、ユーザーの CSS が上書きしやすくなる
- **`cache.insert` のラップ**：挿入されたクラス名を控えておき、`useServerInsertedHTML` のタイミングで一括出力
- **`flush()`**：1 回出力した分は控えから消す。連続した SSR で重複出力を防ぐ

## レイアウトでの使い方

```tsx
// app/layout.tsx
import ThemeRegistry from '@/components/ThemeRegistry';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
```

`ThemeRegistry` 配下では `useTheme()` や MUI コンポーネントが Server Components の HTML 出力でも正しいスタイルで描画されます。

## テーマの定義

```typescript
// src/theme.ts
import { createTheme } from '@mui/material';

export const theme = createTheme({
  palette: {
    primary: { main: '#1976d2' },
    secondary: { main: '#ec407a' },
  },
  typography: {
    fontFamily: ['system-ui', '-apple-system', 'sans-serif'].join(','),
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none' }, // ボタンを大文字化しない
      },
    },
  },
});
```

`textTransform: 'none'` は日本語サイトの定番設定。デフォルトの `uppercase` は英語前提なので、日本語ボタンが歪に見える問題を解消します。

## ダークモード対応

ダークモードを切り替える場合、テーマを切り替えるためのコンテキストを `ThemeRegistry` 内に持たせます。

```tsx
'use client';
import { useState, createContext, useContext } from 'react';
import { createTheme, ThemeProvider } from '@mui/material';

const ColorModeContext = createContext({ toggle: () => {} });
export const useColorMode = () => useContext(ColorModeContext);

export default function ThemeRegistry({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const theme = createTheme({ palette: { mode } });
  const ctx = { toggle: () => setMode((m) => (m === 'light' ? 'dark' : 'light')) };

  // ... cache / flush 部分は同じ
  return (
    <CacheProvider value={cache}>
      <ColorModeContext.Provider value={ctx}>
        <ThemeProvider theme={theme}>{children}</ThemeProvider>
      </ColorModeContext.Provider>
    </CacheProvider>
  );
}
```

初期値は localStorage から復元する、サーバーから OS の preferred-color-scheme を読む、などの工夫が必要ですが、まずはトグルが動くことから始めると良いです。

## Server Components と Client Components の境界

MUI のコンポーネントの多くは内部で `useState` や Context を使うので、**呼び出すファイルは `'use client'` が必要**です。Server Components から MUI を直接使おうとするとエラーになります。

実用的な切り分け:

- **Server Component**: データ取得 / レイアウト構造
- **Client Component**: フォーム / インタラクティブ要素 / MUI のコンポーネント呼び出し

```tsx
// app/tech/[slug]/page.tsx は Server Component のまま
import ArticleBody from './ArticleBody'; // 'use client' のクライアントコンポーネント

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getArticle(slug);
  return <ArticleBody article={article} />;
}
```

データ取得を Server で済ませ、props として Client Component に渡すパターンが基本形です。

## 実装ノート

ここまで手書きの `ThemeRegistry` を解説してきましたが、正直に書くと、nagiyu-platform 本体では私はこの自前キャッシュを使っていません。実際に採用しているのは MUI 公式の `AppRouterCacheProvider`（`@mui/material-nextjs/v16-appRouter`）で、Emotion キャッシュと `useServerInsertedHTML` 相当の処理はライブラリ側に任せています。理由はシンプルで、自前で `cache.insert` をラップして `flush()` を回す保守コストを、私が背負い続けたくなかったからです。MUI も v9 系まで上がり、公式実装が安定したので、車輪の再発明をやめました。

さらに私は、このプロバイダを各サービスにコピペするのではなく、`@nagiyu/ui` の `AppThemeProvider` という 1 つの Client Component に集約しています。中身は `AppRouterCacheProvider` → `ThemeProvider` → `CssBaseline` → `children` というだけの薄いラッパーで、Portal の `layout.tsx` からは `<AppThemeProvider>` を呼ぶだけ。テーマ実装が複数サービスで散らからないよう、共通ライブラリに寄せたのが自分の設計判断です。

## ハマったポイント

記事のサンプルコードと違って公式プロバイダに寄せた今でも、私が実際に踏んだ地雷はテーマ定義側に残りました。

- **palette に CSS 変数を入れて壊した**: 最初は `tokens.css` の `var(--...)` をそのまま palette に流し込もうとしたのですが、MUI 内部の `alpha()` / `decomposeColor()` は `var()` を色として解釈できず、ホバー時の半透明色などで例外が出ました。結局 `theme.ts` の palette には `#1565c0` のような具体的な色値を直書きし、角丸・影・トランジションなどの非カラー値だけ `var(--radius-md)` のように CSS 変数を参照する、という割り切りに落ち着いています。
- **`'use client'` の置き場所**: `AppThemeProvider` 自体は `'use client'` ですが、その子に Server Component を素直に渡せることを最初は半信半疑で確かめました。
- **`textTransform` の上書き忘れ**: 日本語ボタンが大文字化されないよう、自分のテーマでは `button.textTransform: 'none'` を必ず入れています。これを忘れると英語ラベルだけ妙に大文字になります。
- **複数の Emotion インスタンス**: 依存ライブラリが別バージョンの Emotion を持ち込むと別キャッシュで二重スタイルになるため、`npm ls @emotion/react` で重複していないかは今でも確認します。

## 現在の運用

現状 nagiyu-platform では、テーマはライト 1 種類で固定運用しています。本記事ではダークモード切替の例も載せましたが、これは「やろうと思えばできる」という解説であって、Portal 本番にトグルはまだ入れていません。私の優先順位として、まずは複数サービスで見た目を揃えること（共通 `AppThemeProvider` + `tokens.css`）を先に固め、ダークモードは後回しにした、というのが正直なところです。逆に言えば、テーマ実装を 1 箇所に集約してあるおかげで、ダークモード対応が必要になっても触る場所は `@nagiyu/ui` 配下だけで済む見込みです。

## まとめ

`ThemeRegistry` パターンは、MUI v9 と Next.js App Router の SSR 互換を最小コストで実現する定番手法です。Emotion キャッシュをカスタムしてスタイルを `useServerInsertedHTML` で吐き出すこと、Server Components / Client Components の境界を意識することで、ハイドレーション崩れや FOUC のない安定した描画が得られます。
