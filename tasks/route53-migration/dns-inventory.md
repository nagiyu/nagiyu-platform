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

| 名前 | タイプ | 値 | TTL | 用途・備考 |
|---|---|---|---|---|
| `tools.nagiyu.com` | CNAME | `xxxxxxxx.cloudfront.net` | | tools サービス（推定） |
| `dev-tools.nagiyu.com` | CNAME | `xxxxxxxx.cloudfront.net` | | tools サービス dev（推定） |
| ... | | | | |

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
