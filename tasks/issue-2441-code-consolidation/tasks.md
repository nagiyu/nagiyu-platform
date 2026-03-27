# コード共通化調査・対応 - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-2441-code-consolidation/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/issue-2441-code-consolidation/requirements.md — 受け入れ条件・ユースケース
    - tasks/issue-2441-code-consolidation/design.md — 重複実装の調査結果・技術設計
-->

## Phase 1: libs/common の拡張（高優先度）

<!-- libs/common に共通関数・型を追加し、重複の統合先を整備する -->

- [ ] T001: `libs/common/src/auth/types.ts` の `User` 型に `picture?: string` フィールドを追加する（依存: なし）
- [ ] T002: `libs/common/src/push/config.ts` を新規作成し `getVapidConfig()` 関数を実装する（依存: なし）
- [ ] T003: `libs/common/src/push/index.ts`（または既存の push モジュール export ファイル）に `getVapidConfig` を追加する（依存: T002）
- [ ] T004: `libs/common` のユニットテストに `getVapidConfig()` のテストを追加する（依存: T002）
- [ ] T005: `libs/common` のビルド・テスト・カバレッジチェックが通ることを確認する（依存: T001, T003, T004）

## Phase 2: 重複実装の削除（高優先度）

<!-- 各サービスの重複実装を削除し、libs/common を参照するよう変更する -->

- [ ] T006: `services/auth/core/src/db/types.ts` の `User` 独自定義を削除し、`@nagiyu/common` からの import に変更する（依存: T001）
- [ ] T007: `services/stock-tracker/core/src/services/auth.ts` で `checkPermission()` の呼び出し箇所を特定する（依存: なし）
- [ ] T008: `checkPermission()` の呼び出し箇所を `libs/common` の `hasPermission()` の直接呼び出しに変更する（依存: T007）
- [ ] T009: `services/stock-tracker/core/src/services/auth.ts` の `checkPermission()` 関数を削除する（ファイルが空になる場合はファイルごと削除）（依存: T008）
- [ ] T010: `services/stock-tracker/batch/src/lib/web-push-client.ts` の `getVapidConfig()` を削除し、`@nagiyu/common/push` からの import に変更する（依存: T003）
- [ ] T011: `services/niconico-mylist-assistant/batch/src/lib/web-push-client.ts` の `getVapidConfig()` を削除し、`@nagiyu/common/push` からの import に変更する（依存: T003）

## Phase 3: 検証（高優先度）

<!-- 全サービスのビルド・テストが通ることを確認する -->

- [ ] T012: `services/auth/core` のビルド・テストが通ることを確認する（依存: T006）
- [ ] T013: `services/stock-tracker/core` のビルド・テストが通ることを確認する（依存: T009）
- [ ] T014: `services/stock-tracker/batch` のビルド・テストが通ることを確認する（依存: T010）
- [ ] T015: `services/niconico-mylist-assistant/batch` のビルド・テストが通ることを確認する（依存: T011）

## Phase 4: セッション取得関数の調査・共通化（中優先度）

<!-- セッション取得関数の実装を比較し、共通化可能か判断する -->

- [ ] T016: 以下の各 `session.ts` の実装内容を比較し、差分を記録する（依存: Phase 3 完了）
    - `services/admin/web/src/lib/auth/session.ts`
    - `services/auth/web/src/lib/auth/session.ts`
    - `services/niconico-mylist-assistant/web/src/lib/auth/session.ts`
    - `services/share-together/web/src/lib/auth/session.ts`
- [ ] T017: 実装が共通化可能と判断した場合、`libs/browser/src/auth/session.ts` を新規作成する（依存: T016）
- [ ] T018: 共通化した場合、各サービスの `session.ts` を `libs/browser` の実装を参照する形に変更する（依存: T017）
- [ ] T019: 各 Web サービスのビルド・テスト・E2E テストが通ることを確認する（依存: T018）

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件をすべて満たしている
    - Phase 1 対象の重複実装（A-1, A-2, A-3）が削除・統合されている
    - 全対象サービスのビルドが成功している
    - 全対象サービスのテストが通過している
- [ ] `libs/common` のテストカバレッジが 80% 以上である
- [ ] Lint・型チェックがすべて通過している
- [ ] 依存関係ルール（`ui → browser → common`）に違反した import がない
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `docs/development/shared-libraries.md` の該当箇所を更新した
- [ ] `tasks/issue-2441-code-consolidation/` ディレクトリを削除した
