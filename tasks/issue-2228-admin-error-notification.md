# Admin エラー検知プッシュ通知

## 概要

CloudWatch Alarms が検知したエラーを、Admin サービスをダウンロードしている端末へ
Web Push 通知として届ける仕組みを構築する。

現状は SNS → メール（手動サブスクリプション）のみ対応しているが、
本タスクでは以下の流れを実現する。

```
CloudWatch Alarm → SNS トピック(Admin 用) → Admin API エンドポイント → Web Push → 端末
```

- Admin インフラに SNS トピック・CloudWatch アラームを新設する
- Admin サービスに SNS サブスクリプション受信エンドポイントを追加する
- Admin サービスに Web Push サブスクリプション管理機能を追加する
- Admin PWA から通知許可を取得し、端末にプッシュ通知を届ける
- 将来の CloudWatch Logs 追加時は、異常時に今回追加するトピックへ通知するルールを標準化する
- 既存の Stock Tracker アラームも段階的に Admin トピックへ移行する

## 関連情報

- Issue: #2228
- サブタスク Issue: #2229
- タスクタイプ: サービスタスク（Admin）＋インフラタスク

## 要件

### 機能要件

- FR1: Admin インフラに `nagiyu-admin-alarms-{environment}` SNS トピックを作成する
- FR2: SNS トピックのサブスクリプションとして Admin サービスの受信エンドポイントを登録する（HTTPS）
- FR3: Admin サービスに SNS メッセージを受け取る API エンドポイント（`/api/push/alarm`）を追加する
- FR4: エンドポイントは SNS サブスクリプション確認（SubscriptionConfirmation）と
  通知（Notification）の両メッセージタイプを処理する
- FR5: Admin サービスに Web Push サブスクリプション管理 API（登録・解除・更新）を追加する
- FR6: Admin PWA に Service Worker を追加し、通知許可リクエストとプッシュ受信を実装する
- FR7: Admin ダッシュボードに通知許可ボタン（`NotificationPermissionButton` 相当）を配置する
- FR8: Admin Lambda に対して CloudWatch アラームを設定し、異常時に上記 SNS トピックへ通知する
  （エラー率・実行時間・スロットリングを最低限対象とする）
- FR9: 将来の CloudWatch Logs 追加時には、今回の SNS トピックへアラームを向けることをルールとして文書化する
- FR10: Stock Tracker の既存 CloudWatch アラームを段階的に Admin トピックにも通知するよう移行する

### 非機能要件

- NFR1: SNS → Admin エンドポイントの通信は HTTPS のみ（CloudFront 経由）
- NFR2: SNS SubscriptionConfirmation の自動確認処理はタイムアウト以内（5 秒以内）に完了させる
- NFR3: プッシュ通知の送信失敗は握りつぶさず、ログ出力する
- NFR4: VAPID キーは Secrets Manager で管理し、ハードコードしない
- NFR5: Web Push サブスクリプション情報（endpoint・keys）は DynamoDB で永続化する
- NFR6: Admin サービスのビジネスロジック（`lib/`）のテストカバレッジ 80% 以上を維持する
- NFR7: 既存の `nagiyu-stock-tracker-alarms-{environment}` トピックは削除せず、
  メール通知との共存を維持する

## 実装のヒント

### インフラ設計

#### Admin SNS スタック（新設）

`infra/admin/lib/sns-stack.ts` を新規作成する。
Stock Tracker の `infra/stock-tracker/lib/sns-stack.ts` と同様の構造で、
トピック名を `nagiyu-admin-alarms-{environment}` とする。

HTTPS サブスクリプションは Admin の Lambda URL（CloudFront 経由）に向ける。
CDK では `aws-sns-subscriptions` の `UrlSubscription` を使用する。
確認 URL には SNS が GET リクエストを送るため、エンドポイントは SubscriptionConfirmation を
処理できる必要がある。

#### Admin CloudWatch アラームスタック（新設）

`infra/admin/lib/cloudwatch-alarms-stack.ts` を新規作成する。
Stock Tracker の `infra/stock-tracker/lib/cloudwatch-alarms-stack.ts` を参考に、
Admin Lambda（Web 関数のみ）のエラー率・実行時間・スロットリングアラームを設定する。

#### Admin スタックへの組み込み

`infra/admin/lib/admin-stack.ts` および `infra/admin/bin/admin.ts` を更新して
SNS スタックと CloudWatch アラームスタックを組み込む。

#### Stock Tracker からの移行（段階的）

`infra/stock-tracker/lib/cloudwatch-alarms-stack.ts` の各アラームに、
既存の `alarmTopic`（Stock Tracker 用）に加えて Admin トピックの SNS アクションも追加する。
Admin トピックの ARN はスタックのプロパティとして外部から注入し、
Stock Tracker スタックが Admin スタックに直接依存しないよう注意する（SSM Parameter Store や
CloudFormation Output 経由での参照が望ましい）。

