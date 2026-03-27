# コード共通化調査・対応 - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-2396-code-consolidation/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/issue-2396-code-consolidation/requirements.md — 受け入れ条件・ユースケース
    - tasks/issue-2396-code-consolidation/design.md — 設計方針・コンポーネント設計
-->

## Phase 1: 事前調査・影響範囲確認

<!-- 実装前に変更範囲と既存テストの状態を確認する -->

- [ ] T001: `libs/nextjs/src/error.ts` の現在の実装と公開 API を確認する（依存: なし）
- [ ] T002: `libs/common/src/api/types.ts` の `ErrorResponse` 型の定義を確認し、各サービスのローカル定義との互換性を検証する（依存: なし）
- [ ] T003: admin/batch/core の `DynamoDBPushSubscriptionRepository` の実装を確認し、`AbstractDynamoDBRepository` を継承しているか検証する（依存: なし）
- [ ] T004: stock-tracker の Repository 実装と Factory パターンの使用状況を確認する（依存: なし）
- [ ] T005: 各サービスの既存テストを実行し、ベースラインを確認する（依存: なし）

## Phase 2: `createErrorResponse()` 関数の共通化（優先度: 高）

<!-- libs/nextjs に統合し、admin の重複実装を削除する -->

- [ ] T006: `libs/nextjs/src/error.ts` に `createErrorResponse(status, error, message)` 関数を export として追加する（依存: T001）
- [ ] T007: `libs/nextjs/src/index.ts` に `createErrorResponse` を再 export する（未 export の場合のみ）（依存: T006）
- [ ] T008: `services/admin/web/src/app/api/notify/subscribe/route.ts` のローカル `createErrorResponse()` を削除し、`@nagiyu/nextjs` から import する形に変更する（依存: T007）
- [ ] T009: `services/admin/web/src/app/api/notify/sns/route.ts` のローカル `createErrorResponse()` を削除し、`@nagiyu/nextjs` から import する形に変更する（依存: T007）
- [ ] T010: `libs/nextjs` のユニットテストを追加して `createErrorResponse()` の動作を検証する（依存: T006）
- [ ] T011: admin/web のビルドとテストを実行して動作を確認する（依存: T008, T009, T010）

## Phase 3: Web Push ラッパーの除去（優先度: 高）

<!-- 両サービスの sendNotification() ラッパーを除去し、sendWebPushNotification() を直接呼び出す形に統一する -->

- [ ] T012: niconico-mylist-assistant/batch と stock-tracker/batch の VAPID subject を `mailto:support@nagiyu.com` にプロジェクト共通でハードコード統一する（依存: なし）
- [ ] T013: `services/niconico-mylist-assistant/batch/src/lib/web-push-client.ts` の `sendNotification()` を削除し、ペイロード生成関数のみ残す（依存: T012）
- [ ] T014: `services/niconico-mylist-assistant/batch/src/index.ts` の `sendNotification()` 呼び出しを `sendWebPushNotification(pushSubscription, payload, vapidConfig)` に変更する（依存: T013）
- [ ] T015: `services/stock-tracker/batch/src/lib/web-push-client.ts` の `sendNotification()` を削除し、ペイロード生成関数のみ残す（依存: T012）
- [ ] T016: `services/stock-tracker/batch/src/minute.ts`, `hourly.ts` の `sendNotification(alert, ...)` 呼び出しを `sendWebPushNotification(alert.subscription, payload, vapidConfig)` に変更する（依存: T015）
- [x] T017: niconico-mylist-assistant/batch および stock-tracker/batch のテストを実行して動作を確認する（依存: T014, T016）

## Phase 4: `ErrorResponse` 型の共通化（優先度: 中）

<!-- ローカル型定義を libs/common の共通型に統一する -->

- [ ] T018: `libs/common/src/api/types.ts` の `ErrorResponse` 型が各サービスのローカル定義と互換性を持つことを確認する（依存: T002）
- [ ] T019: `services/codec-converter/web/src/app/api/jobs/route.ts` のローカル `interface ErrorResponse` を削除し、`@nagiyu/common` から import する（依存: T018）
- [ ] T020: `services/niconico-mylist-assistant/web/src/app/api/mylist/register/route.ts` のローカル `interface ErrorResponse` を削除し、`@nagiyu/common` から import する（依存: T018）
- [ ] T021: その他のサービスのローカル `ErrorResponse` 定義を調査し、同様に統一する（依存: T018）
- [ ] T022: 変更対象サービスのビルドとテストを実行して動作を確認する（依存: T019, T020, T021）

## Phase 5: Repository Factory パターンの統一（優先度: 中）

<!-- createRepositoryFactory() の適用を拡大する -->

- [ ] T023: admin の `DynamoDBPushSubscriptionRepository` が `AbstractDynamoDBRepository` を継承しているか確認し、未継承の場合は修正する（依存: T003）
- [ ] T024: admin の Repository Factory 実装を `createRepositoryFactory()` を使用する形に変更する（依存: T023）
- [ ] T025: stock-tracker の Repository Factory 実装を `createRepositoryFactory()` を使用する形に変更する（依存: T004）
- [ ] T026: admin/core および stock-tracker/core のビルドとテストを実行して動作を確認する（依存: T024, T025）

## Phase 6: 最終確認・ドキュメント更新

<!-- 全変更の統合確認とドキュメント更新 -->

- [ ] T027: 全変更を統合し、モノレポ全体のビルドが通ることを確認する（依存: T011, T017, T022, T026）
- [ ] T028: テストカバレッジが 80% 以上であることを確認する（依存: T027）
- [ ] T029: `docs/development/shared-libraries.md` に追加・変更した API を反映する（依存: T027）
- [ ] T030: `docs/development/architecture.md` に共通化の ADR を追記する（依存: T027）

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件をすべて満たしている
- [ ] テストカバレッジ 80% 以上（変更した `libs/` パッケージ）
- [ ] Lint・型チェックがすべて通過している
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `docs/development/shared-libraries.md` を更新した
- [ ] `docs/development/architecture.md` を更新した
- [ ] `tasks/issue-2396-code-consolidation/` ディレクトリを削除した
