# ACM (AWS Certificate Manager)

本ドキュメントは、nagiyu-platform の SSL/TLS 証明書管理について説明します。

---

## 概要

nagiyu-platform では、CloudFront でカスタムドメインを使用するために ACM (AWS Certificate Manager) で SSL/TLS 証明書を管理します。

### 基本方針

- **ワイルドカード証明書**: `*.example.com` と `example.com` をカバー
- **DNS 検証**: 外部 DNS サービスで CNAME レコードを手動設定して検証
- **共通証明書**: dev/prod 環境で同じ証明書を使用（サブドメインで環境を分ける）
- **リージョン**: `us-east-1` (CloudFront 用の証明書は us-east-1 必須)

---

## ドメイン戦略

### 外部 DNS サービスでのドメイン管理

本プラットフォームでは、ドメインは外部のレンタルサーバーで取得・管理します。

- ドメイン取得: 外部レンタルサーバー
- DNS 管理: 外部 DNS サービス
- AWS Route 53 は使用しない

### ドメイン構成例

| 環境 | ドメイン例 | 用途 |
|-----|----------|------|
| prod | `example.com` | 本番環境トップページ |
| prod | `www.example.com` | 本番環境 Web アプリ |
| prod | `api.example.com` | 本番環境 API |
| dev | `dev.example.com` | 開発環境トップページ |
| dev | `dev-api.example.com` | 開発環境 API |

すべて `*.example.com` でカバーできるため、1つのワイルドカード証明書で対応可能。

---

## ACM 証明書の構成

### 証明書スコープ

ACM 証明書には以下のドメインを含めます:

- **プライマリドメイン**: `example.com`
- **追加ドメイン (SANs)**: `*.example.com`

これにより、以下のすべてがカバーされます:
- `example.com`
- `www.example.com`
- `api.example.com`
- `dev.example.com`
- `dev-api.example.com`
- その他任意のサブドメイン

### 検証方法

**DNS 検証**を使用します。

**メリット:**
- 証明書の自動更新に対応
- 一度検証レコードを設定すれば、証明書は自動的に更新される

**デメリット:**
- 初回セットアップ時に外部 DNS サービスで CNAME レコードを手動設定する必要がある

---

## リソース詳細

### CloudFormation スタック

**スタック名:** `nagiyu-shared-acm-certificate`

**配置場所:** `infra/shared/acm/certificate.yaml`

**パラメータ:**
- `DomainName`: プライマリドメイン名 (例: `example.com`)
    - GitHub Actions の Secret から取得: `DOMAIN_NAME`

**出力値 (Outputs):**
- `CertificateArn`: ACM 証明書の ARN
    - Export 名: `nagiyu-shared-acm-certificate-arn`
    - CloudFront スタックから参照

**タグ:**
- `Application: nagiyu`
- `Purpose: SSL/TLS certificate for CloudFront`

---

## デプロイ手順

### 前提条件

- ドメインが外部レンタルサーバーで取得済みであること
- 外部 DNS サービスにアクセスできること
- GitHub Secrets に `DOMAIN_NAME` が設定されていること

### ステップ1: GitHub Secrets の設定

GitHub リポジトリの Settings → Secrets and variables → Actions で以下を登録:

- `DOMAIN_NAME`: 取得したドメイン名 (例: `example.com`)

### ステップ2: ACM 証明書スタックのデプロイ

```bash
cd infra/shared/acm

aws cloudformation deploy \
  --template-file certificate.yaml \
  --stack-name nagiyu-shared-acm-certificate \
  --parameter-overrides DomainName=example.com \
  --region us-east-1
```

**注意:** CloudFront で使用する証明書は必ず `us-east-1` リージョンで作成してください。

### ステップ3: DNS 検証レコードの取得

スタックのデプロイ後、DNS 検証用の CNAME レコード情報を取得します。

```bash
aws acm describe-certificate \
  --certificate-arn $(aws cloudformation describe-stacks \
    --stack-name nagiyu-shared-acm-certificate \
    --query "Stacks[0].Outputs[?OutputKey=='CertificateArn'].OutputValue" \
    --output text \
    --region us-east-1) \
  --query "Certificate.DomainValidationOptions[*].[ResourceRecord.Name,ResourceRecord.Value]" \
  --output table \
  --region us-east-1
```

出力例:
```
-----------------------------------------------------------------
|                      DescribeCertificate                       |
+---------------------------------------+------------------------+
|  _abc123.example.com                  |  _xyz789.acm-validations.aws. |
|  _abc123.example.com                  |  _xyz789.acm-validations.aws. |
+---------------------------------------+------------------------+
```

**注意:** `example.com` と `*.example.com` の検証レコードは同じ値になります。

### ステップ4: 外部 DNS サービスでの CNAME レコード設定

外部 DNS サービスの管理画面で、以下の CNAME レコードを追加します。

| タイプ | 名前 | 値 |
|-------|------|-----|
| CNAME | `_abc123.example.com` | `_xyz789.acm-validations.aws.` |

