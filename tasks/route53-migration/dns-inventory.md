<!--
    Phase 0 の棚卸し結果を記録するためのテンプレート。
    XServer 管理画面で nagiyu.com の全 DNS レコードを確認し、本ファイルに記入する。

    記入後、Phase 2 の CDK 化作業の入力として使用される。

    関連 Issue: #2902
-->

# nagiyu.com DNS レコード棚卸し（Phase 0）

> 記入者: TBD
> 記入日: YYYY-MM-DD
> 取得元: XServer ドメイン管理画面（DNS レコード設定）

## 棚卸し方針

- XServer 管理画面で確認できる **全レコード**を漏れなく転記する
- レコードタイプ・名前・値・TTL を必ず記録する
- 不明な用途のレコードがあっても削除せず、そのまま転記し「用途不明」と備考に記載する
- `dig nagiyu.com ANY +noall +answer @<xserver-ns>` などのコマンドでも併せて確認し、管理画面に表示されない隠れたレコードがないかクロスチェックする

## レコード一覧

### A / AAAA レコード

| 名前 | タイプ | 値 | TTL | 用途・備考 |
|---|---|---|---|---|
| | | | | |

### CNAME レコード

| 名前 | タイプ | 値 | 用途・備考 |
|---|---|---|---|
| `_795cd11835618eae1172367526630b7f.nagiyu.com` | CNAME | `_09095adf08f7ad2742324041fb053779.zfyfvmchrl.acm-validations.aws` | |
| `dev-tools.nagiyu.com` | CNAME | `di5qiqkse31ld.cloudfront.net` | Tools (dev) |
| `nagiyu.com` | CNAME | `d1k6ec293qn4f7.cloudfront.net` | ルート |
| `tools.nagiyu.com` | CNAME | `dxsm9dplwcq8k.cloudfront.net` | Tools |
| `dev-auth.nagiyu.com` | CNAME | `dqwp0hty66uo0.cloudfront.net` | Auth (Dev) |
| `auth.nagiyu.com` | CNAME | `d34m95nq713g26.cloudfront.net` | Auth |
| `dev-admin.nagiyu.com` | CNAME | `d20d90d0yxf3hy.cloudfront.net` | Admin (Dev) |
| `dev-niconico-mylist-assistant.nagiyu.com` | CNAME | `d1m48o6sp5o6j9.cloudfront.net` | Niconico Mylist Assistant (Dev) |
| `admin.nagiyu.com` | CNAME | `da84amiv79v4m.cloudfront.net` | Admin |
| `dev-codec-converter.nagiyu.com` | CNAME | `dj528on1g8nw0.cloudfront.net` | Codec Converter (Dev) |
| `dev-stock-tracker.nagiyu.com` | CNAME | `d1vh86o7kq78ya.cloudfront.net` | Stock Tracker (Dev) |
| `stock-tracker.nagiyu.com` | CNAME | `d1n3pw1wiam9k0.cloudfront.net` | Stock Tracker |
| `codec-converter.nagiyu.com` | CNAME | `d1bh7qvatnkglt.cloudfront.net` | Codec Converter |
| `niconico-mylist-assistant.nagiyu.com` | CNAME | `d2jj4a3zh6zf5h.cloudfront.net` | Niconico Mylist Assistant |
| `dev-share-together.nagiyu.com` | CNAME | `d3f8lnzpu25qxe.cloudfront.net` | Share Together (Dev) |
| `share-together.nagiyu.com` | CNAME | `d3vh0c4lc7bae6.cloudfront.net` | Share Together |
| `dev-quick-clip.nagiyu.com` | CNAME | `dh18sa23cobm6.cloudfront.net` | Quick Clip (Dev9) |
| `dev.nagiyu.com` | CNAME | `d1p44g973egas4.cloudfront.net` | ルート (Dev) |
| `hnjg6vgudcwv.nagiyu.com` | CNAME | `gv-d6lr3lnlnk6zbu.dv.googlehosted.com` | |
| `quick-clip.nagiyu.com` | CNAME | `d1v96dysvz62zc.cloudfront.net` | Quick Clip |

### MX レコード（メール）

| 名前 | タイプ | 値 | TTL | 用途・備考 |
|---|---|---|---|---|
| | | | | |

### TXT レコード（SPF / DKIM / DMARC / 所有権確認 等）

| 名前 | タイプ | 値 | TTL | 用途・備考 |
|---|---|---|---|---|
| | | | | |

### NS レコード（サブゾーン委任があれば）

| 名前 | タイプ | 値 | TTL | 用途・備考 |
|---|---|---|---|---|
| | | | | |

### SRV / その他

| 名前 | タイプ | 値 | TTL | 用途・備考 |
|---|---|---|---|---|
| | | | | |

## ACM DNS 検証 CNAME

ACM 証明書の検証用に登録されている CNAME を別途記録する（Phase 5 で自動化に置換するため）。

| 名前 | タイプ | 値 | TTL | 備考 |
|---|---|---|---|---|
| `_xxxxxxxxx.nagiyu.com` | CNAME | `_yyyyyyyy.acm-validations.aws.` | | `*.nagiyu.com` 証明書の検証用 |

`aws acm describe-certificate --certificate-arn <arn> --region us-east-1 --query 'Certificate.DomainValidationOptions[*].ResourceRecord'` で確認可能。

## 確認コマンド例（クロスチェック用）

```bash
# 主要レコードを XServer NS から直接取得
NS=ns1.xserver.jp  # XServer のネームサーバ（実際の値に置換）

dig @$NS nagiyu.com SOA +short
dig @$NS nagiyu.com NS +short
dig @$NS nagiyu.com MX +short
dig @$NS nagiyu.com TXT +short
dig @$NS nagiyu.com A +short

# サブドメイン
for sub in tools auth admin quick-clip stock-tracker share-together niconico-mylist-assistant codec-converter; do
  echo "=== $sub.nagiyu.com ==="
  dig @$NS $sub.nagiyu.com CNAME +short
  echo "=== dev-$sub.nagiyu.com ==="
  dig @$NS dev-$sub.nagiyu.com CNAME +short
done
```

## 完了条件

- [ ] XServer 管理画面の全レコードを転記済み
- [ ] `dig` によるクロスチェックで漏れがないことを確認済み
- [ ] 用途不明レコードの調査・確認済み（消してよいか判断済み）
- [ ] 本ファイルを Phase 2 担当者に共有済み
