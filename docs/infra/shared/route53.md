# Route53

本ドキュメントは、nagiyu-platform における Route53（権威 DNS）の設計と運用について説明します。

---

## 概要

`nagiyu.com` の権威 DNS を AWS Route53 で管理しています。ドメインの取得・更新は引き続き外部レンタルサーバー（XServer）で行いますが、DNS の応答（権威）は Route53 が担当します。

### 基本方針

- **権威 DNS**: Route53 のパブリックホストゾーン
- **ドメインレジストラ**: 外部（XServer）に残す
- **アカウント分離**: prod ゾーン（`nagiyu.com`）は prod アカウント、dev ゾーン（`dev.nagiyu.com`）は dev アカウントが持つ。prod ゾーンから dev ゾーンへ **NS 委任**する（[アカウント分離との関係](#アカウント分離との関係) を参照）
- **レコード管理**: すべて CDK で管理（手動操作なし）
- **TTL**: 全レコード 300 秒

### Route53 を選んだ理由

- **CDK のみで完結**: 新サービス追加時に外部 DNS の管理画面を触る必要がない
- **apex の ALIAS**: `nagiyu.com` を CloudFront に直接向けられる（XServer 時代は CNAME で代替していた）
- **インフラの Git 管理**: DNS レコードもコードとしてレビュー可能
- **将来の拡張**: ヘルスチェック・フェイルオーバー等の高度機能が利用可能

---

## アカウント分離との関係

dev アカウントは prod アカウントから完全に独立させる方針（[AWS アカウント構成](../aws-accounts.md) を参照）だが、DNS の委任構造上、ドメイン全体の権威は 1 つのレジストラ配下の 1 つのルートゾーンに紐づく。この制約の中でアカウント分離を保つため、**NS 委任でゾーンごとアカウントを分ける**方式を採る。

- **prod アカウント**: `nagiyu.com` のホストゾーンを持つ。ここには `dev.nagiyu.com` への NS 委任レコードが 1 件あるだけで、dev 配下の個別レコードは持たない。
- **dev アカウント**: `dev.nagiyu.com` のホストゾーンを自前で持つ。dev の各サービスのレコードも、`*.dev.nagiyu.com` + `dev.nagiyu.com` の ACM ワイルドカード証明書の DNS 検証も、すべて dev アカウント内のこのゾーンだけで完結する。

この方式を選んだ理由:

- **prod への依存を作らない**: NS 委任さえ 1 回設定すれば、以後 dev 側でサービスを追加・変更しても prod 側のゾーンには一切手を入れない。dev の ACM 証明書更新・DNS 検証も dev アカウント単独で完結し、prod の認証情報や XServer の操作を必要としない。
- **`resolveAccountScope` との対応**: 共有インフラ（`infra/shared`）はデプロイ先アカウントでスタック構成を切り替える（詳細は [共有インフラ README](./README.md) を参照）。ホストゾーン作成もこの切り替えの一部で、dev アカウントへのデプロイ時は `dev.nagiyu.com` を、prod アカウントへのデプロイ時は `nagiyu.com` を対象にホストゾーンを作る。

---

## ドメイン構成

### Hosted Zone

| ドメイン         | ホストゾーンの所在                          |
| ---------------- | ------------------------------------------- |
| `nagiyu.com`     | prod アカウント                             |
| `dev.nagiyu.com` | dev アカウント（`nagiyu.com` から NS 委任） |

### サブドメイン命名規則

| 環境          | パターン                   | 例                                            |
| ------------- | -------------------------- | --------------------------------------------- |
| prod          | `{service}.nagiyu.com`     | `tools.nagiyu.com`, `auth.nagiyu.com`         |
| dev           | `{service}.dev.nagiyu.com` | `tools.dev.nagiyu.com`, `auth.dev.nagiyu.com` |
| ルート (prod) | `nagiyu.com` (apex)        | `nagiyu.com`                                  |
| ルート (dev)  | `dev.nagiyu.com`           | `dev.nagiyu.com`                              |

- dev のゾーン自体が `dev.nagiyu.com` であるため、dev 側のサービスは prod と同じ相対名（例: `tools`）でレコードを作ればよく、`dev-` プレフィックスは不要になった。旧形式 `dev-{service}.nagiyu.com` は廃止している。
- 例外的にサービス側の事情でサブドメイン名自体が prod と異なるものがある（例: livetalk は `live-talk.dev.nagiyu.com`、Storybook は dev 専用で `storybook.dev.nagiyu.com`）。実際のホスト名は各サービスの CDK コードを参照すること。
- apex (`nagiyu.com` / `dev.nagiyu.com`) は Route53 の制約により CNAME を貼れないため、CloudFront への ALIAS（A レコード）として登録します。

---

## CDK スタック構成

Route53 関連は共有インフラ（`infra/shared`）配下のスタックで構成しています。デプロイ先アカウント（prod / dev）によって作成されるスタックの組み合わせが変わる。

### NagiyuSharedRoute53（hosted zone 本体）

- prod / dev の両アカウントにデプロイされ、それぞれ `nagiyu.com` / `dev.nagiyu.com` のパブリックホストゾーンを作成する
- ホストゾーン ID と名前を SSM Parameter Store に保存（同一アカウント内の他スタックから参照する用途）
  - `/nagiyu/shared/route53/hosted-zone-id`
  - `/nagiyu/shared/route53/hosted-zone-name`
- 払い出された 4 つのネームサーバを CfnOutput に公開する。prod 用は XServer のネームサーバ設定に登録する用途、dev 用は prod 側の NS 委任レコードに設定する用途

### NagiyuSharedRoute53Records（DNS レコード・prod アカウントのみ）

`NagiyuSharedRoute53` のホストゾーンを SSM 経由で参照し、prod 向けの CNAME・apex ALIAS・検証用レコードに加え、`dev.nagiyu.com` を dev アカウントへ委任する NS レコードを管理する。dev アカウント側のレコードは持たない（dev アカウント側は自身のゾーン内で完結させるため、対応するスタックは存在しない）。

| 種別                             | 内容                                                               |
| -------------------------------- | ------------------------------------------------------------------ |
| CloudFront 向け CNAME            | サブドメイン → `xxx.cloudfront.net`（apex を除く）                 |
| Apex ALIAS (A)                   | `nagiyu.com` → CloudFront ディストリビューション                   |
| NS（dev 委任）                   | `dev.nagiyu.com` → dev アカウントのホストゾーンのネームサーバ 4 件 |
| Google Search Console 検証 CNAME | ドメイン所有権確認用                                               |
| ACM DNS 検証 CNAME               | ワイルドカード証明書 (`*.nagiyu.com`) の自動更新用                 |

このスタックが持つ CNAME 一覧には、移行過渡期の名残として旧形式（`dev-tools` 等）の記載が残っている場合がある。これは prod アカウントに残存する旧 dev 資材（[#3820](https://github.com/nagiyu/nagiyu-platform/issues/3820) で整理予定）に対応するものであり、新形式の dev URL とは無関係。

**TTL**: 全レコード 300 秒で統一。

### IAM 権限

CDK デプロイ時の Route53 操作権限は **共有 IAM Application Policy** に含まれています。新規にこの方針から外れる権限が必要になった場合のみ、当該ポリシーへの追記が必要です。

---

## レコードの追加・変更

新サービス追加などで新しいサブドメインを使う場合の流れ:

1. 各サービスの CloudFront スタックを先にデプロイし、ディストリビューションのドメイン名（`xxx.cloudfront.net`）を取得
2. prod: `NagiyuSharedRoute53Records` スタックの定義に新しい CNAME を追加して PR を作成し、レビュー・マージで反映する
3. dev: 各サービスの CloudFront スタックが、dev アカウントのホストゾーンを SSM 経由で参照して自身の ALIAS レコードを作成する（prod 側の共有スタックへの追記は不要）
4. `dig` で応答確認

> **将来**: prod 側も各サービスの CloudFront スタックが ALIAS レコードを自動生成する形に移行する予定（[#2919](https://github.com/nagiyu/nagiyu-platform/issues/2919)）。完了後は `NagiyuSharedRoute53Records` での手動レコード追加は不要になります。

---

## 検証

### ホストゾーンの状態確認

```bash
# prod ゾーン
aws route53 list-hosted-zones-by-name --dns-name nagiyu.com \
  --query 'HostedZones[0].Id' --output text

# dev ゾーン（dev アカウントの認証情報で実行）
aws route53 list-hosted-zones-by-name --dns-name dev.nagiyu.com \
  --query 'HostedZones[0].Id' --output text
```

### 名前解決の確認

```bash
# prod
dig tools.nagiyu.com CNAME +short

# dev（NS 委任が正しく効いていれば、通常の再帰リゾルバでそのまま解決できる）
dig tools.dev.nagiyu.com CNAME +short
```

---

## コスト

- **ホストゾーン**: $0.50 / 月 × 2 アカウント分
- **クエリ**: $0.40 / 100 万件（標準クエリ）
- **ALIAS クエリ**: AWS リソース宛は無料

---

## 移行履歴

- **2026-05**: 外部 DNS（XServer）から Route53 へ全面移行（関連 Issue: [#2902](https://github.com/nagiyu/nagiyu-platform/issues/2902)）。新サービス追加が CDK のみで完結するようになり、apex (`nagiyu.com`) も ALIAS で CloudFront に直接向けられるようになった。ドメインレジストラ自体（XServer の契約）は移管せず、権威 DNS のみ Route53 化（NS 委任）。
- **2026-09**: dev アカウントの切り出し（[#3819](https://github.com/nagiyu/nagiyu-platform/issues/3819)）に伴い、`dev.nagiyu.com` を dev アカウントのホストゾーンへ NS 委任する構成へ移行。dev アカウントが自分のゾーンで ACM の DNS 検証や ALIAS レコードを完結でき、XServer や prod アカウントを一切触らずに dev のドメイン運用が完結するようになった。

---

## 関連ドキュメント

- [AWS アカウント構成とアクセス管理](../aws-accounts.md) — アカウント分離の全体方針
- [ACM 詳細](./acm.md) — SSL/TLS 証明書（DNS 検証で Route53 を参照）
- [CloudFront 詳細](./cloudfront.md) — CloudFront との統合
- [アーキテクチャ](../architecture.md) — インフラ全体の設計
