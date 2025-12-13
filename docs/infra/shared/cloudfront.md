# CloudFront

本ドキュメントは、nagiyu-platform における CloudFront の設計と運用について説明します。

---

## 概要

nagiyu-platform では、Web アプリケーションを全世界に配信するために CloudFront を使用します。

### 基本方針

- **カスタムドメイン**: 外部 DNS サービスで管理するドメインを CloudFront に設定
- **SSL/TLS**: ACM で管理する証明書を使用
- **オリジン**: S3、API Gateway、ALB、Lambda Function URL など
- **キャッシュ戦略**: コンテンツの種類に応じて適切なキャッシュ設定

---

## アーキテクチャ

### 全体構成

```
ユーザー
  ↓ (HTTPS)
外部 DNS サービス
  ↓ (CNAME: example.com → d123456.cloudfront.net)
CloudFront Distribution
  ↓ (オリジン)
AWS リソース
  ├── S3 (静的コンテンツ: HTML, CSS, JS, 画像)
  ├── API Gateway (REST API / HTTP API)
  ├── ALB → ECS (Web アプリケーション)
  └── Lambda Function URL (サーバーレス関数)
```

### データフロー

1. **ユーザーリクエスト**: `https://example.com` にアクセス
2. **DNS 解決**: 外部 DNS サービスが CloudFront のドメインを返す
3. **CloudFront**: エッジロケーションでリクエストを受信
4. **キャッシュチェック**: キャッシュがあれば即座にレスポンス
5. **オリジンアクセス**: キャッシュがない場合、オリジンにリクエスト
6. **レスポンス**: CloudFront がレスポンスをキャッシュしてユーザーに返す

---

## CloudFront Distribution の構成

### ドメイン設定

**カスタムドメイン (CNAMEs):**
- 環境ごとにサブドメインを使用
- 例: `example.com`, `www.example.com`, `dev.example.com`

**SSL 証明書:**
- ACM で管理する証明書を使用
- Export 値: `nagiyu-shared-acm-certificate-arn`

### オリジン設定

CloudFront は複数のオリジンをサポートします。パスパターンに応じて異なるオリジンにルーティング可能。

#### オリジン例

| オリジン名 | タイプ | 用途 | パスパターン |
|----------|------|------|------------|
| `s3-static` | S3 | 静的ファイル (HTML, CSS, JS, 画像) | `/assets/*`, `/images/*` |
| `api-gateway` | API Gateway | REST API | `/api/*` |
| `alb-webapp` | ALB | Web アプリケーション (ECS) | `/app/*` |
| `lambda-function` | Lambda Function URL | サーバーレス関数 | `/function/*` |

### キャッシュ戦略

#### 静的コンテンツ (S3)

- **キャッシュポリシー**: `CachingOptimized` (AWS マネージド)
- **TTL**: 長め (1日〜1週間)
- **圧縮**: 有効 (Gzip, Brotli)
- **クエリ文字列**: 無視
- **ヘッダー**: 無視

#### API (API Gateway / ALB)

- **キャッシュポリシー**: `CachingDisabled` または カスタム
- **TTL**: 短め (0秒〜数分)
- **クエリ文字列**: すべて転送
- **ヘッダー**: 必要なヘッダーのみ転送 (Authorization, Content-Type など)
- **Cookie**: 必要に応じて転送

#### 動的コンテンツ (Lambda Function URL)

- **キャッシュポリシー**: `CachingDisabled`
- **クエリ文字列**: すべて転送
- **ヘッダー**: すべて転送
- **Cookie**: すべて転送

---

## 外部 DNS サービスとの連携

### DNS レコード設定

外部 DNS サービスの管理画面で、以下の CNAME レコードを設定します。

| タイプ | 名前 | 値 | TTL |
|-------|------|-----|-----|
| CNAME | `example.com` または `www` | `d123456.cloudfront.net` | 300 |
| CNAME | `dev` | `d789012.cloudfront.net` | 300 |

**注意:**
- `d123456.cloudfront.net` は CloudFront Distribution のドメイン名（スタック出力から取得）
- Apex ドメイン (`example.com`) に CNAME を設定できない DNS サービスの場合、`www.example.com` を使用するか、ALIAS レコード相当の機能を使用

### Apex ドメインの扱い

**問題:**
- 一部の DNS サービスでは、Apex ドメイン (`example.com`) に CNAME レコードを設定できない

**解決策:**

1. **ALIAS 相当の機能を使用** (推奨)
    - 一部の外部 DNS サービスは ALIAS や ANAME レコードをサポート
    - CloudFront のドメインを直接指定

2. **www へリダイレクト**
    - `example.com` を A レコードで固定 IP に向ける
    - その IP で `www.example.com` へリダイレクト

3. **www を正規ドメインとして使用**
    - `www.example.com` を CloudFront に向ける
    - `example.com` は使用しない、または別用途に使用

---

## セキュリティ

### HTTPS の強制

- **Viewer Protocol Policy**: `Redirect HTTP to HTTPS`
- すべてのリクエストを HTTPS にリダイレクト

### Origin Protocol Policy

- **S3**: `HTTPS Only`
- **API Gateway**: `HTTPS Only`
- **ALB**: `HTTPS Only` (ALB に証明書を設定)
- **Lambda Function URL**: `HTTPS Only`

### WAF (Web Application Firewall)

将来的に必要に応じて WAF を有効化:
- SQL インジェクション対策
- XSS 対策
- レート制限
- IP ホワイトリスト / ブラックリスト

### セキュリティヘッダー