### Admin サービス設計

#### SNS 受信エンドポイント（`/api/push/alarm`）

`services/admin/web/src/app/api/push/alarm/route.ts` として追加する。

SNS からの POST リクエストを受け取る。リクエストボディのタイプに応じて処理を分岐する。

- `SubscriptionConfirmation`: SNS が POST で送ってくる `SubscribeURL` に対して
  サーバーサイドから GET リクエストを送り、サブスクリプション確認を完了させる
- `Notification`: メッセージ内容を解析し、登録済みサブスクリプションへ Web Push 送信する

SNS メッセージの信頼性確認（署名検証）は、`x-amz-sns-message-type` ヘッダーと
`TopicArn` フィールドを照合する最低限の検証を行う。
より厳密な署名検証が必要な場合は `備考・未決定事項` を参照。

エンドポイントへの認証は不要（SNS からのコールバックのため）だが、
IP 制限や WAF ルールで SNS の IP レンジからのみ受け付けることを検討する。

#### Web Push サブスクリプション管理 API

Stock Tracker の `app/api/push/subscribe/route.ts` と同様のパターンで実装する。

| エンドポイント                  | メソッド | 説明                     |
| ------------------------------- | -------- | ------------------------ |
| `/api/push/subscribe`           | POST     | サブスクリプション登録   |
| `/api/push/unsubscribe`         | POST     | サブスクリプション解除   |

サブスクリプション情報（endpoint・p256dh・auth）は DynamoDB テーブルに保存する。
Admin ユーザーのみが登録可能なため、認証チェックを必須とする。

VAPID キーは Secrets Manager から取得し、Lambda の環境変数経由で渡す。
キーの正規化には既存の `@nagiyu/common` の `normalizeVapidKey` ユーティリティを使用する。

#### Web Push 送信ロジック

`services/admin/web/src/lib/push/` 配下に配置する。
Stock Tracker の `batch/src/lib/web-push-client.ts` を参考に実装する。

- VAPID キー設定・送信は `web-push` ライブラリ（既存サービスで使用実績あり）を利用する
- 送信対象は DynamoDB に登録されている全サブスクリプション
- 410/404 エラー時はサブスクリプションを削除（無効なエンドポイントの掃除）
- 送信失敗は `@nagiyu/common` の `logger.error` でログ出力する

通知ペイロードは SNS メッセージの `Subject` と `Message` を元に生成する。
CloudWatch Alarm の通知形式（JSON 文字列）を解析してわかりやすい日本語メッセージに整形する。

#### DynamoDB テーブル設計

Admin サービス専用の DynamoDB テーブルを新設する。
テーブル名: `nagiyu-admin-push-subscriptions-{environment}`

| 属性名       | 型     | 説明                                |
| ------------ | ------ | ----------------------------------- |
| UserId       | String | パーティションキー（Auth サービスの JWT から取得するユーザー ID。`src/lib/auth/session.ts` 経由で参照）|
| Endpoint     | String | ソートキー（Push エンドポイント URL）|
| P256dh       | String | 暗号化キー                          |
| Auth         | String | 認証シークレット                    |
| CreatedAt    | String | 登録日時（ISO 8601）                |
| UpdatedAt    | String | 更新日時（ISO 8601）                |

#### PWA・フロントエンド

Service Worker ファイル（`public/sw.js`）を追加し、
`push` イベントを受け取って `showNotification` を呼び出す。

`ServiceWorkerRegistration` コンポーネントを追加し、レイアウトで読み込む。
Stock Tracker の `components/ServiceWorkerRegistration.tsx` および
Niconico Mylist Assistant の同コンポーネントが参考になる。

通知許可ボタン（`NotificationPermissionButton` 相当）をダッシュボードに配置する。
許可後に `/api/push/subscribe` を呼び出してサブスクリプションを登録する。
VAPID 公開鍵は環境変数（`NEXT_PUBLIC_VAPID_PUBLIC_KEY`）で渡す。

### ルール文書化

`docs/development/cloudwatch-alarm-guidelines.md`（仮称）を新設し、
今後 CloudWatch Logs を追加する際のアラーム設定ルールをまとめる。

- 異常時の通知先に `nagiyu-admin-alarms-{environment}` トピックを含めること
- アラーム名の命名規則（`{service}-{function}-{metric}-{environment}`）
- `treatMissingData: NOT_BREACHING` を標準設定とすること

## タスク

### Phase 1: インフラ整備

- [ ] T001: `infra/admin/lib/sns-stack.ts` を新規作成する（Admin アラームトピック）
- [ ] T002: `infra/admin/lib/cloudwatch-alarms-stack.ts` を新規作成する（Admin Lambda アラーム）
- [ ] T003: `infra/admin/lib/admin-stack.ts` および `bin/admin.ts` を更新して T001/T002 を組み込む
- [ ] T004: Admin Lambda の IAM ロールに DynamoDB・Secrets Manager アクセス権限を追加する
- [ ] T005: Admin 用 DynamoDB テーブル（push-subscriptions）を CDK スタックに追加する

