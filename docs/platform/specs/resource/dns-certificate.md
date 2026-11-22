---
sources:
  - infra/shared/lib/route53-stack.ts
  - infra/shared/lib/acm-stack.ts
  - infra/shared/lib/route53-records-stack.ts
  - infra/shared/lib/stack-plan.ts
  - infra/shared/bin/shared.ts
  - infra/common/src/utils/ssm.ts
sources_hash: be5023085ef6bcb6600360644b136b807e878287c2ec4405bb889aad300255ac
---

# ドメインと証明書

全サービスが使うドメイン `nagiyu.com` の DNS (Route53 のホストゾーン) と、CloudFront 用の ACM 証明書。prod と dev は別の AWS アカウントで、それぞれが自分のゾーンと証明書を持つ。ホスト名とレコードの作り方、スタックの一覧は[デプロイ先](../deploy.md)にある。

## リソース

| 名前 | 種類 | アカウント | 用途 |
|---|---|---|---|
| `nagiyu.com` | Route53 のパブリックホストゾーン | prod | prod の全レコード。`dev` への NS 委任を持つ |
| `dev.nagiyu.com` | Route53 のパブリックホストゾーン | dev | dev の全レコード |
| 証明書 (主名 `nagiyu.com`、SAN `*.nagiyu.com`) | ACM 証明書 | prod | prod の CloudFront の HTTPS |
| 証明書 (主名 `dev.nagiyu.com`、SAN `*.dev.nagiyu.com`) | ACM 証明書 | dev | dev の CloudFront の HTTPS |

- ゾーンは `NagiyuSharedRoute53`、証明書は `NagiyuSharedAcm`、prod のレコードは `NagiyuSharedRoute53Records` (prod のみ) が作る。
- ゾーンの名前と証明書の主名は同じ値 (prod は `DOMAIN_NAME`、dev は `dev.` を付けたもの) になる。`DOMAIN_NAME` は環境変数か CDK の context `domainName` で渡す。どちらもなければ合成が失敗する。
- 証明書は `us-east-1` に作る (CloudFront が `us-east-1` の証明書しか使えないため)。

## 設定値

| 項目 | 値 |
|---|---|
| prod ゾーンのレコードの TTL | 300 秒 (CNAME、NS) |
| ゾーンのコメント | `Public hosted zone for <ゾーン名>` |
| ACM の検証方式 | DNS 検証 |

### 証明書の検証

検証の方法はアカウントで違う。

| アカウント | 方法 | 検証 CNAME の置き場 |
|---|---|---|
| dev | `fromDns(hostedZone)`。同じアカウントのゾーンを渡し、CDK が検証 CNAME を作る | CDK が自動で作る (手でやることはない) |
| prod | `fromDns()`。ゾーンを渡さないので、CDK は検証 CNAME を作らない | `route53-records-stack.ts` の `ACM_VALIDATION_CNAME` に、ACM が発行した値を手で写してある |

prod の証明書を作り直すと ACM が新しい検証値を発行する。同じ証明書のままなら値は変わらない。

### SSM パラメータと出力

他のスタックは、値を SSM から読む (スタックの出力は人が見る用)。

| SSM パラメータ | 書くスタック | 値 |
|---|---|---|
| `/nagiyu/shared/route53/hosted-zone-id` | `NagiyuSharedRoute53` | ゾーンの ID |
| `/nagiyu/shared/route53/hosted-zone-name` | `NagiyuSharedRoute53` | ゾーンの名前 |
| `/nagiyu/shared/acm/certificate-arn` | `NagiyuSharedAcm` | 証明書の ARN |
| `/nagiyu/shared/acm/domain-name` | `NagiyuSharedAcm` | 証明書の主名 |

| スタック | 出力 |
|---|---|
| `NagiyuSharedRoute53` | `HostedZoneIdExport`、`HostedZoneNameExport`、`HostedZoneNameServersExport` (割り当てられたネームサーバー 4 つ。dev の値を prod の NS 委任に写すときに見る) |
| `NagiyuSharedAcm` | `CertificateArnExport`、`DomainNameExport`、`WildcardDomainExport` (ワイルドカードの名前。SSM には書かない) |

## 手で写している値

次の値は、リソースの実物から取った値をコードに直書きしている。実物が変わると、コードを直すまで食い違う。

| 値 | 場所 (`infra/shared/lib/route53-records-stack.ts`) | 変わるとき |
|---|---|---|
| サービスの CloudFront のドメイン (CNAME の向き先) | `CLOUDFRONT_CNAMES` | サービスの CloudFront を作り直したとき |
| ポータルの CloudFront のドメイン (apex の ALIAS の向き先) | `APEX_CLOUDFRONT_DOMAIN` | ポータルの CloudFront を作り直したとき |
| dev ゾーンのネームサーバー 4 つ | `DEV_ZONE_DELEGATION` | dev のゾーンを作り直したとき |
| prod の証明書の検証 CNAME | `ACM_VALIDATION_CNAME` | prod の証明書を作り直したとき |

