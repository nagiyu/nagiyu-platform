# 用語集

本ドキュメントは、Toolsアプリケーションプロジェクトで使用される用語を定義します。

---

## プロジェクト固有用語

### Tools / Toolsアプリ
本プロジェクトで開発するWebアプリケーションの名称。開発者向けの便利なツールを集約したサービス。

### ツール
Toolsアプリ内で提供される個別の機能（例: JSONフォーマッター、Base64エンコーダーなど）。

---

## 技術用語

### CloudFormation
AWSのインフラストラクチャ・アズ・コード（IaC）サービス。本プロジェクトではYAML形式でリソースを定義。

### Lambda
AWSのサーバーレスコンピューティングサービス。本プロジェクトのバックエンド処理で使用。

### DynamoDB
AWSのNoSQLデータベースサービス。

### CloudFront
AWSのCDN（Content Delivery Network）サービス。Webアプリケーションの配信に使用。

### ACM (AWS Certificate Manager)
AWSのSSL/TLS証明書管理サービス。

### API Gateway
AWSのAPIマネジメントサービス。RESTful APIのエンドポイントを提供。

---

## 開発プロセス用語

### モノレポ (Monorepo)
複数のプロジェクトを単一のリポジトリで管理する開発手法。

### IaC (Infrastructure as Code)
インフラストラクチャをコードで定義・管理する手法。

### CI/CD
継続的インテグレーション（Continuous Integration）と継続的デリバリー（Continuous Delivery）の略。

### ADR (Architecture Decision Records)
アーキテクチャに関する設計判断を記録するドキュメント形式。

---

## プラットフォーム用語

### nagiyu-platform
本プロジェクトのプラットフォーム全体の名称。

### 共通基盤 / shared
全アプリケーションで共有されるインフラリソース（VPC、IAM、ACMなど）。

### 統合ブランチ
アプリケーションごとの機能統合を行うブランチ（`integration/**`）。

---

## 略語

| 略語 | 正式名称 | 説明 |
|-----|---------|------|
| AWS | Amazon Web Services | Amazonが提供するクラウドサービス |
| VPC | Virtual Private Cloud | AWS上の仮想ネットワーク |
| IAM | Identity and Access Management | AWSの認証・認可サービス |
| ACM | AWS Certificate Manager | SSL/TLS証明書管理 |
| CDN | Content Delivery Network | コンテンツ配信ネットワーク |
| API | Application Programming Interface | アプリケーション間のインターフェース |
| JSON | JavaScript Object Notation | データ交換フォーマット |
| YAML | YAML Ain't Markup Language | 設定ファイル記述言語 |
| PR | Pull Request | GitHubのコード変更提案機能 |
| E2E | End-to-End | エンドツーエンドテスト |

---

## 今後追加予定の用語

プロジェクトの進行に伴い、新しい用語が追加される可能性があります。
