# Admin エラー検知 - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/services/admin/architecture.md に ADR として抽出し、
    tasks/issue-2228-admin-error-notify/ ディレクトリごと削除します。

    入力: tasks/issue-2228-admin-error-notify/requirements.md
    次に作成するドキュメント: tasks/issue-2228-admin-error-notify/tasks.md
-->

## 認可設計

### 既存 RBAC の活用

`@nagiyu/common` の `hasPermission` / `requirePermission` 関数を使用する。

プッシュ通知の購読・解除は `admin` ロール保持者のみに制限するため、`notifications:write` 権限を新設し `admin` ロールに追加する。

**`libs/common/src/auth/types.ts` への追加**:
```typescript
// 追加
| 'notifications:write'  // プッシュ通知サブスクリプション管理
```

**`libs/common/src/auth/roles.ts` への変更**:
```typescript
admin: {
  id: 'admin',
  permissions: ['users:read', 'users:write', 'roles:assign', 'notifications:write'],  // 追加
},
```

**API Route での使用例**:
```typescript
import { requirePermission } from '@nagiyu/common/auth';

const session = await getSession();
requirePermission(session?.user?.roles ?? [], 'notifications:write');
// ロールがない場合は requirePermission が例外を投げ → 403 Forbidden を返す
```

**UI での表示制御**:
```typescript
import { hasPermission } from '@nagiyu/common/auth';

// ダッシュボードで admin ロール保持者のみボタンを表示
{hasPermission(user.roles, 'notifications:write') && <NotifyButton />}
```

---

## API 仕様

### ベース URL・認証

- ベース URL: `https://admin.nagiyu.com/api/notify`
- **SNS 受信エンドポイント** (`/sns`): 認証なし（SNS 署名検証で代替）
- **サブスクリプション登録・削除** (`/subscribe`): Admin 認証 + `notifications:write` 権限必須
- **VAPID 公開鍵** (`/vapid-key`): 認証不要（公開情報）

### エンドポイント一覧

| メソッド | パス                    | 説明                                          | 認証                          |
| ------- | ----------------------- | --------------------------------------------- | ----------------------------- |
| POST    | /api/notify/sns         | SNS からのアラーム通知を受信する               | SNS 署名検証                  |
| POST    | /api/notify/subscribe   | プッシュサブスクリプションを登録する           | 要（notifications:write 権限）|
| DELETE  | /api/notify/subscribe   | プッシュサブスクリプションを削除する           | 要（notifications:write 権限）|
| GET     | /api/notify/vapid-key   | VAPID 公開鍵を返す（フロントエンド初期化用）  | 不要                          |

### エンドポイント詳細

#### POST /api/notify/sns

SNS から届く JSON ペイロードを受け取る。

**SNS メッセージタイプ別処理**:
- `SubscriptionConfirmation`: `SubscribeURL` にアクセスして購読を確認する
- `Notification`: 署名検証後、プッシュ通知を送信する
- `UnsubscribeConfirmation`: ログに記録して 200 を返す

**SNS 署名検証**:
`@aws-sdk/sns-message-validator` npm パッケージを使用して検証を行う。手動実装は不要。

```typescript
import { MessageValidator } from '@aws-sdk/sns-message-validator';
const validator = new MessageValidator();
await validator.validate(message);  // 署名が不正な場合は例外を投げる
```

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

#### DELETE /api/notify/subscribe

**リクエストボディ**

```typescript
type UnsubscribeRequest = {
    endpoint: string;  // 削除対象サブスクリプションの endpoint URL
};
```

**レスポンス（成功）**: 200 OK

**処理フロー**: DynamoDB の GSI（EndpointIndex）で endpoint をキーに検索し、一致するレコードを削除する。

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

### 物理モデル（Single Table Design）

他サービス（Stock Tracker 等）と同様に **Single Table Design** を採用し、将来 Admin で扱うエンティティが増えた場合も 1 つのテーブルで管理できるようにする。

テーブル名: `nagiyu-admin-main-{env}`

**キー設計**

