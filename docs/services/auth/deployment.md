# Auth サービス デプロイ・運用マニュアル

本ドキュメントは、Auth サービスのデプロイと運用に関する手順を説明します。

---

## 1. 環境構成

### 1.1 環境一覧

| 環境        | 用途                 | デプロイ元ブランチ          | URL                          |
| ----------- | -------------------- | --------------------------- | ---------------------------- |
| dev (開発)  | 開発・検証環境       | `develop`, `integration/**` | `https://auth.dev.nagiyu.com` |
| prod (本番) | 本番環境             | `master`                    | `https://auth.nagiyu.com`     |

### 1.2 リソース構成

**主要リソース**:

- **Lambda Function**: Next.js SSR 実行環境 (コンテナ)
- **ECR Repository**: Docker イメージ保存
- **DynamoDB Table**: ユーザー情報管理
- **Secrets Manager**: Google OAuth 認証情報、NEXTAUTH_SECRET、Stripe の鍵
- **CloudFront Distribution**: コンテンツ配信、カスタムドメイン
- **Lambda Function URL**: CloudFront のオリジン

**インフラ定義の場所**:

- CDK スタック: `infra/auth/lib/`

### 1.3 環境ごとのリソース名

| リソース            | dev 環境                  | prod 環境                  |
| ------------------- | ------------------------- | -------------------------- |
| Lambda Function     | `auth-dev`                | `auth-prod`                |
| ECR Repository      | `auth-dev`                | `auth-prod`                |
| DynamoDB Table      | `nagiyu-auth-users-dev`   | `nagiyu-auth-users-prod`   |
| Secrets Manager     | `nagiyu/auth/dev/*`       | `nagiyu/auth/prod/*`       |
| CloudFront          | `auth-dev-distribution`   | `auth-prod-distribution`   |
| CloudWatch Logs     | `/aws/lambda/nagiyu-auth-lambda-dev` | `/aws/lambda/nagiyu-auth-lambda-prod` |

---

## 2. 前提条件

### 2.1 共有インフラ

以下がデプロイ済みであることを確認してください:

- [ ] **VPC**: `nagiyu-{env}-vpc` - [共有インフラ: VPC](../../infra/shared/vpc.md) 参照
- [ ] **ACM 証明書** (CloudFront 用): [共有インフラ: ACM](../../infra/shared/acm.md) 参照
- [ ] **外部 DNS サービス**: カスタムドメイン設定 (auth.nagiyu.com, auth.dev.nagiyu.com)

### 2.2 必要なツール

- Node.js
- AWS CLI
- Docker
- npm

### 2.3 認証情報

#### GitHub Actions Secrets

GitHub リポジトリの Settings → Secrets and variables → Actions で以下を確認:

| Name                    | 説明                                   | 設定済み                   |
| ----------------------- | -------------------------------------- | -------------------------- |
| `AWS_ACCESS_KEY_ID`     | IAM ユーザーのアクセスキー ID          | ✓ (共通インフラで設定済み) |
| `AWS_SECRET_ACCESS_KEY` | IAM ユーザーのシークレットアクセスキー | ✓ (共通インフラで設定済み) |
| `AWS_REGION`            | デプロイ先リージョン                   | ✓ (共通インフラで設定済み) |

#### Google OAuth 認証情報

Auth サービス初回デプロイ前に、以下を準備:

1. Google Cloud Console で OAuth 2.0 クライアント ID を作成
2. リダイレクト URI を設定:
   - dev: `https://auth.dev.nagiyu.com/api/auth/callback/google`
   - prod: `https://auth.nagiyu.com/api/auth/callback/google`
3. クライアント ID とシークレットを AWS Secrets Manager に保存

---

## 3. 初回セットアップ

### 3.1 手順概要

1. **Google OAuth 認証情報を Secrets Manager に登録**
2. **NEXTAUTH_SECRET を Secrets Manager に登録**
3. **ECR リポジトリ作成**: コンテナイメージ格納用リポジトリの作成
4. **Docker イメージビルド**: アプリケーションのコンテナイメージを作成
5. **インフラデプロイ**: Lambda, DynamoDB, CloudFront などのリソースをデプロイ
6. **初期管理者ユーザーを DynamoDB に登録**
7. **動作確認**: ヘルスチェック・機能確認

