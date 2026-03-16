# Admin エラー検知 - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-2228-admin-error-notify/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/issue-2228-admin-error-notify/requirements.md — 受け入れ条件・ユースケース
    - tasks/issue-2228-admin-error-notify/design.md — API 仕様・データモデル・コンポーネント設計
-->

## Phase 1: インフラ構築

- [ ] `infra/admin/lib/sns-stack.ts` を新規作成し、Admin 専用 SNS トピック (`nagiyu-admin-alarms-{env}`) を定義する（F-001）
- [ ] `infra/admin/lib/dynamodb-stack.ts` を新規作成し、プッシュサブスクリプション保存用テーブル (`nagiyu-admin-push-subscriptions-{env}`) を定義する。GSI（userId）も含める（F-008）
- [ ] `infra/admin/lib/admin-stack.ts` を更新して `SnsStack`・`DynamoDBStack` を組み込む
- [ ] `infra/admin/lib/lambda-stack.ts` を更新し、DynamoDB（PutItem, GetItem, Scan, DeleteItem）と Secrets Manager（GetSecretValue）の権限を Lambda ロールに追加する（F-010）
- [ ] `infra/admin/bin/admin.ts` を更新して新スタックをインスタンス化する
- [ ] Secrets Manager に VAPID 鍵ペアを登録するための手順を `design.md` に補足する（CDK 外の手動ステップ）

## Phase 2: SNS 受信・プッシュ送信（バックエンド）

- [ ] `web-push` パッケージを `services/admin/web` に追加する（依存: Phase 1 完了後）
- [ ] `web/src/lib/notify/sns-sig-verifier.ts` を実装する: SNS 署名検証ロジック（F-003）
- [ ] `web/src/lib/notify/subscription-repository.ts` を実装する: DynamoDB へのサブスクリプション CRUD（F-004）
- [ ] `web/src/lib/notify/web-push-sender.ts` を実装する: VAPID 認証付き Web Push 一斉送信、失敗時の期限切れサブスクリプション削除（F-005）
- [ ] `web/src/app/api/notify/sns/route.ts` を実装する: `SubscriptionConfirmation` / `Notification` / `UnsubscribeConfirmation` の分岐処理（F-002）
- [ ] `web/src/app/api/notify/subscribe/route.ts` を実装する: POST でサブスクリプション登録・DELETE で削除（F-004）
- [ ] `web/src/app/api/notify/vapid-key/route.ts` を実装する: VAPID 公開鍵を返す（認証不要）（F-005）

## Phase 3: フロントエンド（PWA・通知購読）

- [ ] `web/public/sw-push.js` を実装する: `push` イベントを受け取り `showNotification` でシステム通知を表示、通知タップでダッシュボードを開く（F-006）
- [ ] `next.config.ts` でサービスワーカーファイルのキャッシュ除外設定を追加する
- [ ] `web/src/components/notify/NotifyButton.tsx` を実装する: 通知許可ダイアログ呼び出し → PushSubscription 取得 → `/api/notify/subscribe` POST（F-007）
- [ ] ダッシュボードページ (`web/src/app/(protected)/dashboard/page.tsx`) に `NotifyButton` を追加する（F-007）

## Phase 4: 既存アラームの移行（Stock Tracker）

- [ ] `infra/stock-tracker/lib/sns-stack.ts` を更新して Admin SNS トピック ARN を Props で受け取れるようにする（F-009）
- [ ] `infra/stock-tracker/lib/cloudwatch-alarms-stack.ts` を更新して、既存アラームに Admin SNS トピックへのアクション追加を行う（既存トピックは維持する）（F-009）
- [ ] `infra/stock-tracker/bin/stock-tracker.ts` を更新して Admin SNS トピック ARN を受け渡す

## Phase 5: テスト・動作確認

- [ ] `web/src/lib/notify/sns-sig-verifier.ts` のユニットテストを追加する（正常系・署名不正・証明書 URL 不正）
- [ ] `web/src/lib/notify/web-push-sender.ts` のユニットテストを追加する（送信成功・410 Gone 時のサブスクリプション削除）
- [ ] `web/src/lib/notify/subscription-repository.ts` のユニットテストを追加する
- [ ] dev 環境にデプロイし、SNS テスト送信でプッシュ通知が届くことを確認する
- [ ] SNS サブスクリプションを Admin 用 HTTP エンドポイントに登録する（手動または AWS CLI）

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件をすべて満たしている
- [ ] テストカバレッジ 80% 以上（`web/src/lib/notify/`）
- [ ] Lint・型チェックがすべて通過している
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `docs/services/admin/requirements.md`・`architecture.md` を更新した
- [ ] `tasks/issue-2228-admin-error-notify/` ディレクトリを削除した
