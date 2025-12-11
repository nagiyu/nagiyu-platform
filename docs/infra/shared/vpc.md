# VPC (Virtual Private Cloud)

## 概要

nagiyu プラットフォームでは、開発環境と本番環境それぞれに独立した VPC を構築します。各 VPC は ECS や AWS Batch などのコンテナワークロード用のネットワーク基盤を提供します。

## 設計方針

### 基本方針
- **環境分離**: dev と prod で完全に独立した VPC を作成
- **シンプル構成**: Public Subnet のみで NAT Gateway は使用しない
- **コスト最適化**: 個人開発プロジェクトとして、必要最小限のリソースで構成
- **将来の拡張性**: Private Subnet が必要になった場合は新 VPC を作成

### 用途
- ECS タスク用のネットワーク提供
- AWS Batch ジョブ用のネットワーク提供
- Lambda は VPC 配置なし（関数 URL または CloudFront 経由で公開）

## ネットワーク設計

### dev 環境

| 項目 | 値 |
|-----|-----|
| VPC CIDR | `10.0.0.0/24` |
| 利用可能 IP 数 | 251 |
| AZ 構成 | 1 AZ (us-east-1a) |
| リージョン | us-east-1 |

#### サブネット構成

| サブネット名 | タイプ | AZ | CIDR | 利用可能 IP |
|------------|------|-----|------|-----------|
| nagiyu-dev-public-subnet-1a | Public | us-east-1a | `10.0.0.0/24` | 251 |

### prod 環境

| 項目 | 値 |
|-----|-----|
| VPC CIDR | `10.1.0.0/24` |
| 利用可能 IP 数 | 251 |
| AZ 構成 | 2 AZ (us-east-1a, us-east-1b) |
| リージョン | us-east-1 |

#### サブネット構成

| サブネット名 | タイプ | AZ | CIDR | 利用可能 IP |
|------------|------|-----|------|-----------|
| nagiyu-prod-public-subnet-1a | Public | us-east-1a | `10.1.0.0/25` | 123 |
| nagiyu-prod-public-subnet-1b | Public | us-east-1b | `10.1.128.0/25` | 123 |

## リソース構成

### VPC
- DNS ホスト名: 有効
- DNS 解決: 有効
- VPC Flow Logs: 無効（コスト最適化、必要時に有効化可能）

### Internet Gateway
- 各 VPC に 1 つの Internet Gateway をアタッチ
- Public Subnet からインターネットへのアクセスを提供

### Route Table
- Public Subnet 用のルートテーブル
    - デフォルトルート (`0.0.0.0/0`) → Internet Gateway

### NAT Gateway
- **使用しない**
- Private Subnet が存在しないため不要
- 将来必要になった場合は新 VPC で対応

### セキュリティグループ
- VPC テンプレートでは作成しない
- 各アプリケーションが独自のセキュリティグループを管理

## IP アドレス設計

### サイジング根拠
- 想定サービス数: 15-20 個
- サービスあたりの最大タスク数: 10
- 必要 IP 数: 20 サービス × 10 タスク = 200 IP
- 確保 IP 数: 251 IP (dev), 246 IP (prod 合計)
- 余裕率: 約 20%

### CIDR 選定理由
- `10.x.x.x` 系列: 一般的でわかりやすい
- dev = `10.0.x.x`, prod = `10.1.x.x`: 環境が一目で識別可能
- `/24` および `/25`: 必要十分なサイズで無駄がない

## リージョンと AZ 戦略

### リージョン選定
- **us-east-1 (バージニア北部)** を使用
- 理由: CloudFront との統合を考慮（証明書管理など）

### AZ 構成

#### dev 環境: 1 AZ
- コスト最適化を優先
- 開発環境のため、AZ 障害時のダウンタイムは許容
- 使用 AZ: us-east-1a

#### prod 環境: 2 AZ
- 基本的な冗長性を確保
- ECS/Batch のタスクを複数 AZ に分散配置可能
- AWS 起因の単一 AZ 障害時も、残りの AZ でサービス継続
- 使用 AZ: us-east-1a, us-east-1b

## セキュリティ

### ネットワークレベル
- Public Subnet のみのため、全リソースがインターネットからアクセス可能
- セキュリティグループで適切にアクセス制御を実施
- 不要なポートは閉じる

