# Route53

本ドキュメントは、nagiyu-platform における Route53（権威 DNS）の設計と運用について説明します。

---

## 概要

`nagiyu.com` の権威 DNS を AWS Route53 で管理しています。ドメインの取得・更新は引き続き外部レンタルサーバー（XServer）で行いますが、DNS の応答（権威）は Route53 が担当します。

### 基本方針

- **権威 DNS**: Route53 のパブリックホストゾーン（共有・1 つのみ）
- **ドメインレジストラ**: 外部（XServer）に残す
- **環境分離**: dev / prod 共通の hosted zone（DNS の仕組み上 1 ドメインに 1 zone のため）
- **レコード管理**: すべて CDK で管理（手動操作なし）
- **TTL**: 全レコード 300 秒

### Route53 を選んだ理由

- **CDK のみで完結**: 新サービス追加時に外部 DNS の管理画面を触る必要がない
- **apex の ALIAS**: `nagiyu.com` を CloudFront に直接向けられる（XServer 時代は CNAME で代替していた）
- **インフラの Git 管理**: DNS レコードもコードとしてレビュー可能
- **将来の拡張**: ヘルスチェック・フェイルオーバー等の高度機能が利用可能

---

## ドメイン構成

### Hosted Zone

| ドメイン | hosted zone | 環境 |
|---|---|---|
| `nagiyu.com` | 1 つのみ | dev / prod 共通 |

### サブドメイン命名規則

| 環境 | パターン | 例 |
|---|---|---|
| prod | `{service}.nagiyu.com` | `tools.nagiyu.com`, `auth.nagiyu.com` |
| dev | `dev-{service}.nagiyu.com` | `dev-tools.nagiyu.com`, `dev-auth.nagiyu.com` |
| ルート (prod) | `nagiyu.com` (apex) | `nagiyu.com` |
| ルート (dev) | `dev.nagiyu.com` | `dev.nagiyu.com` |

apex (`nagiyu.com`) は Route53 の制約により CNAME を貼れないため、CloudFront への ALIAS（A レコード）として登録します。サブドメインは現状 CNAME ですが、将来的に ALIAS への置換予定（[#2919](https://github.com/nagiyu/nagiyu-platform/issues/2919)）。

---

## CDK スタック構成

Route53 関連は共有インフラ（`infra/shared`）配下の 2 つのスタックで構成しています。

### NagiyuSharedRoute53（hosted zone 本体）

- `nagiyu.com` のパブリックホストゾーンを作成
- ホストゾーン ID と名前を SSM Parameter Store に保存（他スタックから参照する用途）
    - `/nagiyu/shared/route53/hosted-zone-id`
    - `/nagiyu/shared/route53/hosted-zone-name`
- 払い出された 4 つのネームサーバを CfnOutput に公開（XServer のネームサーバ設定に登録する用途）

### NagiyuSharedRoute53Records（DNS レコード）

`NagiyuSharedRoute53` のホストゾーンを SSM 経由で参照し、以下のレコードを管理しています。

| 種別 | 件数 | 内容 |
|---|---|---|
| CloudFront 向け CNAME | 17 | サブドメイン → `xxx.cloudfront.net`（apex を除く） |
| Apex ALIAS (A) | 1 | `nagiyu.com` → CloudFront ディストリビューション |
| Google Search Console 検証 CNAME | 1 | ドメイン所有権確認用 |
| ACM DNS 検証 CNAME | 1 | ワイルドカード証明書 (`*.nagiyu.com`) の自動更新用 |

**TTL**: 全レコード 300 秒で統一。

### IAM 権限

CDK デプロイ時の Route53 操作権限は **共有 IAM Application Policy** に含まれています。新規にこの方針から外れる権限が必要になった場合のみ、当該ポリシーへの追記が必要です。

---

## レコードの追加・変更

新サービス追加などで新しいサブドメインを使う場合の流れ:

1. 各サービスの CloudFront スタックを先にデプロイし、ディストリビューションのドメイン名（`xxx.cloudfront.net`）を取得
2. `NagiyuSharedRoute53Records` スタックの定義に新しい CNAME を追加して PR を作成
3. レビュー・マージで dev 環境にデプロイ → `dig` で応答確認 → 問題なければ prod にも展開

> **将来**: 各サービスの CloudFront スタックが ALIAS レコードを自動生成する形に移行する予定（[#2919](https://github.com/nagiyu/nagiyu-platform/issues/2919)）。完了後は本ステップでの手動レコード追加は不要になります。

---

## 検証

### ホストゾーンの状態確認

```bash
# hosted zone ID 取得
aws route53 list-hosted-zones-by-name --dns-name nagiyu.com \
  --query 'HostedZones[0].Id' --output text

# 全レコード一覧
HZ_ID=$(aws route53 list-hosted-zones-by-name --dns-name nagiyu.com \
  --query 'HostedZones[0].Id' --output text)
aws route53 list-resource-record-sets --hosted-zone-id $HZ_ID \
  --query 'ResourceRecordSets[].[Name,Type]' --output table
```

### 名前解決の確認

```bash
# 任意のレコード
dig tools.nagiyu.com CNAME +short
dig nagiyu.com A +short  # ALIAS なので IP が返る

# Route53 を直接指定して確認（伝播前の検証）
NS=$(aws route53 get-hosted-zone --id $HZ_ID \
  --query 'DelegationSet.NameServers[0]' --output text)
dig @$NS tools.nagiyu.com CNAME +short
```

---

## コスト

- **ホストゾーン**: $0.50 / 月
- **クエリ**: $0.40 / 100 万件（標準クエリ）
- **ALIAS クエリ**: AWS リソース宛は無料
- **本プラットフォーム規模**: 月 $0.60 程度（≒ 90 円）

---

## 移行履歴

2026-05 に外部 DNS（XServer）から Route53 へ全面移行しました。

- 関連 Issue: [#2902](https://github.com/nagiyu/nagiyu-platform/issues/2902)
- 移行のきっかけ: 新サービス追加のたびに外部 DNS 管理画面で CNAME を手動追加する運用を撲滅したかった
- 移行後に得られたメリット:
    - 新サービス追加が CDK のみで完結
    - apex (`nagiyu.com`) を ALIAS で CloudFront に直接向けられるように
    - DNS レコードの履歴が Git で管理可能に
- ドメインレジストラ自体（XServer の契約）は移管せず、権威 DNS のみ Route53 化（NS 委任）

---

## 関連ドキュメント

- [ACM 詳細](./acm.md) — SSL/TLS 証明書（DNS 検証で Route53 を参照）
- [CloudFront 詳細](./cloudfront.md) — CloudFront との統合
- [アーキテクチャ](../architecture.md) — インフラ全体の設計
