<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な内容を以下に統合し、本ディレクトリを削除します。
    - docs/infra/shared/route53.md（新規作成 / Phase 6 で対応）
    - docs/infra/shared/acm.md（DNS 検証手順を Route53 自動化に更新）
    - docs/infra/shared/cloudfront.md（カスタムドメイン紐付けを ALIAS に更新）
    - docs/infra/architecture.md（DNS レイヤを Route53 に更新）
    - docs/infra/setup.md / docs/infra/deploy.md（必要に応じて更新）

    関連 Issue: #2902
-->

# Route53 全面移行 - 計画書

## 1. 目的

`nagiyu.com` の権威 DNS を XServer から AWS Route53 に全面移行し、新サービス追加・既存サービスのドメイン変更が **CDK のみで完結する状態**にする。

- ドメインレジストラ（XServer 側のドメイン契約）は移管しない
- Route53 はあくまで権威 DNS としてのみ使用する
- 既存の運用（ワイルドカード ACM 証明書、CloudFront カスタムドメイン）は維持する

## 2. 現状

### ドメイン・DNS 構成

| 項目 | 現状 |
|---|---|
| ドメインレジストラ | XServer (`nagiyu.com`) |
| 権威 DNS | XServer |
| ワイルドカード証明書 | `*.nagiyu.com` + `nagiyu.com`（ACM, us-east-1, DNS 検証） |
| ACM 検証 | XServer 管理画面で手動 CNAME 追加 |
| サブドメイン → CloudFront | XServer 管理画面で手動 CNAME 追加 |

### サービス一覧（DNS 移行対象）

| サービス | prod ドメイン | dev ドメイン |
|---|---|---|
| root | `nagiyu.com` | `dev.nagiyu.com` |
| tools | `tools.nagiyu.com` | `dev-tools.nagiyu.com` |
| auth | `auth.nagiyu.com` | `dev-auth.nagiyu.com` |
| admin | `admin.nagiyu.com` | `dev-admin.nagiyu.com` |
| quick-clip | `quick-clip.nagiyu.com` | `dev-quick-clip.nagiyu.com` |
| stock-tracker | `stock-tracker.nagiyu.com` | `dev-stock-tracker.nagiyu.com` |
| share-together | `share-together.nagiyu.com` | `dev-share-together.nagiyu.com` |
| niconico-mylist-assistant | `niconico-mylist-assistant.nagiyu.com` | `dev-niconico-mylist-assistant.nagiyu.com` |
| codec-converter | `codec-converter.nagiyu.com` | `dev-codec-converter.nagiyu.com` |

合計: 9 サービス × 2 環境 = 18 サブドメイン + apex / dev apex。

### 関連実装

- `infra/shared/lib/acm-stack.ts` — ACM 証明書（DNS 検証は現在 `fromDns()` で外部 DNS 委ね）
- `infra/common/src/stacks/cloudfront-stack-base.ts` — 各サービス CloudFront の共通スタック
- `infra/root/` 配下 — apex (`nagiyu.com`) 用 CloudFront
- `infra/shared/libs/utils/ssm.ts` — SSM パラメータ名定義（`ACM_CERTIFICATE_ARN` 等）

## 3. 移行後アーキテクチャ

```
[利用者]
   ↓
[Route53 ホストゾーン nagiyu.com]
   ├─ NS / SOA（Route53 管理）
   ├─ A (ALIAS) tools.nagiyu.com → CloudFront
   ├─ A (ALIAS) dev-tools.nagiyu.com → CloudFront
   ├─ A (ALIAS) nagiyu.com → CloudFront（apex を ALIAS で直接）
   ├─ ... 他サービス分
   ├─ MX / TXT / DKIM 等のメール系レコード（XServer から複製）
   └─ ACM 検証用 CNAME（自動生成）
   ↓
[CloudFront]
   ↓
[Lambda Function URL]
```

### CDK 上の構成方針

- **新規スタック**: `infra/shared/lib/route53-stack.ts` を追加し、`HostedZone` を 1 つ作成
- **既存 ACM スタック**: 検証方式を `CertificateValidation.fromDns(hostedZone)` に置換
- **共通 CloudFront スタック**: `aws-route53-targets` の `CloudFrontTarget` を使った `ARecord` を追加
- **SSM 参照**: ホストゾーン ID を SSM Parameter (`/nagiyu/shared/route53/hosted-zone-id`) に保存し、各サービススタックから参照

## 4. フェーズ計画

各フェーズは **個別の Issue / 個別の PR** として切り、`integration/2902-route53-migration` ブランチに段階的にマージしていく。

