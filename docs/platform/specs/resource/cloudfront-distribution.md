---
sources:
  - infra/common/src/stacks/cloudfront-stack-base.ts
  - infra/common/src/cloudfront/response-headers-policy.ts
  - infra/common/src/constants/security-headers.ts
  - infra/common/src/constants/defaults.ts
sources_hash: b33428d6db72acbcb73599fa42676039bcfab537c55021640498f00100351de2
---

# CloudFront の共通部品

Lambda の Function URL をオリジンにする CloudFront ディストリビューションの共通部品 `CloudFrontStackBase` と、そのレスポンスヘッダーポリシー。サービスの文書は、ここの既定値を前提にして、差分だけを書く。

## 既定値

| 項目 | 値 |
|---|---|
| オリジン | Function URL のドメイン。HTTPS のみ (443)、オリジンへの TLS は 1.2 |
| ビューアーのプロトコル | HTTP は HTTPS へリダイレクト |
| 許可するメソッド | すべて |
| キャッシュするメソッド | GET、HEAD、OPTIONS |
| キャッシュポリシー | `CACHING_DISABLED` (呼び出し側が差し替えられる) |
| オリジンリクエストポリシー | `ALL_VIEWER_EXCEPT_HOST_HEADER` (呼び出し側が差し替えられる) |
| 圧縮 | 有効 |
| HTTP のバージョン | HTTP/2 と HTTP/3 |
| IPv6 | 有効 |
| 価格クラス | `PriceClass_100` |
| ビューアーの最小 TLS | 1.2 (`TLS_V1_2_2021`) |
| 証明書 | 共有の ACM 証明書。ARN は SSM から読む (呼び出し側が渡せる) |
| セキュリティヘッダー | 有効 |
| noindex | 無効 |

- HTTP のバージョン、価格クラス、ビューアーの最小 TLS (1.3 を選ぶと `TLS_V1_3_2025`)、セキュリティヘッダー、noindex は、`cloudfrontConfig` で変える
- 追加で、default behavior に CloudFront Function を関連づけられる
- ホスト名、dev の ALIAS レコード、prod の CNAME は[デプロイ先](../deploy.md)にある
- タグは `Application` が `nagiyu`、`Service` がサービス名、`Environment` が環境名。出力は、ディストリビューションの ID とドメイン、カスタムドメイン名

## レスポンスヘッダーポリシー

セキュリティヘッダーか noindex のどちらかが有効なとき、`nagiyu-{サービス名}-security-headers-{env}` を作り、default behavior に付ける。どちらも無効ならポリシーを作らない。

| ヘッダー | 値 |
|---|---|
| Strict-Transport-Security | `max-age=63072000` (2 年)、サブドメインを含む、preload |
| X-Content-Type-Options | `nosniff` |
| X-Frame-Options | `DENY`。呼び出し側が `SAMEORIGIN` を指定できる |
| X-XSS-Protection | 有効、ブロックモード |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| X-Robots-Tag | `noindex, nofollow` (noindex が有効なときだけ) |

- どのヘッダーも、オリジンのヘッダーを上書きする
- X-Frame-Options が `SAMEORIGIN` のサービスは、E2E レポート (shared) と Storybook (ui-storybook)
- `createResponseHeadersPolicy` は、セキュリティヘッダーも noindex も無効で呼ぶと失敗する。中身のないポリシーになるため
- `CloudFrontStackBase` を使わず、`createResponseHeadersPolicy` を直接呼ぶスタックもある (Portal の prod、LiveTalk、codec-converter、E2E レポート、Storybook)

### noindex

Portal を除く全サービスで、全環境が noindex を有効にする。検索エンジンに載せないため。Portal は、Lambda で動く dev が noindex を有効にし、ALB と ECS で動く prod は noindex にしない (検索エンジンに載せる)。

## 理由

- オリジンリクエストポリシーは `ALL_VIEWER_EXCEPT_HOST_HEADER` にする。`ALL_VIEWER` だと、ビューアーの Host ヘッダー (カスタムドメイン) がオリジンへ転送される。Lambda の Function URL は自身のドメイン以外の Host を受け付けないため、直接アクセスでは 200 でも、CloudFront 経由では 403 になる
- ヘッダーの値を共通定数から組み立て、サービスごとの差が出ないようにする