| 属性       | 型     | 説明                                         |
| ---------- | ------ | -------------------------------------------- |
| PK         | string | パーティションキー（例: `SUBSCRIPTION#{subscriptionId}`） |
| SK         | string | ソートキー（例: `SUBSCRIPTION#{subscriptionId}`）      |
| GSI1PK     | string | GSI1 PK（例: `USER#{userId}`）               |
| GSI1SK     | string | GSI1 SK（例: `SUBSCRIPTION#{subscriptionId}`）|
| GSI2PK     | string | GSI2 PK（例: `ENDPOINT#{endpointHash}`）     |
| Type       | string | エンティティタイプ（例: `Subscription`）      |
| その他属性 | -      | エンティティ固有の属性                       |

**プッシュサブスクリプション アイテム例**

```
PK                   SK                   Type         GSI1PK           GSI1SK                GSI2PK                        userId    endpoint          ...
------------------------------------------------------------------------------------------------------------------------------------------------------------
SUBSCRIPTION#{id}    SUBSCRIPTION#{id}    Subscription USER#{userId}    SUBSCRIPTION#{id}     ENDPOINT#{endpointHash}       user123   https://fcm.goog...
```

**GSI 一覧**

| GSI 名        | PKカラム名 / 値             | SKカラム名 / 値                        | 用途                                  |
| ------------- | --------------------------- | -------------------------------------- | ------------------------------------- |
| UserIndex     | GSI1PK = `USER#{userId}`    | GSI1SK = `SUBSCRIPTION#{subscriptionId}`| ユーザーごとのサブスクリプション取得  |
| EndpointIndex | GSI2PK = `ENDPOINT#{hash}`  | GSI1SK = `SUBSCRIPTION#{subscriptionId}`| endpoint URL による削除              |

**アクセスパターン**

| 操作                                   | キー設計                                      |
| -------------------------------------- | --------------------------------------------- |
| 全サブスクリプション取得（Push 送信時）| Scan（管理者のみが登録、件数は少数で許容）    |
| ユーザーのサブスクリプション一覧取得   | GSI1（UserIndex）で GSI1PK = `USER#{userId}` |
| endpoint による削除（解除時）          | GSI2（EndpointIndex）で検索後、PK で削除      |

---

## コンポーネント設計

### パッケージ責務分担

| パッケージ      | 責務                                                                 |
| --------------- | -------------------------------------------------------------------- |
| `admin/core`    | SNS 検証・Web Push 送信・サブスクリプション CRUD のビジネスロジック  |
| `admin/web`     | API Route・UI コンポーネント・`admin/core` の呼び出し               |
| `infra/admin`   | SNS トピック・DynamoDB テーブル・Secrets Manager・Lambda 権限設定   |

**注意**: Admin サービスはこれまで core パッケージを持たなかったが、本 Issue で通知ビジネスロジックを追加するにあたり `admin/core` を新設する。ビジネスロジック（テスト対象）と Web フレームワーク依存部分を分離することで、ユニットテストの容易性を確保する。

### 実装モジュール一覧

**admin/core（新設）**

| モジュール               | パス                                              | 役割                                       |
| ------------------------ | ------------------------------------------------- | ------------------------------------------ |
| `snsValidator`           | `core/src/notify/sns-validator.ts`                | SNS メッセージ検証（`@aws-sdk/sns-message-validator` ラップ） |
| `webPushSender`          | `core/src/notify/web-push-sender.ts`              | Web Push 送信（`web-push` ライブラリ使用）  |
| `subscriptionRepository` | `core/src/notify/subscription-repository.ts`     | DynamoDB へのサブスクリプション CRUD       |

**admin/web**

| モジュール               | パス                                              | 役割                                       |
| ------------------------ | ------------------------------------------------- | ------------------------------------------ |
| `SNS Route`              | `web/src/app/api/notify/sns/route.ts`             | SNS 通知受信エンドポイント                 |
| `subscribe Route`        | `web/src/app/api/notify/subscribe/route.ts`       | サブスクリプション登録（POST）・削除（DELETE） |
| `vapid-key Route`        | `web/src/app/api/notify/vapid-key/route.ts`       | VAPID 公開鍵返却                           |
| `NotifyButton`           | `web/src/components/notify/NotifyButton.tsx`      | 通知許可ボタン（`admin` ロール保持者のみ表示）|
| `service-worker`         | `web/public/sw-push.js`                           | `push` イベントで通知を表示する SW ロジック |

**infra/admin**