### 3.2 シークレット登録

#### Google OAuth 認証情報

```bash
# 開発環境
aws secretsmanager create-secret \
    --name nagiyu/auth/dev/google-oauth \
    --secret-string '{"clientId":"YOUR_CLIENT_ID","clientSecret":"YOUR_CLIENT_SECRET"}' \
    --region us-east-1

# 本番環境
aws secretsmanager create-secret \
    --name nagiyu/auth/prod/google-oauth \
    --secret-string '{"clientId":"YOUR_CLIENT_ID","clientSecret":"YOUR_CLIENT_SECRET"}' \
    --region us-east-1
```

#### NEXTAUTH_SECRET

```bash
# 32文字以上のランダム文字列を生成
openssl rand -base64 32

# 開発環境
aws secretsmanager create-secret \
    --name nagiyu/auth/dev/nextauth-secret \
    --secret-string 'GENERATED_SECRET' \
    --region us-east-1

# 本番環境
aws secretsmanager create-secret \
    --name nagiyu/auth/prod/nextauth-secret \
    --secret-string 'GENERATED_SECRET' \
    --region us-east-1
```

### 3.3 ECR リポジトリの作成

```bash
# 開発環境
npm run deploy -w auth -- --context env=dev --context deploymentPhase=ecr-only

# 本番環境
npm run deploy -w auth -- --context env=prod --context deploymentPhase=ecr-only
```

### 3.4 Docker イメージのビルドとプッシュ

```bash
# 1. ECR にログイン
aws ecr get-login-password --region us-east-1 | \
    docker login --username AWS --password-stdin <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# 2. イメージのビルド (モノレポルートから)
docker build -t auth:latest -f services/auth/Dockerfile .

# 3. タグ付け
docker tag auth:latest <ECR_REGISTRY>/auth-dev:latest

# 4. プッシュ
docker push <ECR_REGISTRY>/auth-dev:latest
```

### 3.5 アプリケーションリソースのデプロイ

```bash
# 開発環境
npm run deploy -w auth -- --context env=dev --context deploymentPhase=full

# 本番環境
npm run deploy -w auth -- --context env=prod --context deploymentPhase=full
```

### 3.6 初期管理者ユーザーの登録

初回セットアップ時、最初の管理者ユーザーを手動で DynamoDB に登録します。

**手順**:

1. 一度 Auth サービスにログインし、ユーザーが自動作成されることを確認
2. DynamoDB Console で `nagiyu-auth-users-dev` テーブルを開く
3. 作成されたユーザーアイテムを編集
4. `roles` 属性を `["admin"]` に変更
5. 保存

**AWS CLI での登録例**:

```bash
# googleId を確認後、以下コマンドで admin ロールを付与
aws dynamodb update-item \
    --table-name nagiyu-auth-users-dev \
    --key '{"userId":{"S":"user_YOUR_USER_ID"}}' \
    --update-expression "SET roles = :roles" \
    --expression-attribute-values '{":roles":{"L":[{"S":"admin"}]}}' \
    --region us-east-1
```

### 3.7 動作確認

```bash
# Lambda 関数の確認
aws lambda get-function \
    --function-name auth-dev \
    --region us-east-1

# ヘルスチェック
curl https://auth.dev.nagiyu.com/api/health

# 期待されるレスポンス:
# {
#   "status": "ok",
#   "timestamp": "2024-01-15T12:34:56.789Z",
#   "version": "1.0.0",
#   "dependencies": {
#     "dynamodb": "ok",
#     "secretsManager": "ok"
#   }
# }
```

### 3.8 Stripe の鍵の登録

Stripe の鍵は、秘密情報 `nagiyu-auth-stripe-{env}` に、秘密鍵 (`secretKey`) と通知の署名鍵 (`webhookSecret`) の 2 つを入れる。秘密情報は Auth のデプロイが専用のスタックとして作り、初期値は仮の値 (`PLACEHOLDER_` で始まる値) になっている。値は人が Stripe の管理画面で発行して書き換える。dev ではサンドボックスの鍵を使う。

