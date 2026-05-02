---
title: 'AWS WAF で Web アプリを守る：ルール設計と運用のコツ'
description: 'CloudFront / ALB の前段に AWS WAF を置いて Web アプリを守るための、Managed Rules・Rate-based Rules・カスタムルールの組み合わせ方を整理。誤検知を抑える運用フローも実例で紹介します。'
slug: 'aws-waf-protection'
publishedAt: '2026-04-14'
updatedAt: '2026-05-01'
author: 'なぎゆー'
tags: ['AWS', 'WAF', 'セキュリティ']
---

## はじめに

Web アプリを公開すると、SQL インジェクション・XSS・スクレイピング・brute force など多種多様な攻撃が来ます。AWS WAF を CloudFront / ALB の前段に置くと、アプリ層に到達する前にこれらをまとめて弾けます。本記事では nagiyu-platform で運用している WAF の構成方針を解説します。

## WAF の構成要素

```
WebACL（Web Access Control List）
  └── Rule（複数）
        ├── Managed Rule Group: AWS が提供する既製ルール
        ├── Rate-based Rule: IP ごとのレート制限
        └── Custom Rule: 独自条件（IP・地域・ヘッダ・正規表現）
```

WebACL は CloudFront / ALB / API Gateway などに 1 つだけ関連付けられます。Rule は **優先度（Priority）の小さい順**に評価されます。

## 推奨構成: マネージドルール 4 種 + レート制限 + カスタム

### Priority 100: AWS Managed - Common Rule Set

XSS・LFI・サイズ過剰・既知悪意あるパスなどの汎用攻撃を弾きます。最初から有効化しておきます。

```hcl
managed_rule_group_statement {
  name        = "AWSManagedRulesCommonRuleSet"
  vendor_name = "AWS"
}
```

### Priority 110: AWS Managed - Known Bad Inputs

セッションフィクセーション・既知 CVE のペイロードなどに反応します。

### Priority 120: AWS Managed - Amazon IP Reputation List

Tor 出口・既知ボットの IP を弾きます。**個人サイトの管理画面**には入れる、**広く一般公開する記事サイト**には入れない、と用途で判断します（誤検知で正規読者を弾く可能性）。

### Priority 130: AWS Managed - SQLi Rule Set

SQL インジェクションのパターンを検出します。SQL を素直に書いている API（`GET /search?q=...`）で誤検知が出やすいので、後述の Override 設定でルール単位の調整が必要になることが多いです。

### Priority 200: Rate-based Rule（重要）

同一 IP からの 5 分間 2,000 リクエスト超過を Block。スクレイピング・ログイン総当たり対策として効きます。

```hcl
rate_based_statement {
  limit              = 2000
  aggregate_key_type = "IP"
}
```

API ごとに別の閾値を持たせたい場合は、`scope_down_statement` で URL パターンを絞ります。

```hcl
rate_based_statement {
  limit              = 100
  aggregate_key_type = "IP"
  scope_down_statement {
    byte_match_statement {
      search_string         = "/api/login"
      field_to_match { uri_path {} }
      positional_constraint = "STARTS_WITH"
      text_transformation { priority = 0; type = "LOWERCASE" }
    }
  }
}
```

`/api/login` だけ「5 分で 100 回」のような厳しい制限を独立に設定できます。

### Priority 300: カスタム - 国別 Block

サービス対象が日本国内のみであれば、海外からのアクセスをブロックして運用ノイズを削減できます。

```hcl
geo_match_statement {
  country_codes = ["JP"] # 許可リスト方式の場合は NotStatement で囲う
}
```

ただし正規ユーザーの旅行先・VPN を弾く可能性があるので、サービス特性をよく考えて適用します。

## 誤検知を恐れずに済む運用フロー

新規 WAF を本番に入れるとき、いきなり Block にすると正規アクセスまで止まる事故が起きます。以下の段階運用が安全です。

1. **Count モードでデプロイ**: ルールを Count で評価。実際にはブロックせず、CloudWatch でヒット数だけ見る。
2. **誤検知ログを確認**: ブロックされた風になっているリクエストの URL・User-Agent・パラメータをサンプリング。
3. **Exclude / Override**: 自社の正規 API パターンを Exclude（特定ルールのみ除外）。
4. **Block へ昇格**: 誤検知が許容範囲に収まったら Block に切り替え。

```hcl
# Count にしておく例
override_action {
  count {}
}
```

## ログ・可視化

WAF のログは Kinesis Firehose 経由で S3 / CloudWatch Logs / OpenSearch に流せます。本番運用では最低でも S3 + Athena で検索可能にしておきます。

```sql
-- Athena で「最近 1 時間に Block された TOP 10 IP」
SELECT
  httpRequest.clientIp,
  COUNT(*) AS blocks
FROM waf_logs
WHERE action = 'BLOCK'
  AND from_unixtime(timestamp / 1000) > current_timestamp - interval '1' hour
GROUP BY httpRequest.clientIp
ORDER BY blocks DESC
LIMIT 10;
```

ピーク時の TOP 10 IP を貼り付けて、必要があれば即時 IP セットでブロックする運用が可能になります。

## 緊急時の手動 IP ブロック

特定 IP を即時遮断したいときは IP set を使います。

```hcl
resource "aws_wafv2_ip_set" "blocklist" {
  name               = "nagiyu-emergency-blocklist"
  scope              = "CLOUDFRONT"
  ip_address_version = "IPV4"
  addresses          = ["203.0.113.0/24", "198.51.100.42/32"]
}
```

これを WebACL の高優先度ルール（Priority 50 など）で参照しておけば、`addresses` を更新するだけで即時反映されます。

## コスト

- WebACL: \$5/月（東京）
- Rule: \$1/月 × ルール数
- リクエスト評価: \$0.60 / 100 万リクエスト

5 ルール構成だと固定費 \$10/月程度。100 万リクエスト/日なら追加で \$18/月。**個人サービスでも数千円で導入できる規模感**です。

## ハマりどころ

- **CloudFront の WebACL は us-east-1 リージョンに作る必要がある**: ALB 用は ALB と同じリージョン。混同しやすい。
- **POST ボディの検査はデフォルト 8 KB まで**: 大きい JSON を送る API は `body inspection size` を引き上げる必要がある（追加料金）。
- **ALB の場合、CloudFront が前段にあると `clientIp` は CloudFront の IP**: `X-Forwarded-For` を見るカスタムルールが必要。
- **ステージング環境では Block を緩くする**: スモークテストや E2E が WAF で落ちると気づきにくい。

## まとめ

AWS WAF は「マネージドルールで広く守り、レート制限でブルートフォースを止め、カスタムルールでサービス固有の要件を埋める」という三層で組むと運用しやすいです。最初は Count モードで様子を見ながら段階的に Block に昇格させることで、誤検知による事故を避けつつ防御力を上げられます。