### Phase 2: Admin サービス — バックエンド

- [ ] T006: Web Push サブスクリプション DynamoDB リポジトリを `src/lib/push/` に実装する
- [ ] T007: `/api/push/subscribe` エンドポイントを実装する（認証必須）
- [ ] T008: `/api/push/unsubscribe` エンドポイントを実装する（認証必須）
- [ ] T009: Web Push 送信ロジックを `src/lib/push/web-push-client.ts` に実装する
- [ ] T010: `/api/push/alarm` エンドポイントを実装する（SNS 受信・SubscriptionConfirmation 処理・Push 送信）
- [ ] T011: T006〜T010 のユニットテストを作成する（カバレッジ 80% 以上）

### Phase 3: Admin サービス — フロントエンド

- [ ] T012: `public/sw.js` に push イベントハンドラを実装する
- [ ] T013: `ServiceWorkerRegistration` コンポーネントを実装し、レイアウトに組み込む
- [ ] T014: `NotificationPermissionButton` コンポーネントを実装し、ダッシュボードに配置する

### Phase 4: SNS サブスクリプション登録

- [ ] T015: CDK `UrlSubscription` を使用して `nagiyu-admin-alarms-{environment}` トピックに
  Admin エンドポイントをサブスクリプション登録する（推奨）。
  CDK デプロイ時に自動確認フローが走るため、T010 の実装が完了してからデプロイすること。
  詳細は「備考・未決定事項」を参照。
- [ ] T016: 動作確認（テスト通知送信 → Admin 端末への Push 通知受信）

### Phase 5: Stock Tracker 移行（段階的）

- [ ] T017: `infra/stock-tracker/lib/cloudwatch-alarms-stack.ts` を更新し、
  Admin トピックへの SNS アクションを既存アラームに追加する
- [ ] T018: アラームなしの CloudWatch Logs グループにアラームを新設し、Admin トピックへ向ける
- [ ] T019: CloudWatch アラームガイドライン文書を `docs/development/` に追加する

## 参考ドキュメント

- `docs/services/admin/architecture.md` — Admin アーキテクチャ
- `docs/services/admin/requirements.md` — Admin 要件定義（Phase 2 の拡張方針を含む）
- `infra/stock-tracker/lib/sns-stack.ts` — SNS スタックの参考実装
- `infra/stock-tracker/lib/cloudwatch-alarms-stack.ts` — CloudWatch アラームスタックの参考実装
- `services/stock-tracker/web/app/api/push/subscribe/route.ts` — Push サブスクリプション API の参考実装
- `services/stock-tracker/batch/src/lib/web-push-client.ts` — Web Push 送信ロジックの参考実装
- `services/niconico-mylist-assistant/web/src/components/ServiceWorkerRegistration.tsx` — Service Worker コンポーネントの参考実装
- `libs/common/src/push/vapid.ts` — VAPID キー正規化ユーティリティ
- `docs/development/rules.md` — コーディング規約

## 備考・未決定事項

- **SNS 署名検証の要否**: SNS からのリクエストは署名付きだが、Admin エンドポイントでの厳密な署名検証を
  実施するか検討が必要。AWS が公開する証明書を取得して検証する方法（`sns-validator` ライブラリ等）と、
  CloudFront + WAF での IP 制限で代替する方法がある。
- **SNS サブスクリプション登録方法**: CDK `UrlSubscription` での自動登録を推奨する（IaC として一元管理できるため）。
  ただし、CDK デプロイ時に SNS が Admin エンドポイントへ SubscriptionConfirmation を送るため、
  T010 の実装とデプロイが完了してから SNS スタックをデプロイする必要がある。
  順序制御が難しい場合は初回のみ手動で SNS コンソールから登録し、
  確認後に CDK で管理する方法も許容する。
- **Stock Tracker 移行の優先度・スケジュール**: 既存の13個のアラームを段階的に移行する順番と
  タイムラインは別途調整が必要。
- **通知の重複防止**: Stock Tracker のアラームが Admin トピックにも向いた場合、
  メール通知と Push 通知の両方が届くことになる。管理者側での通知チャンネル設定機能が
  将来的に必要になる可能性がある。
- **Admin の Push 通知とエンドユーザーの Push 通知の分離**: Admin サービスの Push 通知は
  管理者向けのエラー通知であり、Stock Tracker のユーザー向けアラート通知とは性質が異なる。
  VAPID キーは Admin 専用のものを新規生成することを推奨する。
- **Service Worker と Next.js App Router の共存**: Next.js App Router（`app/` ディレクトリ）と
  Service Worker の登録方法については、Stock Tracker（Pages Router）と実装方法が異なる場合がある。
  `'use client'` ディレクティブと `navigator.serviceWorker` の利用に注意する。