CloudFront Functions または Lambda@Edge でセキュリティヘッダーを追加:
- `Strict-Transport-Security`
- `X-Content-Type-Options`
- `X-Frame-Options`
- `X-XSS-Protection`
- `Content-Security-Policy`

---

## パフォーマンス最適化

### キャッシュヒット率の向上

- 適切なキャッシュポリシーの設定
- キャッシュキーの最適化（不要なクエリ文字列やヘッダーを除外）
- Origin Shield の活用（オプション）

### 圧縮

- Gzip および Brotli 圧縮を有効化
- テキストベースのファイル (HTML, CSS, JS, JSON) を圧縮

### HTTP/2 および HTTP/3

- CloudFront は自動的に HTTP/2 をサポート
- HTTP/3 (QUIC) も有効化可能

---

## モニタリング

### CloudWatch メトリクス

CloudFront が提供する標準メトリクス:
- **Requests**: リクエスト数
- **BytesDownloaded**: ダウンロードバイト数
- **4xxErrorRate**: 4xx エラー率
- **5xxErrorRate**: 5xx エラー率
- **CacheHitRate**: キャッシュヒット率

### アラーム設定例

```yaml
# 4xx エラー率が 10% を超えたらアラート
4xxErrorRateAlarm:
  Type: AWS::CloudWatch::Alarm
  Properties:
    MetricName: 4xxErrorRate
    Namespace: AWS/CloudFront
    Statistic: Average
    Period: 300
    EvaluationPeriods: 2
    Threshold: 10
    ComparisonOperator: GreaterThanThreshold
```

### ログ

#### Standard Logging

- S3 にアクセスログを保存
- ログ形式: テキスト (TSV)
- コスト: S3 ストレージ料金のみ

#### Real-time Logs

- Kinesis Data Streams にリアルタイムでログを送信
- ログ形式: JSON
- コスト: Kinesis 料金 + CloudFront Real-time Logs 料金

---

## コスト

### CloudFront の料金体系

- **データ転送 (アウト)**: リージョンとボリュームに応じた従量課金
- **リクエスト数**: HTTP/HTTPS リクエスト数に応じた従量課金
- **無料利用枠**: 月間 1TB のデータ転送と 10M の HTTP/HTTPS リクエスト（12ヶ月間）

### コスト最適化

- キャッシュヒット率を向上させてオリジンへのリクエストを削減
- 適切な TTL 設定
- 不要なデータ転送を削減（画像の最適化、圧縮など）

---

## デプロイ

### スタック名

環境ごとに CloudFront Distribution を分けることを推奨:
- `nagiyu-dev-cloudfront-app-A`
- `nagiyu-prod-cloudfront-app-A`

### デプロイ順序

1. **共通リソース**: VPC, IAM, ACM
2. **オリジンリソース**: S3, API Gateway, ALB, Lambda
3. **CloudFront Distribution**: オリジンを参照して作成

### 出力値 (Outputs)

CloudFront スタックから以下の値をエクスポート:

| Export 名 | 説明 |
|----------|------|
| `nagiyu-{env}-cloudfront-app-A-domain` | CloudFront のドメイン名 (例: `d123456.cloudfront.net`) |
| `nagiyu-{env}-cloudfront-app-A-id` | CloudFront Distribution ID |

---

## 運用

### キャッシュの無効化

デプロイ後にキャッシュをクリアする場合:

```bash
aws cloudfront create-invalidation \
  --distribution-id <Distribution ID> \
  --paths "/*"
```

**注意:**
- 無効化は最大 3000 パスまで無料
- それ以上は従量課金 ($0.005 per path)
- 頻繁な無効化はコストがかかるため、バージョニングの使用を検討

### バージョニング戦略

キャッシュ無効化の代わりにバージョニングを使用:

```
# URL にバージョンやハッシュを含める
/assets/app.js?v=1.2.3
/assets/app.abc123.js
```

これにより、無効化なしで新しいコンテンツを配信可能。

---

## トラブルシューティング

### CloudFront で 403 エラーが発生する

**原因:**
- S3 バケットポリシーが正しく設定されていない
- OAI (Origin Access Identity) または OAC (Origin Access Control) の設定ミス

**解決策:**
- S3 バケットポリシーで CloudFront からのアクセスを許可
- OAC を使用する場合、正しく設定されているか確認

### CloudFront で 504 エラーが発生する

**原因:**
- オリジンのタイムアウト
- オリジンが応答していない

**解決策:**
- オリジンのタイムアウト設定を確認
- オリジンのヘルスチェック
- CloudWatch Logs でオリジンのエラーを確認

### カスタムドメインでアクセスできない

**原因:**
- DNS レコードが正しく設定されていない
- ACM 証明書が CloudFront Distribution に設定されていない

**解決策:**
- 外部 DNS サービスで CNAME レコードを確認
- ACM 証明書のステータスを確認 (ISSUED である必要がある)
- CloudFront Distribution の Alternate Domain Names (CNAMEs) を確認

### キャッシュが効いていない

**原因:**
- キャッシュポリシーが正しく設定されていない
- オリジンが `Cache-Control: no-cache` ヘッダーを返している

**解決策:**
- CloudFront のキャッシュポリシーを確認
- オリジンの `Cache-Control` ヘッダーを確認
- CloudWatch メトリクスで `CacheHitRate` を確認

---

## 関連ドキュメント

- [ACM 詳細](./acm.md) - SSL/TLS 証明書の管理
- [アーキテクチャ](../architecture.md) - インフラ全体の設計
- [デプロイ手順](../deploy.md) - 日常的なデプロイ操作