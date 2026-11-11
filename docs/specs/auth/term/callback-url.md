---
id: auth/term/callback-url
title: 戻り先 (callbackUrl)
kind: term
service: auth
sources:
  - libs/common/src/auth/redirect.ts
  - services/auth/web/src/lib/callback-url.ts
  - services/auth/web/src/lib/refresh-callback.ts
  - services/auth/web/src/lib/signout.ts
  - services/auth/web/src/lib/billing-urls.ts
  - services/auth/web/src/lib/auth/auth.ts
sources_hash: cedd21f53707480b768b00e8bee218b5a31913a03dbe63f1978b9276a30e1255
related_cards: [auth/screen/signin, auth/screen/plans, auth/screen/refresh, auth/screen/signout, auth/api/billing, auth/flow/sign-in]
related_adr:
  - services/auth/architecture.md#7.1 OAuth セキュリティ
---

# 戻り先 (callbackUrl)

サインイン・サインアウト・権限の更新・決済のあとに、利用者を元の画面へ戻すための URL。外から渡される値なので、使う前に必ず検証する。

## 説明

絶対 URL の許可の基準は共通で、「同一オリジン、または `nagiyu.com` とそのサブドメインの `http` / `https` の絶対 URL」。ホスト名は URL として読んで比べる (`auth.nagiyu.com.evil.com` のような前方一致のすり抜けを防ぐため)。使う場所で、通らなかったときの行き先が違う。

| 使う場所 | 通らない値のとき |
|---|---|
| サインインのあと ([サインインの経路](../flow/sign-in.md)) | Auth のトップ |
| [権限更新画面](../screen/refresh.md) | Auth のトップ |
| [サインアウト確認画面](../screen/signout.md)のキャンセル | `/dashboard` |
| [プラン画面](../screen/plans.md)と[課金 API](../api/billing.md) | 無いものとして扱う |

- サインインのあと・権限更新画面・プラン画面・課金 API の検証は、Auth 内の相対パスも通す。`//` で始まるもの、`\` を含むもの、解決すると別のオリジンになるものは通さない。通った相対パスは絶対 URL にして使う
- サインアウト確認画面のキャンセルは、認証ライブラリがサインインのあとと同じ検証を通して Cookie に控えた値を、絶対 URL の基準で読み直す
- 戻り先は、プラン画面の URL の `callbackUrl` に載せて引き継ぐ。申し込みの決済のあとは `/plans?checkout=success&callbackUrl=...`、そこから `/refresh?callbackUrl=...` を経て戻る

## 関連するカード

- [サインイン画面](../screen/signin.md)・[プラン画面](../screen/plans.md)・[権限更新画面](../screen/refresh.md)・[サインアウト確認画面](../screen/signout.md)
