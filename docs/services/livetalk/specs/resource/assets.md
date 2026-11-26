---
sources:
  - infra/livetalk/lib/cloudfront-stack.ts
  - infra/common/src/utils/ssm.ts
  - services/livetalk/web/src/lib/characters/client-profiles.ts
  - services/livetalk/web/src/app/layout.tsx
sources_hash: 710d1bd750c68160fb5a3811abcef7b1f23fe4f2fcf4b2121212bb59b04d38e9
---

# CloudFront の配信とアセット

Web の公開の入口になる CloudFront のディストリビューションと、Live2D のモデルのファイル・Cubism Core・一枚絵のパーツ画像を置く S3 バケット。バケットは CloudFront のスタックの中で作り、公開のアクセスは持たず、CloudFront (OAC) だけが読む。`/assets/*` はバケットから、それ以外は ALB ([Web の実行環境](./web-runtime.md)) から配る。共通の部品を使わず直接作っているため、共通の仕様にない設定をここに書く。

## リソース

| 名前 | 種類 | 用途 |
|---|---|---|
| `nagiyu-livetalk-assets-{env}` | S3 バケット | アセットの置き場 |
| ディストリビューション (`LiveTalk Service Distribution ({env})`) | CloudFront | Web の入口 (ALB がオリジン) と `/assets/*` (S3 がオリジン) |
| OAC | CloudFront の Origin Access Control | バケットの読み取りを CloudFront だけに許す |
| `AssetsUriRewrite` | CloudFront Function (viewer-request) | リクエストのパスから `/assets` を外して S3 のキーにする |
| `nagiyu-livetalk-security-headers-{env}` | レスポンスヘッダーポリシー | セキュリティヘッダーと noindex |
| Route53 の ALIAS レコード | DNS | ホスト名からディストリビューションへ ([デプロイ先](../deploy.md)) |

`{env}` は `dev` か `prod`。スタックは `NagiyuLiveTalkCloudFront{Env}` (`{Env}` は `Dev` か `Prod`)。タグは `Application` が `nagiyu`、`Environment` が環境名、`ManagedBy` が `CDK`、`Component` が `livetalk`。

## 設定値

### バケット

| 項目 | 値 |
|---|---|
| パブリックアクセス | すべてブロック |
| 暗号化 | SSE-S3 |
| HTTPS 以外のアクセス | 拒否 |
| バージョニング | なし |
| スタックを削除したとき | バケットを残す (dev も prod も) |

- 暗号化・パブリックアクセスのブロック・HTTPS 限定は、[サービスの S3 バケット](../../../../platform/specs/resource/service-bucket.md)の固定する設定と同じ。`createServiceBucket` は使わず、バケットを直接作る

### ビヘイビア

| パス | オリジン | キャッシュポリシー | 許可するメソッド |
|---|---|---|---|
| `/assets/*` | S3 バケット (OAC) | `CACHING_OPTIMIZED` | GET、HEAD、OPTIONS |
| それ以外 (既定) | ALB (HTTP のポート 80) | `CACHING_DISABLED` | すべて |

| 項目 | `/assets/*` | 既定 |
|---|---|---|
| ビューアーのプロトコル | HTTP は HTTPS へリダイレクト | 同じ |
| オリジンリクエストポリシー | なし | `ALL_VIEWER_EXCEPT_HOST_HEADER` |
| 圧縮 | 有効 | 有効 |
| レスポンスヘッダーポリシー | 上の表のもの | 同じ |
| 関連づける関数 | `AssetsUriRewrite` (viewer-request) | なし |
| オリジンの読み取りのタイムアウト、接続を保つ時間 | - | どちらも 60 秒 |

ディストリビューション全体の設定。

| 項目 | 値 |
|---|---|
| 証明書 | 共有の ACM 証明書 (SSM から ARN を読む) |
| 価格クラス | `PriceClass_100` |
| HTTP のバージョン | HTTP/2 と HTTP/3 |
| IPv6 | 有効 |
| ビューアーの最小 TLS | 1.2 (`TLS_V1_2_2021`) |

レスポンスヘッダーポリシー `nagiyu-livetalk-security-headers-{env}` の設定。両方のビヘイビアに付く。

| 項目 | 値 |
|---|---|
| セキュリティヘッダー | 有効 |
| noindex | 有効 |

- ALB の DNS 名は、SSM の `/nagiyu/livetalk/{env}/alb/dns-name` から読む ([Web の実行環境](./web-runtime.md))。そのため、CloudFront のスタックは ALB のスタックの後にデプロイされる
- 共通の部品 ([CloudFront の共通部品](../../../../platform/specs/resource/cloudfront-distribution.md)) は使わず、ディストリビューションを直接作る。レスポンスヘッダーポリシーは、共通部品の `createResponseHeadersPolicy` を使う

### SSM のパラメータ

このスタックが書く。

