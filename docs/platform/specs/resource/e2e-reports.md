---
sources:
  - infra/shared/lib/reports-hosting-stack.ts
  - infra/shared/lib/stack-plan.ts
  - infra/shared/bin/shared.ts
sources_hash: 2f8700e4549914f8c4d36ed61b78034b5cf05bea7b6b6b7614d91ba6f3039cc9
---

# E2E レポートの置き場所

各サービスの Playwright E2E の HTML レポートを置き、PR コメントから開けるように公開する S3 バケットと CloudFront。prod と dev のアカウントに、それぞれ作る。レポートを置く側の流れと URL の形は[E2E](../ci/e2e.md)にある。

## リソース

スタック名は `NagiyuE2eReportsHosting` (両アカウント)。ホスト名とスタックの一覧は[デプロイ先](../deploy.md)にある。

| 名前 | 種類 | 用途 |
|---|---|---|
| `nagiyu-e2e-reports` (prod)、`nagiyu-e2e-reports-dev` (dev) | S3 バケット | レポートの置き場。非公開 |
| (ディストリビューション) | CloudFront | バケットを OAC 経由で公開する |
| `reports` の ALIAS レコード | Route53 | `reports.<ゾーン名>` を CloudFront に向ける。prod は `reports.nagiyu.com`、dev は `reports.dev.nagiyu.com` |
| `RewriteToIndexHtml` | CloudFront Function | 末尾が `/` の URI に `index.html` を補う |
| `nagiyu-e2e-reports-security-headers` | レスポンスヘッダーポリシー | セキュリティヘッダーを付ける |

## 設定値

### バケット

| 項目 | 値 |
|---|---|
| 暗号化、パブリックアクセスのブロック、HTTPS 限定 | 固定 ([サービスの S3 バケット](./service-bucket.md)) |
| バージョニング | なし |
| ライフサイクル | 作成から 3 日で削除。未完了のマルチパートアップロードは 1 日で破棄 |
| 削除ポリシー | `RETAIN` |

バケット名は、アカウントのスコープごとに決まる (prod は `nagiyu-e2e-reports`、dev は `nagiyu-e2e-reports-dev`)。

### 配信

| 項目 | 値 |
|---|---|
| オリジン | S3 バケット (OAC) |
| ホスト名 | `reports.` + ゾーン名。dev のゾーン名は `dev.<ドメイン>` |
| 証明書 | SSM の `ACM_CERTIFICATE_ARN` が指す、アカウントごとの ACM 証明書 |
| ビューアーのプロトコル | HTTPS へリダイレクト |
| 許可するメソッド | GET、HEAD、OPTIONS |
| キャッシュ | `CACHING_OPTIMIZED`。圧縮あり |
| TLS の最小バージョン | `TLS_V1_2_2021` |
| HTTP | HTTP/2 と HTTP/3 |
| 価格クラス | `PRICE_CLASS_100` |
| デフォルトのルートオブジェクト | `index.html` |
| DNS | 環境によらず、このスタックが `reports` の ALIAS を作る |

### レスポンスヘッダー

セキュリティヘッダーを付け、検索エンジンにインデックスさせない (`noindex`)。`X-Frame-Options` は `SAMEORIGIN` にする。

### dev での依存

dev では、ACM 証明書のスタックと Route53 のスタックのデプロイ完了を待ってから、このスタックを作る。

## 理由

- **公開してよい**: E2E はダミーデータだけを扱い、リポジトリも public なので、レポートに機微な情報は含まれない。認証を付けず、PR コメントのリンクから誰でも開けるようにする。
- **3 日で消す**: 過去のレポートを残し続ける用途は想定せず、必要になったら CI を再実行して作り直す運用にする。保持が必要なら、GitHub Actions の Artifact (30 日) から取れる。
- **バケットを prod と dev で分ける**: アカウントごとに別のバケットと別のホスト名を持つ。
- **`index.html` を補う**: CloudFront の `defaultRootObject` はルート (`/`) にしか効かない。`/foo/bar/` のようにサブディレクトリで終わる URI は、S3 にそのままキーが渡されて AccessDenied になる。Playwright の HTML レポートは各ディレクトリに `index.html` を持つので、末尾が `/` のとき補う。
- **`SAMEORIGIN`**: Playwright のレポートはトレースのスナップショットを同じオリジンの iframe で描く。`DENY` にすると表示できない。
- **ヘッダーポリシー名を固定する**: dev と prod はアカウントが別で、ポリシー名はアカウント内で一意であればよい。