### Phase 0: 既存 XServer DNS レコードの棚卸し（人力）

**作業者**: 人力（Claude は XServer に到達不可）  
**成果物**: `tasks/route53-migration/dns-inventory.md`

XServer 管理画面で `nagiyu.com` の全 DNS レコードを抜き出し、本リポジトリに記録する。

- A / AAAA / CNAME / MX / TXT / SRV / NS（サブゾーン委任があれば）すべて
- 特に注意:
    - メール系: MX, SPF (TXT), DKIM (TXT), DMARC (TXT)
    - 既存 CloudFront 向け CNAME（18 サブドメイン分）
    - ACM 検証 CNAME（`_xxx.nagiyu.com`）
    - Google Workspace 等の所有権確認 TXT がある場合
- TTL も併記する（Phase 3 で短縮するため）

**ブロック条件**: 本フェーズの完了が Phase 2 開始の前提。

### Phase 1: Route53 ホストゾーン作成（CDK）

**作業者**: Claude  
**ブランチ**: `claude/2902-phase1-hosted-zone`  
**スタック**: `infra/shared/lib/route53-stack.ts`（新規）

- `HostedZone` リソースを 1 つ作成（`nagiyu.com`）
- ホストゾーン ID を SSM (`/nagiyu/shared/route53/hosted-zone-id`) と CfnOutput で公開
- **NS 切替はしない**。この時点ではホストゾーンは未参照状態で AWS 上に存在するだけ
- Route53 が払い出した 4 つの NS レコードを記録（Phase 4 で使用）

**検証**: CDK deploy 後、`aws route53 list-hosted-zones` でホストゾーンが存在し、`aws route53 get-hosted-zone --id <id>` で 4 つの NS が取得できること。

**リスク**: 極低（既存 DNS には影響しない）

### Phase 2: 既存レコードを Route53 に複製（CDK）

**作業者**: Claude  
**ブランチ**: `claude/2902-phase2-copy-records`  
**前提**: Phase 0 の棚卸し完了、Phase 1 のホストゾーン作成完了

- Phase 0 の棚卸し結果を CDK で `route53.RecordSet` として全て定義
    - メール系（MX / TXT 等）
    - 既存 CloudFront 向け CNAME（NS 切替後に ALIAS に置換するため、一旦 CNAME のまま複製）
    - その他カスタムレコード
- ACM 検証 CNAME は Phase 5 で自動化するためここでは複製しない（既存証明書はそのまま流用）
- TTL は **300 秒**で統一（NS 切替時の影響時間を最小化）

**検証**: `dig @<route53-ns> nagiyu.com MX +short` 等で Route53 側に正しいレコードが返ることを確認（NS 切替前でも Route53 NS を直接指定すれば確認可能）

**リスク**: 低（NS 切替前なので利用者影響なし）

### Phase 3: XServer 側 TTL 短縮（人力）

**作業者**: 人力（XServer 管理画面）  
**所要時間**: TTL 短縮後 24h 待機

- XServer の全レコードの TTL を 300 秒に短縮
- 24h 待機して、世界中のキャッシュが短い TTL を吸収するのを待つ
- これにより Phase 4 のロールバック時の影響時間を最小化できる

**リスク**: 低

### Phase 4: NS 切替（人力・最大リスクポイント）

**作業者**: 人力（XServer 管理画面 + 監視）  
**所要時間**: 切替自体は数分。世界中の伝播完了まで TTL 分（300 秒〜数十分）

- XServer のドメイン管理画面で `nagiyu.com` のネームサーバを Route53 のもの（Phase 1 で記録した 4 つ）に変更
- 切替直後から、世界中の DNS リゾルバが順次 Route53 を参照するようになる

**事前準備**:
- メンテナンス時間の確保（深夜帯推奨）
- 切戻し手順の確認（XServer NS に戻すだけ）
- 監視体制
    - 全サービスの HTTPS 疎通確認スクリプト
    - メール送受信テスト

**ロールバック条件**:
- 主要サービスの HTTPS が一定時間応答しない
- メール送受信が止まる
- いずれの場合も XServer の NS を元に戻す

**リスク**: 高（メール・サイト全停止リスク。Phase 0 の棚卸し漏れがここで顕在化する）

### Phase 5: ACM 検証を Route53 自動化に置換（CDK）

**作業者**: Claude  
**ブランチ**: `claude/2902-phase5-acm-auto-validation`  
**前提**: Phase 4 完了

