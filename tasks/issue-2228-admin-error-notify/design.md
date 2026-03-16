# Admin エラー検知 - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/services/admin/architecture.md に ADR として抽出し、
    tasks/issue-2228-admin-error-notify/ ディレクトリごと削除します。

    入力: tasks/issue-2228-admin-error-notify/requirements.md
    次に作成するドキュメント: tasks/issue-2228-admin-error-notify/tasks.md
-->

## API 仕様

### ベース URL・認証

- ベース URL: `https://admin.nagiyu.com/api/notify`
- **SNS 受信エンドポイント** (`/sns`): 認証なし（SNS 署名検証で代替）
- **サブスクリプション登録** (`/subscribe`, `/unsubscribe`): Admin 認証必須（JWT クッキー）

### エンドポイント一覧

| メソッド | パス                    | 説明                                          | 認証         |
| ------- | ----------------------- | --------------------------------------------- | ------------ |
| POST    | /api/notify/sns         | SNS からのアラーム通知を受信する               | SNS 署名検証 |
| POST    | /api/notify/subscribe   | プッシュサブスクリプションを登録する           | 要           |
| DELETE  | /api/notify/subscribe   | プッシュサブスクリプションを削除する           | 要           |
| GET     | /api/notify/vapid-key   | VAPID 公開鍵を返す（フロントエンド初期化用）  | 不要         |

### エンドポイント詳細

#### POST /api/notify/sns

SNS から届く JSON ペイロードを受け取る。

**SNS メッセージタイプ別処理**:
- `SubscriptionConfirmation`: `SubscribeURL` にアクセスして購読を確認する
- `Notification`: 署名検証後、プッシュ通知を送信する
- `UnsubscribeConfirmation`: ログに記録して 200 を返す

**SNS 署名検証**:
SNS メッセージに含まれる `SigningCertURL` から AWS 証明書を取得し、メッセージ署名を検証する（`x-amz-sns-message-type` ヘッダーを確認）。

**エラーレスポンス**

| ステータス | 説明                                    |
| --------- | --------------------------------------- |
| 200       | 処理成功（SNS は 200 以外をリトライ）   |
| 401       | SNS 署名検証失敗                        |

#### POST /api/notify/subscribe

**リクエストボディ**

```typescript
type SubscribeRequest = {
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
};
```

**レスポンス（成功）**: 200 OK

#### GET /api/notify/vapid-key

**レスポンス（成功）**

```typescript
type VapidKeyResponse = {
    publicKey: string;  // Base64url エンコード済み VAPID 公開鍵
};
```

---

## データモデル

### 論理モデル

```typescript
type PushSubscription = {
    subscriptionId: string;  // ランダム UUID
    userId: string;          // 登録したユーザーの ID（JWT の sub）
    endpoint: string;        // Web Push エンドポイント URL
    p256dhKey: string;       // 暗号化用公開鍵（Base64url）
    authKey: string;         // 認証シークレット（Base64url）
    createdAt: string;       // ISO 8601
    updatedAt: string;       // ISO 8601
};
```

### 物理モデル

#### DynamoDB テーブル設計

テーブル名: `nagiyu-admin-push-subscriptions-{env}`

| 属性              | 型     | 説明                                   |
| ----------------- | ------ | -------------------------------------- |
| PK                | string | `SUBSCRIPTION#{subscriptionId}`        |
| SK                | string | `SUBSCRIPTION#{subscriptionId}`        |
| userId            | string | JWT の sub                             |
| endpoint          | string | Web Push エンドポイント URL            |
| p256dhKey         | string | 暗号化用公開鍵（Base64url）            |
| authKey           | string | 認証シークレット（Base64url）          |
| createdAt         | string | ISO 8601                               |
| updatedAt         | string | ISO 8601                               |

**GSI**

| GSI 名    | PK       | SK      | 用途                           |
| --------- | -------- | ------- | ------------------------------ |
| GSI1      | userId   | createdAt | ユーザーごとのサブスクリプション取得 |

**アクセスパターン**

| 操作                                   | キー設計                          |
| -------------------------------------- | --------------------------------- |
| 全サブスクリプション取得（Push 送信時）| Scan（件数が少ないため許容）      |
| ユーザーのサブスクリプション削除       | GSI1 で userId を検索後、PK で削除 |

---

## コンポーネント設計

### パッケージ責務分担

| パッケージ    | 責務                                                          |
| ------------- | ------------------------------------------------------------- |
| `admin/web`   | SNS 受信 API Route・サブスクリプション CRUD・Web Push 送信    |
| `infra/admin` | SNS トピック・DynamoDB テーブル・Lambda 権限設定              |

Admin サービスは core パッケージを持たないため、ビジネスロジックは `web/src/lib/notify/` に配置する。

### 実装モジュール一覧