```bash
aws secretsmanager put-secret-value \
    --secret-id nagiyu-auth-stripe-dev \
    --secret-string '{"secretKey":"YOUR_SECRET_KEY","webhookSecret":"YOUR_WEBHOOK_SECRET"}' \
    --region us-east-1
```

- **値を変えたら Auth を再デプロイする**: 鍵はデプロイ時に秘密情報から読まれ、Lambda の環境変数として渡る。秘密情報を書き換えただけでは、動いている Auth に届かない
- **鍵が未設定の間は課金が無効**: 2 つの鍵のどちらかが空か仮の値のままなら、課金は無効として動く。プランの画面は価格と操作の代わりに「準備中です」と表示し、申し込み・契約の管理・通知の受け口の API は、課金が有効になっていない旨を返す。特定商取引法に基づく表記は、この間も表示される
- 本番は、本番の Stripe を有効化するまでこの状態で動く (→ [8.5 課金 (Stripe) の運用](#85-課金-stripe-の運用))

---

## 4. CI/CD パイプライン

### 4.1 ワークフロー概要

Auth サービスでは、以下の GitHub Actions ワークフローを使用します:

各ワークフローのパスフィルター (`paths`) は [コーディング規約](../../development/rules.md) の共通ルールに従うため、ここには記載しません。

#### 1. 検証ワークフロー (`.github/workflows/auth-verify-app.yml`)

**目的**: integration/\*\* と develop へのプルリクエスト時に品質を検証

1 本で、PR の向き先によって Fast / Full を出し分ける。Fast は integration/\*\* 向けで E2E は chromium-mobile のみ、Full は develop 向けで E2E は全デバイス (chromium-desktop, chromium-mobile, webkit-mobile) に加えてテストカバレッジチェック (80%以上必須) を行う。

なお `auth-verify.yml` はインフラ (CDK) 用の別ワークフローである。

#### 2. デプロイワークフロー (`.github/workflows/auth-deploy.yml`)

**目的**: develop, integration/\*\*, master ブランチへのプッシュ時に自動デプロイ

**トリガー条件**:

```yaml
on:
  push:
    branches:
      - develop
      - integration/**
      - master
```

**ジョブ構成**:

1. **infrastructure**: ECR リポジトリの CDK スタックデプロイ
2. **build**: Docker イメージのビルドと ECR へのプッシュ
3. **deploy**: Lambda, DynamoDB, CloudFront の CDK デプロイ
4. **verify**: デプロイ後のヘルスチェック

### 4.2 ブランチ戦略とデプロイフロー

プラットフォーム共通のブランチ戦略とCI/CD戦略については、[ブランチ戦略](../../branching.md) を参照してください。

**概要**:
- `feature/**` → `integration/**` → `develop` → `master` の順にマージ
- `integration/**` および `develop` へのプッシュで開発環境へ自動デプロイ
- `master` へのプッシュで本番環境へ自動デプロイ
- PR検証は2段階（Fast CI / Full CI）

### 4.3 ワークフロー実行例

#### プルリクエスト作成時 (integration/** へのPR)

```bash
# feature ブランチから integration/** へのプルリクエスト作成
git checkout -b feature/add-github-oauth
git push origin feature/add-github-oauth

# GitHub でプルリクエストを integration/auth-improvements ブランチに作成
# → auth-verify-app.yml (Fast) が自動実行される
#   ✓ ビルド検証
#   ✓ 単体テスト実行
#   ✓ E2Eテスト実行（chromium-mobile のみ）
#   ✓ リントチェック
# → すべて成功でマージ可能
```

#### プルリクエスト作成時 (develop へのPR)

```bash
# integration/** ブランチから develop へのプルリクエスト作成
# → auth-verify-app.yml (Full) が自動実行される
#   ✓ ビルド検証
#   ✓ Docker ビルド検証
#   ✓ 単体テスト実行
#   ✓ カバレッジチェック（80%以上）
#   ✓ E2Eテスト実行（全デバイス）
#   ✓ リントチェック
#   ✓ フォーマットチェック
# → すべて成功でマージ可能
```

#### マージ後のデプロイ

```bash
# プルリクエストをマージ
# → develop ブランチに push される
# → auth-deploy.yml が自動実行される
#   1. ECR の CDK スタックデプロイ
#   2. Docker イメージビルド & プッシュ
#   3. Lambda, DynamoDB の CDK デプロイ
#   4. CloudFront の CDK デプロイ
#   5. ヘルスチェック
# → 開発環境へデプロイ完了
```

---

## 5. 手動デプロイ

### 5.1 Docker イメージの手動デプロイ

緊急時や CI/CD が利用できない場合の手順:

```bash
# 1. ECR ログイン
aws ecr get-login-password --region us-east-1 | \
    docker login --username AWS --password-stdin <AWS_ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# 2. イメージのビルド (モノレポルートから)
docker build -t auth:latest -f services/auth/Dockerfile .

# 3. タグ付け & プッシュ
docker tag auth:latest <ECR_REGISTRY>/auth-dev:latest
docker push <ECR_REGISTRY>/auth-dev:latest
```

### 5.2 Lambda 関数の手動更新

```bash
aws lambda update-function-code \
    --function-name auth-dev \
    --image-uri <ECR_REGISTRY>/auth-dev:latest \
    --region us-east-1
```

---

## 6. 環境変数管理

### 6.1 環境変数一覧

| 環境変数                 | 説明                                       | 例                                      | 必須 |
| ------------------------ | ------------------------------------------ | --------------------------------------- | ---- |
| `NEXTAUTH_URL`           | NextAuth.js のベース URL                   | `https://auth.dev.nagiyu.com`           | ✅   |
| `NEXTAUTH_SECRET`        | JWT 署名用秘密鍵 (Secrets Manager から取得) | (32文字以上のランダム文字列)           | ✅   |
| `GOOGLE_CLIENT_ID`       | Google OAuth クライアント ID               | `123456789.apps.googleusercontent.com`  | ✅   |
| `GOOGLE_CLIENT_SECRET`   | Google OAuth クライアントシークレット      | (Secrets Manager から取得)              | ✅   |
| `DYNAMODB_TABLE_NAME`    | DynamoDB テーブル名                        | `nagiyu-auth-users-dev`                 | ✅   |
| `STRIPE_SECRET_KEY`      | Stripe の秘密鍵 (Secrets Manager から取得) | (Stripe の管理画面で発行)               | -    |
| `STRIPE_WEBHOOK_SECRET`  | Stripe の通知の署名鍵 (Secrets Manager から取得) | (Stripe の管理画面で発行)         | -    |
| `NODE_ENV`               | 実行環境                                   | `production`                            | ✅   |

### 6.2 環境変数の設定方法

**CDK での設定**:

環境変数は CDK スタックで自動的に設定されます:

```typescript
// lib/auth-stack.ts
environment: {
  NEXTAUTH_URL: `https://${customDomain}`,
  NEXTAUTH_SECRET: secretNextAuthSecret.secretValue.toString(),
  GOOGLE_CLIENT_ID: secretGoogleOAuth.secretValueFromJson('clientId').toString(),
  GOOGLE_CLIENT_SECRET: secretGoogleOAuth.secretValueFromJson('clientSecret').toString(),
  DYNAMODB_TABLE_NAME: usersTable.tableName,
  NODE_ENV: 'production',
}
```

**手動設定（緊急時）**:

```bash
aws lambda update-function-configuration \
    --function-name auth-dev \
    --environment Variables="{NEXTAUTH_URL=https://auth.dev.nagiyu.com}" \
    --region us-east-1
```

---

## 7. ログ管理・監視

### 7.1 ログの確認

**Lambda ログ**:

- ロググループ: `/aws/lambda/nagiyu-auth-lambda-{env}`
- 保持期間: 30日

**ログの確認方法**:

```bash
# ログのリアルタイム確認
aws logs tail /aws/lambda/nagiyu-auth-lambda-dev --follow

# 特定期間のログ検索
aws logs filter-log-events \
    --log-group-name /aws/lambda/nagiyu-auth-lambda-dev \
    --start-time $(date -d '1 hour ago' +%s)000 \
    --filter-pattern "ERROR"

# エラーログのみ抽出
aws logs filter-log-events \
    --log-group-name /aws/lambda/nagiyu-auth-lambda-dev \
    --filter-pattern "ERROR" \
    --max-items 50
```

### 7.2 メトリクスとアラート

**Lambda メトリクス**:

- 実行時間 (Duration)
- エラー率 (Errors)
- 同時実行数 (ConcurrentExecutions)
- スロットル (Throttles)

**DynamoDB メトリクス**:

- 読み取りスロットル (ReadThrottleEvents)
- 書き込みスロットル (WriteThrottleEvents)
- 消費読み取りキャパシティ (ConsumedReadCapacityUnits)
- 消費書き込みキャパシティ (ConsumedWriteCapacityUnits)

**CloudFront メトリクス**:

- リクエスト数 (Requests)
- エラー率 (4xxErrorRate, 5xxErrorRate)
- バイトダウンロード (BytesDownloaded)

### 7.3 推奨アラート設定

| アラート項目          | 閾値           | アクション                     |
| --------------------- | -------------- | ------------------------------ |
| Lambda エラー率       | > 5%           | Slack 通知、メール通知         |
| Lambda 実行時間       | > 5秒          | Slack 通知                     |
| DynamoDB スロットル   | > 0            | Slack 通知、メール通知         |
| CloudFront 5xxエラー率 | > 1%           | Slack 通知、メール通知         |

---

## 8. 運用手順

### 8.1 バージョン管理

#### 8.1.1 バージョン番号のルール

本プロジェクトは [Semantic Versioning](https://semver.org/) に準拠します:

- **メジャー (X.0.0)**: 破壊的変更
- **マイナー (0.X.0)**: 新機能追加（後方互換性あり）
- **パッチ (0.0.X)**: バグ修正

#### 8.1.2 バージョン管理の Single Source of Truth

**`services/auth/package.json` の `version` フィールドがすべてのバージョン情報の唯一の真実の情報源です。**

#### 8.1.3 バージョン更新手順

```bash
# パッチバージョンアップ（例: 1.0.0 → 1.0.1）
npm version patch -w auth

# マイナーバージョンアップ（例: 1.0.0 → 1.1.0）
npm version minor -w auth

# メジャーバージョンアップ（例: 1.0.0 → 2.0.0）
npm version major -w auth
```

**注**: `npm version` コマンドは自動的に Git タグとコミットを作成します。

### 8.2 スケーリング対応

Lambda は自動スケーリングされます。必要に応じて以下を調整:

- メモリサイズ: 512 MB (デフォルト)
- タイムアウト: 30秒
- 予約済み同時実行数: 未設定 (自動スケール)

DynamoDB はオンデマンド課金で自動スケールします。

### 8.3 セキュリティアップデート

依存パッケージの定期的な更新を実施してください。

```bash
# セキュリティ脆弱性のチェック
npm audit

# 脆弱性の自動修正
npm audit fix

# 破壊的変更を含む修正
npm audit fix --force
```

### 8.4 シークレットのローテーション

四半期ごとに以下をローテーション:

1. **Google OAuth クライアントシークレット**:
   - Google Cloud Console で新しいシークレットを発行
   - Secrets Manager で更新
   - Lambda 関数を再起動

2. **NEXTAUTH_SECRET**:
   - 新しいランダム文字列を生成 (`openssl rand -base64 32`)
   - Secrets Manager で更新
   - Lambda 関数を再起動
   - **注意**: すべての既存セッションが無効化されます

### 8.5 課金 (Stripe) の運用

#### 本番の Stripe を有効化する

Stripe の事業者の情報 (公開用の事業者名・サポートの連絡先) は、本番環境を有効化してからでないと設定できない。サンドボックスとは別に、本番の環境で次を用意する。

1. **商品と価格**: 段ごとに商品を作り、それぞれに 1 か月ごとの価格を付ける。価格の lookup_key は、有料ロールの ID (`livetalk-standard`、`quick-clip-pro` など) にする。どの有料ロールが付くかも、プランの画面の価格の取得も、この lookup_key で決まる。有料ロールの ID でない lookup_key は無視される。商品の説明は段の説明としてプランの画面に表示される (空なら出ない)。機能 (Entitlements) は使わないので作らない。金額は、サンドボックスで決めた価格と同じにする。価格はコードにも docs にも持たず、サンドボックスの価格が決定の置き場所になっているため、サンドボックスの各価格を見て同じ金額で作る
2. **Customer Portal**: 解約・支払い方法の変更・請求の履歴に加え、プランの切り替えを利用者に開く。切り替えの対象に、段の商品と価格を入れる (Auth が上げを送る確認画面は、ここに入っている価格にしか切り替えられない)。比例配分はオンにして即時に請求する。下げは Auth が予約するので、Portal のダウングレードの設定には依らない。解約は期間の終わりに効かせる。プランの画面と特定商取引法に基づく表記で、解約しても期間の終わりまで使えると案内しているため
3. **通知の受け口**: `https://auth.nagiyu.com/api/billing/webhook` を登録する。通知の種類は、サンドボックスの受け口と同じものを選ぶ (Auth が作る下げの予約に関わる subscription_schedule のイベントを含む)。受け口は、顧客 ID を含む通知を、その顧客の契約を取り直す合図として扱う
4. **鍵**: 本番の秘密鍵と、受け口の署名鍵を `nagiyu-auth-stripe-prod` に入れ、Auth を再デプロイする (→ [3.8 Stripe の鍵の登録](#38-stripe-の鍵の登録))
5. **表記の URL**: 特定商取引法に基づく表記のページ (`https://auth.nagiyu.com/legal/tokushoho`) の URL を Stripe に登録する。本番の審査で確かめられる

6. **新しい購入のメール通知**: Stripe のダッシュボード (本番) で、自分のアカウントの「通知の受け取り (Communication preferences)」を開き、「支払いの成功 (Successful payments)」のメールを有効にする。運営者が新しい購入を知るための設定で、Auth にはこのための仕組みを持たない。顧客への領収書のメール (設定 → 顧客へのメール) とは別の設定で、そちらは顧客に届くものなので、これでは通知されない。Stripe のメニューの場所は変わりうるため、見つからなければ設定の検索で「Communication preferences」を探す

本番の審査では、料金が本番のサイトに出ている必要がある。価格はコードに持たないので、本番の価格はそれまでに Stripe 上で決めればよい。

#### 契約中のユーザーを削除するとき

先に Stripe で契約を解約してから、ユーザーを削除する。ユーザーの削除は Stripe の契約に触れないため、そのままだと請求が続く。

#### Stripe で顧客を削除したとき

管理画面のユーザー編集から、Stripe の顧客との対応を外す。外さないと、Auth に削除済みの顧客 ID が残り、その利用者の申し込みと契約の管理が失敗し続ける。外すと、Stripe 由来の有効な課金の権利も一緒に取り消される。

#### 下げの予約が残っているとき

段を下げると、下げが効いた後も 1 請求期間、契約に予約 (Subscription Schedule) が付いたまま残る (→ [アーキテクチャ](./architecture.md) の ADR-013)。その間に利用者が上げや解約をできずに困ったら、Stripe の管理画面で、その契約の予約を解除 (release) する。契約の中身は変わらない。望まない次の期間分が請求されていたら、返金する (→ 返金するとき)。

その間に上げや解約が実際に断られるかは確かめていない。確かめるときは、サンドボックスのテストクロック (管理画面の「シミュレーション」) で顧客と上の段の契約を作り、期間の終わりに下の段へ切り替わる更新をスケジュールしてから、切り替わった後まで時間を進める。契約の `schedule` に予約が残っている状態で、Customer Portal や管理画面から上げ・解約ができるかを見る。

#### 価格を変えるとき

Stripe の価格は、一度使われると金額を変えられない。金額を変えるときは、同じ商品に新しい価格を作り、lookup_key を古い価格から新しい価格へ移す (API なら、価格を作るときに `transfer_lookup_key` を指定すると移せる)。古い価格はアーカイブしてよい。

- プランの画面と申し込みは、lookup_key で価格を引くので、移した時点から新しい金額になる。コードの変更も Auth の再デプロイも要らない
- すでに古い価格で契約している利用者は、古い価格のまま更新され続ける。移すかどうかは別に判断し、移すなら Stripe 側で契約の価格を切り替える
- 金額を変えたら、プランの画面と特定商取引法に基づく表記の案内 (表記は金額を持たず、プランの画面へ案内している) に食い違いが無いかを確かめる

#### 返金するとき

Stripe の管理画面から手で返金する。Auth には返金の仕組みを持たない。

---

## 9. 障害対応

### 9.1 ロールバック手順

#### GitHub Actions からのロールバック

1. 前のコミットに戻す
2. 再度プッシュして自動デプロイを実行

```bash
git revert HEAD
git push origin develop
```

#### 手動ロールバック

```bash
# 前のイメージタグを確認
aws ecr describe-images --repository-name auth-dev --region us-east-1

# 前のイメージタグを指定してロールバック
aws lambda update-function-code \
    --function-name auth-dev \
    --image-uri <ECR_REGISTRY>/auth-dev:<PREVIOUS_TAG> \
    --region us-east-1
```

### 9.2 よくある障害と対処法

#### デプロイが失敗する

**症状**: GitHub Actions のワークフローが失敗する

**原因と対処**:

- ECR ログインエラー → IAM ロールの権限を確認
- Lambda 更新エラー → Lambda 関数が存在するか確認、メモリ・タイムアウト設定を確認
- ヘルスチェック失敗 → `/api/health` エンドポイントの実装を確認

#### Lambda が起動しない

**症状**: Function URL にアクセスできない

**原因と対処**:

- Docker イメージのビルドエラー → ローカルでイメージをビルドしてテスト
- 環境変数の設定ミス → Lambda の環境変数を確認
- メモリ不足 → Lambda のメモリサイズを増やす (512 MB → 1024 MB)
- タイムアウト → タイムアウト時間を増やす

#### OAuth 認証が失敗する

**症状**: Google ログイン後にエラーページが表示される

**原因と対処**:

- リダイレクト URI の不一致 → Google Cloud Console でリダイレクト URI を確認
- クライアントシークレットの誤り → Secrets Manager の値を確認
- NEXTAUTH_URL の誤り → Lambda 環境変数を確認

#### DynamoDB へのアクセスエラー

**症状**: ユーザー情報が取得できない、作成できない

**原因と対処**:

- IAM ロールの権限不足 → Lambda の実行ロールに DynamoDB アクセス権限があるか確認
- テーブル名の誤り → 環境変数 `DYNAMODB_TABLE_NAME` を確認
- DynamoDB スロットル → オンデマンド課金モードであることを確認

#### PR検証ワークフローが失敗する

**症状**: プルリクエストのチェックが失敗する

**デバッグ方法**:

```bash
# ローカルで PR検証と同じステップを実行

# 1. ビルド検証
npm run build -w auth

# 2. Docker ビルド検証
docker build -t auth-pr-test -f services/auth/Dockerfile .

# 3. 単体テスト実行
npm run test -w auth

# 4. E2Eテスト実行
npm run test:e2e -w auth

# 5. リントチェック
npm run lint -w auth

# 6. フォーマットチェック
npm run format:check -w auth
```

### 9.3 エスカレーションフロー

**Level 1: 開発者対応**
- ログ確認、設定確認、ロールバック

**Level 2: チームリーダー対応**
- AWS サポートへの問い合わせ検討
- インフラ設定の確認

**Level 3: 緊急対応**
- AWS サポートへの緊急問い合わせ
- 代替サービスの起動検討

---

## 10. 削除手順

### 10.1 リソースの削除

**注意**: DynamoDB テーブルを削除するとユーザーデータも失われます。必ずバックアップを取得してください。

```bash
# CDK スタックの削除
npm run cdk -w auth -- destroy --context env=dev

# ECR イメージの削除
aws ecr batch-delete-image \
    --repository-name auth-dev \
    --image-ids imageTag=latest \
    --region us-east-1
```

---

## 参考資料

- [GitHub Actions - OIDC を使用した AWS との連携](https://docs.github.com/ja/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
- [AWS Lambda - コンテナイメージを使用した関数の更新](https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-images.html)
- [NextAuth.js Documentation](https://next-auth.js.org/)
- [プラットフォームブランチ戦略](../../branching.md)
- [プラットフォーム開発ガイドライン](../../development/rules.md)
- [共有インフラドキュメント](../../infra/README.md)
