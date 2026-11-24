---
sources:
  - libs/common/src/auth/redirect.ts
sources_hash: 00ebb7b497468de0b4d330e154183e8eaaedc3d5a3ce4b6b86fedc4b193b105a
---

# リダイレクト先 URL の検証

認証の流れで外部から渡される `callbackUrl` などのリダイレクト先が、プラットフォームの中を指すかを判定する。外部依存がなく、サーバーとクライアントのどちらからも使える。メインの `@nagiyu/common` から import する。

## 使い方

`isAllowedNagiyuRedirectUrl(rawUrl, baseUrl)`

| 引数 | 内容 |
|---|---|
| `rawUrl` | 検証する URL の文字列 |
| `baseUrl` | 自サービスのベース URL。同一オリジンの判定に使う |

戻り値は、許可するなら `true`。

## 振る舞い

次の順に判定する。

| 順 | 条件 | 結果 |
|---|---|---|
| 1 | `rawUrl` が URL として解釈できない (相対パスを含む) | `false` |
| 2 | プロトコルが `http:` でも `https:` でもない (`javascript:`、`data:` など) | `false` |
| 3 | `rawUrl` のオリジンが `baseUrl` のオリジンと同じ | `true` |
| 4 | ホスト名が `nagiyu.com` と完全に一致する、または `.nagiyu.com` で終わる | `true` |
| 5 | 上のどれでもない | `false` |

- `baseUrl` が URL として解釈できないときは、3 を飛ばして 4 で判定する (例外にしない)
- 4 は、プロトコルが `http:` か `https:` であれば、ポートやパスを問わない

## 理由

URL の文字列を前方一致や正規表現で調べない。`https://auth.nagiyu.com.evil.com` のように、ホスト名の途中に許可するドメインを含む URL を許してしまうため。URL として解釈し、ホスト名を完全一致か `.nagiyu.com` の末尾一致で比べる。検証せずに遷移先に使うとオープンリダイレクトになる。
