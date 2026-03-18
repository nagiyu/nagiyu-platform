# Admin エラー検知 - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-2228-admin-error-notify/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/issue-2228-admin-error-notify/requirements.md — 受け入れ条件・ユースケース
    - tasks/issue-2228-admin-error-notify/design.md — API 仕様・データモデル・コンポーネント設計
-->

## Phase 0: 共通ライブラリ更新

- [x] `libs/common/src/auth/types.ts` に `notifications:write` を Permission 型へ追加する
- [x] `libs/common/src/auth/roles.ts` の `admin` ロールに `notifications:write` 権限を追加する
- [x] `libs/common` のユニットテストを更新する（`notifications:write` が admin ロールに含まれること）

## Phase 1: インフラ構築

- [x] `infra/admin/lib/sns-stack.ts` を新規作成し、Admin 専用 SNS トピック (`nagiyu-admin-alarms-{env}`) を定義する（F-001）
- [x] `infra/admin/lib/dynamodb-stack.ts` を新規作成し、Single Table Design テーブル (`nagiyu-admin-main-{env}`) を定義する。GSI（UserIndex・EndpointIndex）も含める（F-008）
- [x] `infra/admin/lib/secrets-stack.ts` を新規作成し、VAPID 秘密鍵用 Secrets Manager リソースをプレースホルダー値で作成する（F-001 相当・CDK 管理）
- [x] `infra/admin/lib/sns-stack.ts` に CDK UrlSubscription で SNS → Admin HTTPS エンドポイントのサブスクリプションを追加する
- [x] `infra/admin/lib/admin-stack.ts` を更新して `SnsStack`・`DynamoDBStack`・`SecretsStack` を組み込む
- [x] `infra/admin/lib/lambda-stack.ts` を更新し、DynamoDB（PutItem, GetItem, Scan, DeleteItem, Query）と Secrets Manager（GetSecretValue）の権限を Lambda ロールに追加する（F-010）
- [x] `infra/admin/bin/admin.ts` を更新して新スタックをインスタンス化する
- [ ] CDK デプロイ後（CI による自動デプロイ）に Secrets Manager の VAPID 鍵ペア値（`web-push.generateVAPIDKeys()` で生成）を手動で更新する

## Phase 2: admin/core 新設・バックエンド実装

- [x] `services/admin/core/` を新設し、`package.json`・`tsconfig.json` を設定する
- [x] `sns-validator` と `web-push` を `services/admin/core` に追加する
- [x] `core/src/notify/sns-validator.ts` を実装する: `sns-validator` を使った SNS メッセージ検証（F-003）
- [x] `core/src/notify/sns-validator.ts` のユニットテストを追加する（正常系・署名不正）
- [x] `core/src/notify/subscription-repository.ts` を実装する: DynamoDB（Single Table）へのサブスクリプション CRUD（F-004）
- [x] `core/src/notify/subscription-repository.ts` のユニットテストを追加する
- [x] `core/src/notify/web-push-sender.ts` を実装する: VAPID 認証付き Web Push 一斉送信、失敗時の期限切れサブスクリプション削除（F-005）
- [x] `core/src/notify/web-push-sender.ts` のユニットテストを追加する（送信成功・410 Gone 時のサブスクリプション削除）
- [x] `services/admin/web` が `admin/core` に依存するよう `package.json` を更新する
- [x] `web/src/app/api/notify/sns/route.ts` を実装する: `SubscriptionConfirmation` / `Notification` / `UnsubscribeConfirmation` の分岐処理（F-002）
- [x] `web/src/app/api/notify/subscribe/route.ts` を実装する: POST でサブスクリプション登録・DELETE で削除（認可: `notifications:write`）（F-004）
- [x] `web/src/app/api/notify/vapid-key/route.ts` を実装する: VAPID 公開鍵を返す（認証不要）（F-005）

## Phase 3: フロントエンド（PWA・通知購読）

- [x] `web/public/sw-push.js` を実装する: `push` イベントを受け取り `showNotification` でシステム通知を表示、通知タップでダッシュボードを開く（F-006）
- [x] `next.config.ts` でサービスワーカーファイルのキャッシュ除外設定を追加する
- [x] `web/src/components/notify/NotifyButton.tsx` を実装する: 通知許可ダイアログ呼び出し → PushSubscription 取得 → `/api/notify/subscribe` POST（F-007）
- [x] ダッシュボードページ (`web/src/app/(protected)/dashboard/page.tsx`) に `NotifyButton` を追加する。`hasPermission(user.roles, 'notifications:write')` が true のときのみ表示する（F-007）

## Phase 4: 既存アラームの移行（Stock Tracker）

- [ ] `infra/stock-tracker/lib/cloudwatch-alarms-stack.ts` を更新して、既存アラームに Admin SNS トピックへのアクション追加を行う（既存トピックは維持する）（F-009）
- [ ] `infra/stock-tracker/bin/stock-tracker.ts` を更新して Admin SNS トピック ARN を受け渡す

## Phase 5: 動作確認

- [ ] SNS テスト送信でプッシュ通知が届くことを確認する

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件をすべて満たしている
- [ ] テストカバレッジ 80% 以上（`admin/core/src/`）
- [ ] Lint・型チェックがすべて通過している
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `docs/services/admin/requirements.md`・`architecture.md` を更新した
- [ ] `tasks/issue-2228-admin-error-notify/` ディレクトリを削除した