**重要:**
- レコード名とレコード値は、ステップ3で取得した実際の値を使用してください
- TTL は短め (300秒程度) を推奨
- 検証が完了するまで、このレコードは削除しないでください

### ステップ5: 証明書の検証完了を待機

DNS レコードが伝播し、ACM が検証を完了するまで待ちます（通常5〜30分）。

```bash
aws acm wait certificate-validated \
  --certificate-arn $(aws cloudformation describe-stacks \
    --stack-name nagiyu-shared-acm-certificate \
    --query "Stacks[0].Outputs[?OutputKey=='CertificateArn'].OutputValue" \
    --output text \
    --region us-east-1) \
  --region us-east-1
```

検証完了を手動で確認:

```bash
aws acm describe-certificate \
  --certificate-arn $(aws cloudformation describe-stacks \
    --stack-name nagiyu-shared-acm-certificate \
    --query "Stacks[0].Outputs[?OutputKey=='CertificateArn'].OutputValue" \
    --output text \
    --region us-east-1) \
  --query "Certificate.Status" \
  --output text \
  --region us-east-1
```

`ISSUED` と表示されれば検証完了です。

---

## GitHub Actions による自動デプロイ

### ワークフロー例

`.github/workflows/deploy-acm.yml`:

```yaml
name: Deploy ACM Certificate

on:
  push:
    branches:
      - develop
    paths:
      - 'infra/shared/acm/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Deploy ACM Certificate stack
        run: |
          aws cloudformation deploy \
            --template-file infra/shared/acm/certificate.yaml \
            --stack-name nagiyu-shared-acm-certificate \
            --parameter-overrides DomainName=${{ secrets.DOMAIN_NAME }} \
            --region us-east-1
```

**注意:** 初回デプロイ後は、DNS 検証レコードを手動で設定する必要があります。

---

## 運用

### 証明書の自動更新

ACM で管理される証明書は、有効期限前に自動的に更新されます。

- DNS 検証レコードが設定されている限り、更新は自動で行われます
- 手動での更新操作は不要です
- 証明書の有効期限: 13ヶ月（約395日）
- 自動更新タイミング: 有効期限の60日前から

### 証明書の状態確認

```bash
aws acm describe-certificate \
  --certificate-arn $(aws cloudformation describe-stacks \
    --stack-name nagiyu-shared-acm-certificate \
    --query "Stacks[0].Outputs[?OutputKey=='CertificateArn'].OutputValue" \
    --output text \
    --region us-east-1) \
  --query "Certificate.[DomainName,Status,NotAfter]" \
  --output table \
  --region us-east-1
```

### ドメインの追加・変更

証明書に新しいドメインを追加する場合:

1. CloudFormation テンプレートを編集（SANs に追加）
2. スタックを更新
3. 新しいドメインの DNS 検証レコードを外部 DNS サービスに追加

---

## トラブルシューティング

### 証明書の検証が完了しない

**原因:**
- DNS レコードが正しく設定されていない
- DNS の伝播に時間がかかっている

**確認方法:**

DNS レコードが正しく設定されているか確認:

```bash
dig _abc123.example.com CNAME
```

**解決策:**
1. 外部 DNS サービスでレコードが正しく設定されているか確認
2. TTL が短い場合、伝播まで待つ（最大48時間、通常は数分〜30分）
3. DNS キャッシュをクリア

### 証明書のステータスが FAILED になった

**原因:**
- DNS 検証が72時間以内に完了しなかった

**解決策:**
1. スタックを削除
2. DNS レコードを事前に確認
3. スタックを再作成

### CloudFront で証明書が表示されない

**原因:**
- 証明書が `us-east-1` 以外のリージョンで作成されている

**解決策:**
- 証明書は必ず `us-east-1` リージョンで作成してください
- 既存の証明書を削除し、`us-east-1` で再作成

---

## セキュリティ

### ドメイン情報の管理

- `DOMAIN_NAME` は GitHub Secrets で管理
- 本番環境のドメイン名は公開情報のため、Secret として必須ではないが、一元管理のため Secret として保存

### 証明書の秘密鍵

- ACM が秘密鍵を安全に管理
- 秘密鍵のエクスポートは不可（ACM の仕様）
- CloudFront や ALB などの AWS サービスでのみ使用可能

### DNS 検証レコードの保護

- DNS 検証用の CNAME レコードは削除しないこと
- 削除すると証明書の自動更新ができなくなる

---

## コスト

ACM 証明書自体は**無料**です。

- CloudFront や ALB で使用する ACM 証明書に料金は発生しません
- EC2 にアタッチする場合も無料です

---

## 関連ドキュメント

- [CloudFront 詳細](./cloudfront.md) - CloudFront との統合方法
- [アーキテクチャ](../architecture.md) - インフラ全体の設計
- [初回セットアップ](../setup.md) - ACM 証明書の初期構築手順
- [デプロイ手順](../deploy.md) - 日常的なデプロイ操作