| パラメータ | 値 |
|---|---|
| `/nagiyu/livetalk/{env}/cloudfront/distribution-id` | ディストリビューションの ID |
| `/nagiyu/livetalk/{env}/cloudfront/domain-name` | ディストリビューションのドメイン (`d*.cloudfront.net`) |
| `/nagiyu/livetalk/{env}/cloudfront/custom-domain` | カスタムドメイン ([デプロイ先](../deploy.md)のホスト名) |
| `/nagiyu/livetalk/{env}/assets/bucket-name` | アセットのバケットの名前 |

## 置くもの

バケットには、ビルドの成果物は入らない。パーツ画像とモデルは、リポジトリの外にあり、環境ごとに事前に置く。CloudFront は `/assets/` を外したパスをキーにするので、コードの中のパスと、バケットのキーは次のように対応する。

| コードの中のパス | バケットのキー | 使う場所 |
|---|---|---|
| `/assets/cubism-core/live2dcubismcore.min.js` | `cubism-core/live2dcubismcore.min.js` | 全画面の共通で読み込む Cubism Core |
| `/assets/characters/hiyori/runtime/` の下の一式 (入口は `hiyori_free_t08.model3.json`) | `characters/hiyori/runtime/` の下の一式 | 桃瀬ひよりの Live2D のモデル |
| `/assets/characters/ageha/sprite/base.png` | `characters/ageha/sprite/base.png` | 早瀬アゲハのベース画像 |
| `/assets/characters/ageha/sprite/eye-open.png`、`eye-closed.png` | `characters/ageha/sprite/eye-open.png`、`eye-closed.png` | 開いた目、閉じた目 |
| `/assets/characters/ageha/sprite/mouth-open.png`、`mouth-closed.png` | `characters/ageha/sprite/mouth-open.png`、`mouth-closed.png` | 開いた口、閉じた口 |

- Live2D のモデルは、`model3.json` が、同じディレクトリの moc3・テクスチャ・モーションなどを相対パスで参照する ([Live2D の形式](https://docs.live2d.com/en/cubism-sdk-manual/model-settings-model3-json/))。そのため、`model3.json` だけでなく、`runtime/` のディレクトリを、構成を保ったまま丸ごと置く
- パスは、`client-profiles.ts` のキャラクターの登録と、`layout.tsx` の Cubism Core の読み込みが決める。キャラクターを足すときは、そのパスに合わせてバケットに置く
- `/assets/*` は `CACHING_OPTIMIZED` でキャッシュされる。同じキーのファイルを置き換えるときは、CloudFront のキャッシュに古いものが残りうるので、置き換えたあとに無効化する (下の「手順」)

## 理由

- バケットは `createServiceBucket` を使わず、CloudFront のスタックの中で直接作る。バケットと OAC を、ディストリビューションと同じスタックで一体に管理するため
- キーから `/assets` を外すのは、ビヘイビアのパス `/assets/*` に当たったリクエストの URI がそのまま S3 のキーになるため。そのままだと、キーに `assets/` を付けて置かなければならない
- パーツ画像とモデルをリポジトリの外に置き、エッジから配信する。表示の前提として、各環境に事前に置く必要がある
- 既定のビヘイビアのオリジンの読み取りのタイムアウトを 60 秒にするのは、LLM のストリーミングのため。`HttpOrigin` の最大値が 60 秒

## 手順

### アセットを置く

新しい環境や、新しいキャラクターのときは、上の「置くもの」のキーに合わせて、環境のバケット (`nagiyu-livetalk-assets-{env}`) にファイルを置く。置くためのコードやワークフローは、出典にない。以下は、キーに合わせて `aws s3 cp` で置く例である。

```bash
# 1 ファイル
aws s3 cp <ローカルのファイル> s3://nagiyu-livetalk-assets-{env}/<バケットのキー> \
    --region us-east-1 --profile nagiyu-{env}

# ディレクトリ一式 (Live2D のモデルなど)
aws s3 cp <ローカルのディレクトリ> s3://nagiyu-livetalk-assets-{env}/characters/hiyori/runtime/ \
    --recursive --region us-east-1 --profile nagiyu-{env}
```

置いたあとは、`https://<ホスト名>/assets/<バケットのキー>` が 200 で返ることを確かめる (ホスト名は[デプロイ先](../deploy.md))。

### 置き換えたあとにキャッシュを無効化する

既に置いてあるキーを置き換えたときは、CloudFront のキャッシュを無効化する。ディストリビューションの ID は、SSM の `/nagiyu/livetalk/{env}/cloudfront/distribution-id` にある。

```bash
DIST_ID=$(aws ssm get-parameter --name /nagiyu/livetalk/{env}/cloudfront/distribution-id \
    --query Parameter.Value --output text --region us-east-1 --profile nagiyu-{env})
aws cloudfront create-invalidation --distribution-id "$DIST_ID" \
    --paths "/assets/<バケットのキー>" --profile nagiyu-{env}
```

ディレクトリ一式を置き換えたときは、`--paths "/assets/characters/hiyori/runtime/*"` のように `*` で指す。