- `infra/shared/lib/acm-stack.ts` を改修
    - `CertificateValidation.fromDns()` → `CertificateValidation.fromDns(hostedZone)`
    - `route53.IHostedZone` を SSM 経由で参照
- 既存証明書はそのまま流用可能（検証レコードが Route53 に自動作成されるだけ）
- 既存の手動 CNAME（XServer から複製したもの）は削除可能（証明書更新前に削除しても、ACM が自動で新しい検証 CNAME を作る）

**検証**: `aws acm describe-certificate` でステータスが `ISSUED` のままであること、証明書更新時に手動操作が不要なことを確認（更新タイミングは有効期限の 60 日前から）

**リスク**: 中（証明書の状態を直接いじるわけではないが、誤って既存証明書を再作成してしまうと一時的に CloudFront が証明書なしになる可能性 → CDK diff で慎重に確認）

### Phase 6: CloudFront 紐付けを ALIAS に置換、ドキュメント更新（CDK）

**作業者**: Claude  
**ブランチ**: `claude/2902-phase6-alias-records`  
**前提**: Phase 5 完了

- `infra/common/src/stacks/cloudfront-stack-base.ts` を改修
    - 各サービスの CloudFront ディストリビューションに対応する `ARecord (ALIAS)` を Route53 ホストゾーンに自動追加
    - ホストゾーンは SSM 経由で参照（クロススタック参照）
- `infra/root/` の apex CloudFront も同様に ALIAS で `nagiyu.com` を直接向ける（CNAME では apex に貼れない問題が解消）
- Phase 2 で複製した CNAME レコードは ALIAS に置き換えるため、CDK で削除する
- ドキュメント更新:
    - `docs/infra/shared/route53.md` を新規作成
    - `docs/infra/shared/acm.md` を Route53 自動検証ベースに更新
    - `docs/infra/shared/cloudfront.md` のカスタムドメイン手順を更新
    - `docs/infra/architecture.md` の DNS レイヤを更新
- `tasks/route53-migration/` を削除

**検証**: 全サービス（prod / dev 計 18 + apex 2）の HTTPS 疎通確認

**リスク**: 中（CDK の差分が大きくなりやすい。サービスごとに小さく PR を分ける案も検討）

## 5. 完了条件

- [ ] `nagiyu.com` の権威 DNS が Route53 に切り替わっている
- [ ] 全サービス（prod / dev 計 18 サブドメイン + apex 2）が Route53 ALIAS 経由で正常稼働している
- [ ] メール系（MX 等）が NS 切替後も正常に動作している
- [ ] ACM 証明書の DNS 検証が Route53 で自動化されている
- [ ] 新サービス追加時に XServer 管理画面を触る必要がないことが確認できている
- [ ] `docs/infra/` 配下のドキュメントが Route53 運用に更新されている
- [ ] `tasks/route53-migration/` が削除されている

## 6. リスク・ロールバック

| リスク | 対策 |
|---|---|
| Phase 4 の NS 切替でメール停止 | Phase 0 の棚卸しを徹底。Phase 3 で TTL 短縮。切戻し手順を事前にドリル |
| Phase 0 の棚卸し漏れ | XServer 管理画面のスクリーンショット + `dig` 系コマンドでクロスチェック |
| Phase 5 で証明書を誤って再作成 | `cdk diff` で `Certificate` リソースの replacement が発生しないことを確認 |
| Phase 6 で CloudFront 紐付けが切れる | 1 サービスずつ PR を分け、dev で先行検証してから prod に展開 |
| Route53 の月額コスト | $0.50/月 + クエリ課金。本件規模では誤差レベル |

## 7. コスト見積もり

- Route53 ホストゾーン: $0.50 / 月
- Route53 クエリ: $0.40 / 100 万件（本件規模では月数十万件想定 → $0.10 未満）
- 合計: **概ね $0.60 / 月（≒ 90 円）**

## 8. スコープ外

- ドメインレジストラの Route53 移管（XServer に残す）
- 別ドメイン（仮にあれば）の Route53 化
- DNSSEC の導入
- ヘルスチェック / フェイルオーバー / レイテンシベースルーティング等の高度機能

## 9. 関連 Issue / ドキュメント

- 親 Issue: #2902
- ACM 現状: [`docs/infra/shared/acm.md`](../../docs/infra/shared/acm.md)
- CloudFront 現状: [`docs/infra/shared/cloudfront.md`](../../docs/infra/shared/cloudfront.md)
- アーキテクチャ全体: [`docs/infra/architecture.md`](../../docs/infra/architecture.md)