| モジュール             | パス                                            | 役割                                           |
| ---------------------- | ----------------------------------------------- | ---------------------------------------------- |
| `SnsStack`             | `infra/admin/lib/sns-stack.ts`                  | Admin 専用 SNS トピック                        |
| `DynamoDBStack`        | `infra/admin/lib/dynamodb-stack.ts`             | Single Table Design テーブル（GSI 含む）       |
| `SecretsStack`         | `infra/admin/lib/secrets-stack.ts`              | VAPID 秘密鍵用 Secrets Manager リソース作成   |
| `AdminStack 更新`      | `infra/admin/lib/admin-stack.ts`                | 各スタックを組み込む                           |
| `Lambda 権限更新`      | `infra/admin/lib/lambda-stack.ts`               | DynamoDB・Secrets Manager 読み書き権限         |
| `bin/admin.ts 更新`    | `infra/admin/bin/admin.ts`                      | 新スタックのインスタンス化                     |

### モジュール間インターフェース

SNS からの通知フロー:

```
SNS
  → POST /api/notify/sns
    → snsValidator.validate(message)       // core
    → subscriptionRepository.findAll()     // core
    → webPushSender.sendAll(subs, payload) // core
```

ブラウザからのサブスクリプション登録フロー:

```
NotifyButton（クリック）
  → requirePermission(session.roles, 'notifications:write')
  → navigator.serviceWorker.register('/sw-push.js')
  → PushManager.subscribe({ applicationServerKey: vapidPublicKey })
  → POST /api/notify/subscribe
    → subscriptionRepository.save(subscription) // core
```

---

## 実装上の注意点

### 依存関係・前提条件

- `@aws-sdk/sns-message-validator` を Admin core に追加する（SNS 署名検証）
- `web-push` npm パッケージを Admin core に追加する（VAPID + Web Push 送信）
- VAPID 鍵ペアは `web-push.generateVAPIDKeys()` で生成し、Secrets Manager に値を手動入力する
- SNS HTTP サブスクリプションは CDK の `subscriptions.UrlSubscription` でプロビジョニングできる（CDK 対応）
- Admin Lambda に `dynamodb:PutItem`, `dynamodb:GetItem`, `dynamodb:Scan`, `dynamodb:DeleteItem`, `dynamodb:Query` と `secretsmanager:GetSecretValue` の権限を付与する

### SNS サブスクリプションのプロビジョニング

CDK の `aws-cdk-lib/aws-sns-subscriptions` を使用して Lambda URL へのサブスクリプションを自動登録できる:

```typescript
import * as sns_subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';

snsTopic.addSubscription(
  new sns_subscriptions.UrlSubscription('https://admin.nagiyu.com/api/notify/sns', {
    protocol: sns.SubscriptionProtocol.HTTPS,
  })
);
```

### Secrets Manager の管理方針

CDK でリソースを作成し、値は初回デプロイ後に手動で入力する:

```typescript
// infra/admin/lib/secrets-stack.ts
const vapidSecret = new secretsmanager.Secret(this, 'VapidSecret', {
  secretName: `nagiyu-admin-vapid-${environment}`,
  description: 'VAPID key pair for Web Push (populate manually after deploy)',
  secretStringValue: cdk.SecretValue.unsafePlainText(
    JSON.stringify({ publicKey: 'REPLACE_ME', privateKey: 'REPLACE_ME' })
  ),
});
```

デプロイ後に `web-push.generateVAPIDKeys()` で生成した値を AWS Console または AWS CLI で更新する。

### VAPID 鍵管理

- VAPID 公開鍵はフロントエンドに公開してよい（`/api/notify/vapid-key` で返す）
- VAPID 秘密鍵は Secrets Manager から取得し、Lambda のコールドスタート対策としてモジュールスコープでキャッシュする

### Web Push の失敗処理

サブスクリプションの期限切れ（`410 Gone`）や無効（`404 Not Found`）の場合、DynamoDB から該当レコードを削除する。

---

## docs/ への移行メモ

- [ ] `docs/services/admin/architecture.md` に ADR として追記すること:
      「SNS → Admin HTTP Endpoint → Web Push による管理者通知フロー」と「VAPID 鍵の Secrets Manager 管理」
- [ ] `docs/services/admin/requirements.md` に F-001〜F-010 の機能要件を統合すること
- [ ] `libs/common/src/auth/types.ts` に `notifications:write` 権限を追加後、`docs/development/shared-libraries.md` の権限一覧を更新すること
- [ ] 将来の CloudWatch Alarms 追加時に使用するトピック ARN を `docs/infra/` または `docs/services/admin/` に記載する