Google Search Console の所有確認用 CNAME (`GOOGLE_SEARCH_CONSOLE_CNAME`) も同じファイルにある。

## リポジトリの外にあるもの

ドメインのレジストラは XServer で、DNS の応答 (権威 DNS) だけが Route53 にある。レジストラの設定はリポジトリの外にあるので、写しを持たない。確かめるには次を見る。

- `dig NS nagiyu.com +short` が、prod ゾーンのネームサーバー (`awsdns` を含む 4 つ) を返すこと。この値は prod アカウントのゾーンの `HostedZoneNameServersExport` と一致する。
- レジストラ側のネームサーバー設定は、XServer の管理画面のドメイン設定で見る。

## 理由

- 権威 DNS を Route53 にするのは、レコードをコードで持ち、レビューを通せるため。新しいサービスを足すときに外部の DNS 管理画面を触らなくて済む。apex (`nagiyu.com`) に CNAME は作れないが、Route53 なら CloudFront への ALIAS を作れる。
- レジストラ (XServer) を動かさないのは、ドメインの取得・更新と DNS の応答が別の役割だから。ネームサーバーの向き先を Route53 にすれば、ゾーンの権威は Route53 になるので、契約を移す必要がない。
- dev を別ゾーンにして prod から NS で委任するのは、dev の DNS レコードと証明書の検証を dev アカウントの中で完結させるため。理由は[デプロイ先](../deploy.md)の「理由」にある。
- 証明書をアカウントごとに別にするのも同じ理由で、dev の証明書は dev のゾーンだけで検証できる。
- 証明書の検証 CNAME は消さない。ACM は有効期限の前に、この CNAME を引いて自動で更新する。消すと更新できず、期限が切れる。
- prod の検証 CNAME を手で写すのは、既存の証明書の検証方式を変えると証明書が置き換わるおそれがあるため。コード側の `acm-stack.ts` は、ゾーンを渡さなければ従来どおりの検証にしてある。
- レコードの TTL は、コードの定数 1 つで全レコードに揃えている。

## 手順

確かめには、次の値を使う。ARN は SSM から取れる。

```bash
aws ssm get-parameter --name /nagiyu/shared/acm/certificate-arn \
    --profile nagiyu-prod --region us-east-1 --query Parameter.Value --output text
```

### prod にサービスを足す、またはサービスの CloudFront を作り直す

1. サービスの CloudFront を先にデプロイし、ディストリビューションのドメイン (`xxxx.cloudfront.net`) を確かめる。

    ```bash
    aws cloudfront list-distributions --profile nagiyu-prod \
        --query "DistributionList.Items[?Aliases.Items && contains(Aliases.Items, '<ホスト名>')].DomainName"
    ```

2. `route53-records-stack.ts` の `CLOUDFRONT_CNAMES` に、レコード名・向き先・コメントを足す (作り直したときは向き先を直す)。ポータルなら `APEX_CLOUDFRONT_DOMAIN`。
3. `NagiyuSharedRoute53Records` をデプロイする。
4. 確かめる: `dig <ホスト名> CNAME +short` が、手順 1 のドメインを返すこと。

dev は、サービスの CloudFront スタックが dev のゾーンに ALIAS を作るので、ここでの作業はない。

### prod の証明書を作り直す

1. ACM が発行した検証値を確かめる。

    ```bash
    aws acm describe-certificate --certificate-arn <ARN> --profile nagiyu-prod --region us-east-1 \
        --query "Certificate.DomainValidationOptions[*].ResourceRecord"
    ```

2. `ACM_VALIDATION_CNAME` の `recordName` と `target` を、その値に直す。
3. `NagiyuSharedRoute53Records` をデプロイする。
4. 確かめる: `aws acm describe-certificate` の `Certificate.Status` が `ISSUED` であること。`dig <recordName>.nagiyu.com CNAME +short` が `target` を返すこと。

### dev のゾーンを作り直す

1. dev アカウントで、新しいゾーンのネームサーバーを確かめる。

    ```bash
    aws route53 get-hosted-zone --id <ゾーンの ID> --profile nagiyu-dev \
        --query DelegationSet.NameServers
    ```

    ゾーンの ID は `/nagiyu/shared/route53/hosted-zone-id` を `--profile nagiyu-dev` で読んで得る。
2. `DEV_ZONE_DELEGATION` の `nameServers` を、その 4 つに直す。
3. `NagiyuSharedRoute53Records` を prod にデプロイする。
4. 確かめる: `dig NS dev.nagiyu.com +short` が、手順 1 の 4 つを返すこと。