**web**

| モジュール               | パス                                              | 役割                                       |
| ------------------------ | ------------------------------------------------- | ------------------------------------------ |
| `snsSigVerifier`         | `web/src/lib/notify/sns-sig-verifier.ts`          | SNS メッセージ署名検証                     |
| `webPushSender`          | `web/src/lib/notify/web-push-sender.ts`           | Web Push 送信（`web-push` ライブラリ使用）  |
| `subscriptionRepository` | `web/src/lib/notify/subscription-repository.ts`  | DynamoDB へのサブスクリプション CRUD       |
| `SNS Route`              | `web/src/app/api/notify/sns/route.ts`             | SNS 通知受信エンドポイント                 |
| `subscribe Route`        | `web/src/app/api/notify/subscribe/route.ts`       | サブスクリプション登録・削除               |
| `vapid-key Route`        | `web/src/app/api/notify/vapid-key/route.ts`       | VAPID 公開鍵返却                           |
| `NotifyButton`           | `web/src/components/notify/NotifyButton.tsx`      | 通知許可ボタン（ダッシュボードに追加）     |
| `service-worker`         | `web/public/sw-push.js`                           | `push` イベントで通知を表示する SW ロジック |

**infra/admin**

| モジュール         | パス                                            | 役割                                   |
| ------------------ | ----------------------------------------------- | -------------------------------------- |
| `SnsStack`         | `infra/admin/lib/sns-stack.ts`                  | Admin 専用 SNS トピック                |
| `DynamoDBStack`    | `infra/admin/lib/dynamodb-stack.ts`             | プッシュサブスクリプション保存テーブル |
| `AdminStack 更新`  | `infra/admin/lib/admin-stack.ts`                | SnsStack・DynamoDBStack を組み込む     |
| `Lambda 権限更新`  | `infra/admin/lib/lambda-stack.ts`               | DynamoDB・Secrets Manager 読み書き権限 |
| `bin/admin.ts 更新`| `infra/admin/bin/admin.ts`                      | 新スタックのインスタンス化             |

### モジュール間インターフェース

SNS からの通知フロー:

```
SNS
  → POST /api/notify/sns
    → snsSigVerifier.verify(request)
    → subscriptionRepository.findAll()
    → webPushSender.sendAll(subscriptions, payload)
```

ブラウザからのサブスクリプション登録フロー:

```
NotifyButton（クリック）
  → navigator.serviceWorker.register('/sw-push.js')
  → PushManager.subscribe({ applicationServerKey: vapidPublicKey })
  → POST /api/notify/subscribe
    → subscriptionRepository.save(subscription)
```

---

## 実装上の注意点

### 依存関係・前提条件

- `web-push` npm パッケージを Admin web に追加する（VAPID + Web Push 送信）
- VAPID 鍵ペアは事前に `web-push.generateVAPIDKeys()` で生成し、Secrets Manager に保存する
- SNS HTTP サブスクリプションは CDK でプロビジョニングできないため、デプロイ後に手動または AWS CLI で登録する
- Admin Lambda に `dynamodb:PutItem`, `dynamodb:GetItem`, `dynamodb:Scan`, `dynamodb:DeleteItem` と `secretsmanager:GetSecretValue` の権限を付与する

### SNS 署名検証の実装

SNS は `x-amz-sns-message-type` ヘッダーを送信する。`Notification` タイプでは以下のフィールドを連結した文字列を SHA256WithRSA で署名する:
`Message`, `MessageId`, `Subject`（存在する場合）, `Timestamp`, `TopicArn`, `Type`

AWS 公式ドキュメントの検証アルゴリズムに従う。`SigningCertURL` は `https://sns.{region}.amazonaws.com/` で始まることを確認してから証明書を取得する。

### VAPID 鍵管理

- VAPID 公開鍵はフロントエンドに公開してよい（`/api/notify/vapid-key` で返す）
- VAPID 秘密鍵は Secrets Manager (`nagiyu-admin-vapid-private-key-{env}`) に保存し、起動時に取得する
- Lambda のコールドスタート対策としてキャッシュする（モジュールスコープの変数）

### Web Push の失敗処理

サブスクリプションの期限切れ（`410 Gone`）や無効（`404 Not Found`）の場合、DynamoDB から該当レコードを削除する。

---

## docs/ への移行メモ

- [ ] `docs/services/admin/architecture.md` に ADR として追記すること:
      「SNS → Admin HTTP Endpoint → Web Push による管理者通知フロー」と「VAPID 鍵の Secrets Manager 管理」
- [ ] `docs/services/admin/requirements.md` に F-001〜F-010 の機能要件を統合すること
- [ ] 将来の CloudWatch Alarms 追加時に使用するトピック ARN を `docs/infra/` または `docs/services/admin/` に記載する
