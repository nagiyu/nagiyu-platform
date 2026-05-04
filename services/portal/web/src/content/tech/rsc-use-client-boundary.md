---
title: 'React Server Components の境界設計：use client をどこに置くか'
description: 'Next.js App Router の React Server Components で `use client` をどこに引くべきかを実装パターンで整理。データ取得・インタラクション・props のシリアライズ可否・パフォーマンス影響を踏まえた実用的な指針を解説します。'
slug: 'rsc-use-client-boundary'
publishedAt: '2026-04-20'
updatedAt: '2026-05-01'
author: 'なぎゆー'
tags: ['Next.js', 'React', 'Server Components', 'App Router']
---

## はじめに

Next.js App Router の最大の特徴である React Server Components（RSC）は、強力な反面 **「`'use client'` をどこに書くか」** で迷いがちです。境界設計を誤るとクライアントバンドルが肥大化したり、Server Components の利点を活かせなかったりします。本記事では、nagiyu ポータルで実装してきた中で見えた実用パターンを整理します。

## 大前提：すべては Server Component から始まる

App Router の `app/**/page.tsx` は **デフォルトで Server Component** です。`'use client'` を書かない限りは Server で実行され、HTML として返されます。

```tsx
// app/tech/page.tsx → これは Server Component
import { getAllArticles } from '@/lib/content';

export default async function TechIndex() {
  const articles = getAllArticles(); // サーバーで実行
  return (
    <ul>
      {articles.map((a) => (
        <li key={a.slug}>{a.title}</li>
      ))}
    </ul>
  );
}
```

データ取得・ファイル読み込み・DB アクセスはすべて Server で完結し、ブラウザには結果の HTML だけが届きます。**バンドルサイズに影響しません**。

## `'use client'` を引く 3 つの理由

クライアント境界が必要になるのは、概ね次の 3 ケースです。

1. **インタラクション**: `onClick`, `onChange`, `useState`, `useReducer` を使う
2. **ブラウザ API**: `localStorage`, `window`, `document`, `navigator`
3. **既存 Client ライブラリ**: MUI のフォーム、framer-motion、react-query など

これに該当しないコンポーネントは Server のままで良い、と覚えておくと境界が引きやすくなります。

## パターン 1: ページは Server、操作部分だけ Client

```tsx
// app/tech/[slug]/page.tsx (Server)
import LikeButton from './LikeButton'; // Client

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getArticle(slug); // Server でデータ取得
  return (
    <article>
      <h1>{article.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: article.content }} />
      <LikeButton slug={slug} initialCount={article.likes} />
    </article>
  );
}
```

```tsx
// app/tech/[slug]/LikeButton.tsx (Client)
'use client';
import { useState } from 'react';

export default function LikeButton({ slug, initialCount }: Props) {
  const [count, setCount] = useState(initialCount);
  return <button onClick={() => setCount(count + 1)}>♥ {count}</button>;
}
```

データ取得は Server、状態管理は Client。**「いいね数」だけ Client コンポーネントに切り出す**ことで、記事本文部分はバンドルに含まれません。

## パターン 2: Server Component を Client Component の children に渡す

Client Component が Server Component を _子要素_ として受け取ることはできます。

```tsx
// app/layout.tsx (Server)
import ThemeRegistry from '@/components/ThemeRegistry';
import Header from '@/components/Header'; // Server

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeRegistry>
      <Header />
      {children}
    </ThemeRegistry>
  );
}
```

`ThemeRegistry` は Client（`'use client'`）ですが、その children に Server Component の `Header` を入れています。これは **「Client Component が Server Component を import するのは NG、children として受け取るのは OK」** というルールから許される使い方です。

このパターンを使うと、Provider 系の薄い Client Component で全体を包んでも、内側の重い処理を Server に残せます。

## パターン 3: Hooks ラッパーを共通化する

複数のページで同じインタラクション（モーダル、トースト、ダイアログ）を使うとき、Hooks ベースの薄い Client Component を切り出します。

```tsx
'use client';
// src/components/CopyButton.tsx
import { useState } from 'react';
import { Button } from '@mui/material';

export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? 'コピー済' : 'コピー'}
    </Button>
  );
}
```

各ページからは `<CopyButton text="..." />` で呼ぶだけ。**インタラクションごとに Client コンポーネントを 1 つ用意する**のがバンドル最適化の基本です。

## props はシリアライズ可能なものだけ

Server Component から Client Component に props を渡すとき、**関数・クラスインスタンス・Symbol などはシリアライズできない**のでエラーになります。

```tsx
// NG: Date は問題ないが、関数は渡せない
<Component onClose={() => {}} />

// OK: プリミティブ・配列・オブジェクトのみ
<Component slug="foo" tags={['AWS']} count={42} />
```

イベントハンドラを渡したいときは、Client Component の中で定義する／Server Action を使う／ID を渡してクライアント側でハンドラを組み立てる、のいずれかにします。

## クライアントバンドルの肥大化を抑える

`'use client'` を引いたコンポーネントの **import 先全体がクライアントバンドルに入ります**。重いライブラリを Server-only に保つには、import の方向を意識する必要があります。

```tsx
// NG: Server で gray-matter を使いたいのに、ファイル冒頭で 'use client'
'use client';
import matter from 'gray-matter'; // クライアントバンドルに入ってしまう

// OK: 上位の Server Component で gray-matter を使い、結果だけ渡す
// page.tsx (Server)
import matter from 'gray-matter';
const data = matter(file).data;
return <ArticleHeader data={data} />;
```

ライブラリを `'use client'` ファイルから import すると、tree-shake できないライブラリは丸ごと bundle に乗ります。SSR 時専用の処理は Server で完結させましょう。

## Server Action でクライアント境界を更に減らす

フォーム送信のような典型的な「Client → Server」通信は、Server Action を使うとクライアントコードが激減します。

```tsx
// app/contact/page.tsx (Server)
async function submitContact(formData: FormData) {
  'use server';
  await saveToDb({
    name: formData.get('name') as string,
    email: formData.get('email') as string,
  });
}

export default function ContactPage() {
  return (
    <form action={submitContact}>
      <input name="name" required />
      <input name="email" type="email" required />
      <button type="submit">送信</button>
    </form>
  );
}
```

`onSubmit` を書かずに `action={...}` で Server 側関数を直接渡せます。ProgressIndicator などのインタラクションが要らないフォームは、これで Client コードゼロで作れます。

## ハマりどころ

- **`'use client'` を全 page に書いてしまう**: Server Components の利点を全部捨てている状態。境界を引き直す。
- **import チェーンの罠**: A.tsx に `'use client'` がなくても、A.tsx が import している B.tsx に `'use client'` があれば、A もクライアントバンドルに乗る依存先扱いになる。
- **`useTheme()` を Server で呼ぶ**: MUI の hook は Client Components 内でだけ使える。
- **環境変数の露出**: Client Component から `process.env.SECRET` を参照すると undefined。`NEXT_PUBLIC_` プレフィックスのものだけ Client で読める。
- **動的 import の使い分け**: `next/dynamic` で `ssr: false` を指定すると Client-only コンポーネントを SSR 対象から外せるが、初期 HTML が空になるので使い所を選ぶ。

## まとめ

RSC の境界設計は「**Server をデフォルトにし、インタラクションが必要な部分だけ Client に切り出す**」という単純な原則で大半が片付きます。Client Component を「葉」に保ち、データ取得とレイアウトを Server に残すことで、バンドルサイズと初期表示性能の両方を最適化できます。
