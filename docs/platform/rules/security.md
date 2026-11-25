---
sources: []
---

# セキュリティの規約

外部入力、XSS、秘密情報の扱いの規則と、その理由。強制している設定ファイルはなく、レビューで守らせるため、出典は持たない。

## 外部入力

### 外部から入る値は、すべて検証してから使う

API の入力、フォームの値、環境変数、外部サービスの応答など、コードの外から入る値は信用しない。型が `string` でも、中身が空や想定外の形のことがある。検証の置き場所、結果の型、エラーメッセージの規則は [バリデーションの規約](./validation.md) にある。

## XSS

### 画面の描画は React の標準に任せる

`<div>{userInput}</div>` のように、値を JSX に埋めるだけにする。React が自動でエスケープするため、文字列が HTML として解釈されない。

### `dangerouslySetInnerHTML` には、サニタイズかエスケープを通した文字列だけを渡す

利用者や外部から来た文字列を、そのまま渡さない。HTML として描くときは DOMPurify (Portal は `isomorphic-dompurify`) でサニタイズする。JSON-LD のように HTML ではなく、`<script>` の中身として出すものは、`<` を `\u003c` に置き換えるなどしてエスケープする。`</script>` で `<script>` が閉じるのを防ぐためである。Portal は、Markdown から作った HTML をサニタイズしてから渡し、JSON-LD の文字列を、`<` を `\u003c` へ置き換える関数 (`jsonLdScript`) を通してから渡している。

```tsx
// OK: エスケープした文字列
<script type="application/ld+json"
    dangerouslySetInnerHTML={{ __html: jsonLdScript(data) }} />

// NG: 通していない文字列
<div dangerouslySetInnerHTML={{ __html: userInput }} />
```

通していない文字列が混ざると、スクリプトを差し込まれて XSS になる。

## 秘密情報

### 秘密情報を、ビルド時に埋め込まれる変数 (`NEXT_PUBLIC_*`) に入れない

`NEXT_PUBLIC_` で始まる環境変数は、ビルド時にクライアントのコードへ埋め込まれ、ブラウザから誰でも読める。API キーやトークンは、サーバー側だけで読む名前 (`NEXT_PUBLIC_` を付けない) で持つ。

```ts
// NG: クライアントから見える
const apiKey = process.env.NEXT_PUBLIC_API_KEY;

// OK: サーバーだけ
const apiKey = process.env.SECRET_API_KEY;
```