### セキュリティグループ管理
- 各アプリケーションが独自のセキュリティグループを作成・管理
- CloudFormation テンプレートで定義
- 最小権限の原則に従う

### VPC Flow Logs
- 初期状態では無効
- トラブルシューティングが必要になった場合に有効化
- 有効化時は CloudWatch Logs または S3 に出力

## コスト見積もり

### dev 環境
| リソース | 月額コスト (USD) |
|---------|----------------|
| VPC | 無料 |
| Subnet | 無料 |
| Internet Gateway | 無料 (データ転送料金は別) |
| **合計** | **$0** |

### prod 環境
| リソース | 月額コスト (USD) |
|---------|----------------|
| VPC | 無料 |
| Subnet | 無料 |
| Internet Gateway | 無料 (データ転送料金は別) |
| **合計** | **$0** |

※ データ転送料金は実際の使用量に応じて発生します
※ VPC Flow Logs を有効化した場合、ログ保存料金が追加で発生します

## デプロイ

### スタック名
- dev 環境: `nagiyu-dev-vpc`
- prod 環境: `nagiyu-prod-vpc`

### デプロイ順序
1. IAM リソース（既存）
2. **VPC リソース（本スタック）**
3. アプリケーションリソース

### パラメータ
CloudFormation テンプレートでは以下のパラメータを使用:
- `Environment`: dev または prod
- その他の値は環境に応じて自動的に設定

### 出力値 (Outputs)
他のスタックで参照できるように、以下の値をエクスポート:

| Export 名 | 説明 | 例 |
|----------|------|-----|
| `nagiyu-{env}-vpc-id` | VPC ID | vpc-xxxxx |
| `nagiyu-{env}-public-subnet-ids` | Public Subnet ID リスト | subnet-xxxxx,subnet-yyyyy |
| `nagiyu-{env}-igw-id` | Internet Gateway ID | igw-xxxxx |

## 運用

### モニタリング
- VPC Flow Logs（必要時に有効化）
- CloudWatch メトリクス
    - ネットワーク In/Out
    - パケット数

### トラブルシューティング
1. **接続できない場合**
    - セキュリティグループのルールを確認
    - ルートテーブルの設定を確認
    - Internet Gateway のアタッチ状態を確認

2. **IP アドレスが枯渇した場合**
    - 使用していないタスクを停止
    - サブネットサイズの見直し（新 VPC 作成を検討）

### バックアップ・災害復旧
- VPC の設定は CloudFormation テンプレートで管理
- テンプレートから再作成可能
- リージョン障害時は別リージョンに新規構築

## 将来の拡張

### Private Subnet が必要になった場合
現在の設計では Private Subnet を含めていませんが、将来以下の用途で必要になる可能性があります:
- RDS などのデータベース
- 内部専用の API サーバー
- セキュリティ要件の高いワークロード

**対応方針:**
- 新しい VPC を作成（推奨）
- Private Subnet + NAT Gateway 構成で構築
- 必要に応じて既存 VPC と VPC Peering で接続

### VPC Endpoint
将来的にデータ転送コストを削減したい場合、以下の VPC Endpoint を検討:
- **S3 Gateway Endpoint**: 無料、S3 へのトラフィックを VPC 内に閉じる
- **ECR Interface Endpoint**: ECR からのイメージ pull を高速化
- **CloudWatch Logs Interface Endpoint**: ログ送信を VPC 内に閉じる

## 参考資料

### AWS ドキュメント
- [Amazon VPC とは](https://docs.aws.amazon.com/ja_jp/vpc/latest/userguide/what-is-amazon-vpc.html)
- [VPC とサブネット](https://docs.aws.amazon.com/ja_jp/vpc/latest/userguide/configure-your-vpc.html)
- [インターネットゲートウェイ](https://docs.aws.amazon.com/ja_jp/vpc/latest/userguide/VPC_Internet_Gateway.html)

### ベストプラクティス
- [AWS Well-Architected Framework - セキュリティの柱](https://docs.aws.amazon.com/ja_jp/wellarchitected/latest/security-pillar/welcome.html)
- [VPC の設計のベストプラクティス](https://docs.aws.amazon.com/ja_jp/vpc/latest/userguide/vpc-network-design.html)
