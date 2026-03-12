# 通知の改善

## 概要

Stock Tracker の Web Push 通知を改善する。
通知クリック時にチャート画面へ遷移し、対象の取引所・ティッカーが選択された状態で表示できるようにする。
また、アラートの追加・編集ダイアログで通知内容（タイトル・本文）を自由に設定できるようにする。

## 関連情報

-   Issue: #2040
-   タスクタイプ: サービスタスク（Stock Tracker）
-   対象サービス: `services/stock-tracker/`

## 要件

### 機能要件

-   **FR1**: 通知クリック時、トップ画面（チャート画面 `/`）に遷移する
-   **FR2**: 遷移先では、通知元アラートの取引所・ティッカーが選択済みの状態で表示される
-   **FR3**: アラートの追加・編集ダイアログに「通知タイトル」と「通知本文」の任意入力フィールドを追加する
-   **FR4**: 入力が空の場合は既存の自動生成内容（`createAlertNotificationPayload` の生成ロジック）をデフォルト値として使用する

### 非機能要件

-   **NFR1**: TypeScript strict mode を維持すること
-   **NFR2**: テストカバレッジ 80% 以上を維持すること
-   **NFR3**: 既存のアラートデータ（DynamoDB）との後方互換性を保つこと（新規フィールドはオプショナル）

## 実装のヒント

### 1. 通知クリック時のナビゲーション（FR1・FR2）

**Service Worker (`public/sw.js`)**

-   現在: `event.notification.data?.url || '/alerts'` でアラート一覧に遷移
-   変更: `notification.data.url` にチャート画面 URL（`/?exchangeId=XXX&tickerId=YYY`）を含める

**バッチ側通知ペイロード生成 (`batch/src/lib/web-push-client.ts`)**

-   `createAlertNotificationPayload()` の `data` フィールドに `url` を追加する
-   `url` は `/?exchangeId=${alert.ExchangeID}&tickerId=${alert.TickerID}` 形式で構築する
    -   現在の `data` には `exchangeId` が含まれていないため追加が必要

**チャート画面 (`web/components/HomePageClient.tsx`)**

-   URL クエリパラメータ（`exchangeId`, `tickerId`）を読み取り、初期選択状態に反映する
-   クライアントコンポーネントのため `useSearchParams`（`next/navigation`）を使用する
-   取引所一覧取得後、クエリパラメータと一致する取引所を初期選択する
-   ティッカー一覧取得後、クエリパラメータと一致するティッカーを初期選択する

### 2. 通知内容のカスタマイズ（FR3・FR4）

**エンティティ (`core/src/entities/alert.entity.ts`)**

-   `AlertEntity` に任意フィールドを追加:
    -   `NotificationTitle?: string` — カスタム通知タイトル
    -   `NotificationBody?: string` — カスタム通知本文
-   `UpdateAlertInput` の `Pick` にも追加すること

**マッパー (`core/src/mappers/alert.mapper.ts`)**

-   `toItem()`: フィールドが存在する場合のみ DynamoDB アイテムに追加する（`LogicalOperator` や `Temporary` の扱いと同様）
-   `fromItem()`: オプショナルフィールドとして読み取る

**アラートダイアログ (`web/components/AlertSettingsModal.tsx`)**

-   `FormData` 型に `notificationTitle: string` と `notificationBody: string` を追加
-   フォーム初期値は空文字列
-   編集時は既存のアラートの値をフォームに反映する
-   UI は「通知設定（任意）」のセクションとして末尾に配置する
-   プレースホルダーに自動生成される内容の例を表示し、空欄の場合は自動生成を使用することを明示する

**API ルート (`web/app/api/alerts/route.ts`, `[id]/route.ts`)**

-   リクエストボディ型（`CreateAlertRequest`, `UpdateAlertRequest`）に `notificationTitle?` と `notificationBody?` を追加する

**バッチ通知生成 (`batch/src/lib/web-push-client.ts`)**

-   `createAlertNotificationPayload()` で `alert.NotificationTitle` / `alert.NotificationBody` が存在する場合はその値を使用する
-   存在しない場合は既存の自動生成ロジックを使用する

## タスク

### Phase 1: コアエンティティの更新

-   [ ] T001: `core/src/entities/alert.entity.ts` に `NotificationTitle?` と `NotificationBody?` を追加
-   [ ] T002: `core/src/mappers/alert.mapper.ts` の `toItem()` / `fromItem()` を更新
-   [ ] T003: `core` のユニットテストを更新・追加

### Phase 2: バッチ側の更新

-   [ ] T004: `batch/src/lib/web-push-client.ts` の `createAlertNotificationPayload()` に `url` フィールドを追加
-   [ ] T005: `batch/src/lib/web-push-client.ts` でカスタム通知タイトル・本文を使用するよう更新
-   [ ] T006: `batch` のユニットテストを更新・追加

### Phase 3: フロントエンド（Web）の更新

-   [ ] T007: `web/public/sw.js` の `notificationclick` ハンドラーが `data.url` を使用することを確認（既存実装のまま動作するはず）
-   [ ] T008: `web/components/HomePageClient.tsx` に `useSearchParams` によるクエリパラメータ読み取り・初期選択を追加
-   [ ] T009: `web/components/AlertSettingsModal.tsx` にカスタム通知タイトル・本文の入力フィールドを追加
-   [ ] T010: `web/app/api/alerts/route.ts` および `[id]/route.ts` のリクエスト型を更新
-   [ ] T011: `web` のユニットテストおよび E2E テストを更新・追加

### Phase 4: 動作確認

-   [ ] T012: アラート作成時にカスタム通知内容が保存されることを確認
-   [ ] T013: アラート発火時に通知ペイロードの `url` が正しく設定されることを確認
-   [ ] T014: 通知クリック後にチャート画面へ遷移し、対象取引所・ティッカーが選択されることを確認

## 参考ドキュメント

-   [要件定義書](../docs/services/stock-tracker/requirements.md)
-   [アーキテクチャ](../docs/services/stock-tracker/architecture.md)
-   [コーディング規約](../docs/development/rules.md)
-   [テスト戦略](../docs/development/testing.md)

## 備考・未決定事項

-   `HomePageClient.tsx` は現在 `'use client'` コンポーネントのため `useSearchParams` を使用可能だが、`Suspense` でラップが必要な場合がある（Next.js の要件に応じて調整）
-   通知本文のデフォルト値をフォームのプレースホルダーとして動的に生成するか、静的な説明文にするかは実装者が判断する
-   既存の DynamoDB テーブルにスキーマ変更は不要（新規フィールドはオプショナルなため）
