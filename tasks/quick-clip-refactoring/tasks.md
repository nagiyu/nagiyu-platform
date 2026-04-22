# さくっとクリップ リファクタリング - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/quick-clip-refactoring/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/quick-clip-refactoring/requirements.md — 受け入れ条件・ユースケース
    - tasks/quick-clip-refactoring/design.md — API 仕様・データモデル・コンポーネント設計
-->

## Phase 1: Core パッケージ（スキーマ・リポジトリ・サービス）

Web / Batch の変更はすべて Core の型に依存するため、最初に実施する。

- [x] `core/src/types.ts`: `Job` 型から `status` を削除し、`batchJobId?: string` / `batchStage?: BatchStage` を追加する（依存: なし）
- [x] `core/src/types.ts`: `BatchStage = 'downloading' | 'analyzing' | 'aggregating'` 型を追加する（依存: なし）
- [x] `core/src/types.ts`: `Highlight` 型に `expiresAt: number` を追加する（依存: なし）
- [x] `core/src/repositories/job.repository.interface.ts`: `updateStatus` を削除し、`updateBatchJobId` / `updateBatchStage` / `updateErrorMessage` を追加する（依存: 型変更）
- [x] `core/src/repositories/dynamodb-job.repository.ts`: `JobItem` から `status` を削除し、`batchJobId?` / `batchStage?` を追加する。`mapToEntity` / `mapToItem` を更新する（依存: IF 変更）
- [x] `core/src/repositories/dynamodb-job.repository.ts`: `updateBatchJobId` / `updateBatchStage` / `updateErrorMessage` メソッドを実装する（依存: 上記）
- [x] `core/src/repositories/highlight.repository.interface.ts`: `batchUpsert` の引数に `expiresAt` を追加する（依存: 型変更）
- [x] `core/src/repositories/dynamodb-highlight.repository.ts`: `expiresAt` を DynamoDB アイテムに永続化する（依存: IF 変更）
- [x] `core/src/libs/job.service.ts`: `updateStatus` を削除し、`updateBatchJobId` / `updateBatchStage` / `updateErrorMessage` ラッパーメソッドを追加する（依存: リポジトリ変更）
- [x] `core/src/index.ts`: `BatchStage` 型をエクスポートに追加する（依存: 型変更）
- [x] `core` のユニットテストを更新・追加する（依存: 上記全て）

## Phase 2: Batch コンテナ

Core パッケージの変更完了後に実施する。

- [x] `core/src/libs/quick-clip-batch-runner.ts`: `updateJobStatus('PROCESSING', ...)` / `updateJobStatus('COMPLETED', ...)` の呼び出しを削除する（依存: Phase 1）
- [x] `core/src/libs/quick-clip-batch-runner.ts`: `try/catch` 内の `updateJobStatus('FAILED', ...)` を `updateErrorMessage(...)` に変更する（依存: Phase 1）
- [x] `core/src/libs/quick-clip-batch-runner.ts`: 各処理ステップ前に `updateBatchStage` を呼ぶ（`downloading` → `analyzing` → `aggregating`）（依存: Phase 1）
- [x] `core/src/libs/quick-clip-batch-runner.ts`: `persistHighlights` 呼び出しに `expiresAt` を渡し、Highlight 作成時に設定する（`expiresAt` は Job から取得するか、環境変数として受け取る — design.md の実装ノートを参照）（依存: Phase 1）

## Phase 3: Web API

Core パッケージの変更完了後に実施する（Phase 2 と並列実行可能）。

- [x] `web/src/types/quick-clip.ts`: `Job` 型を更新（`status` 削除、`batchJobId?` / `batchStage?` 追加）、`BatchStage` 型を追加する（依存: Phase 1）
- [x] `web/src/lib/server/aws.ts`: `getBatchClient()` が利用可能であることを確認する（既存実装のため変更不要の可能性あり）（依存: なし）
- [x] `web/src/app/api/jobs/route.ts`: `SubmitJobCommand` のレスポンスから `batchJobId` を取得し、`jobService.updateBatchJobId()` で Job レコードに保存する（依存: Phase 1 + Core の Job サービス）
- [x] `web/src/app/api/jobs/[jobId]/complete-upload/route.ts`: 同様に `batchJobId` を保存する（依存: Phase 1）
- [x] `web/src/app/api/jobs/[jobId]/route.ts`: `DescribeJobsCommand` を使った状態導出ロジックを実装する（design.md の「GET /api/jobs/[jobId] の変更」を参照）（依存: Phase 1、AWS IAM 権限確認が必要）
- [x] `infra/quick-clip/lib/lambda-stack.ts`（または該当 IAM 設定）: Lambda (Web) の IAM ロールに `batch:DescribeJobs` 権限を追加する（依存: なし）
- [x] Web API のユニットテストを更新・追加する（依存: 上記全て）

## Phase 4: Web フロントエンド

Phase 3 完了後に実施する。

- [ ] `web/src/app/page.tsx`: `uploadProgress` state を追加し、小ファイルアップロードを `XMLHttpRequest` に変更して `upload.onprogress` で進捗を更新する（依存: なし）
- [ ] `web/src/app/page.tsx`: マルチパートアップロードのチャンクループで `uploadedBytes / file.size` を追跡して `uploadProgress` を更新する（依存: なし）
- [ ] `web/src/app/page.tsx`: `LinearProgress` と進捗テキストを追加する。アップロードボタンのラベルを動的に変更する（依存: 上記）
- [ ] `web/src/app/page.tsx`: 制約通知（タブ閉じ禁止・24時間失効）を MUI `Alert` で追加する（依存: なし）
- [ ] `web/src/app/jobs/[jobId]/page.tsx`: ポーリング間隔を `10000` → `5000` に変更する（依存: なし）
- [ ] `web/src/app/jobs/[jobId]/page.tsx`: MUI `Stepper`（アップロード → 解析 → 切り出し）を追加する。`batchStage` のサブラベル表示を実装する（依存: Phase 3 の型変更）
- [ ] `web/src/app/jobs/[jobId]/page.tsx`: 有効期限表示（`expiresAt` から日時文字列を生成）を追加する（依存: Phase 3）
- [ ] `web/src/app/jobs/[jobId]/page.tsx`: タブ閉じOK通知（PENDING / PROCESSING 時）を追加する（依存: なし）
- [ ] `web/src/app/jobs/[jobId]/highlights/page.tsx`: 「X / Y 件生成済」クリップ生成進捗を追加する（依存: なし）
- [ ] `web/src/app/jobs/[jobId]/highlights/page.tsx`: 有効期限を表示するために初回マウント時に `GET /api/jobs/[jobId]` を呼んで `expiresAt` を取得する（依存: Phase 3）
- [ ] フロントエンドのユニットテストを更新・追加する（依存: 上記全て）

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件（AC-001〜AC-012）をすべて満たしている
- [x] `core` のユニットテストがすべて通過する
- [ ] `web` のユニットテストがすべて通過する
- [ ] Lint・型チェック（`tsc --noEmit`）がすべて通過する
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `docs/services/quick-clip/architecture.md` に ADR-005 を追記した
- [ ] `docs/services/quick-clip/external-design.md` を更新した
- [ ] `docs/services/quick-clip/requirements.md` を更新した
- [ ] `tasks/quick-clip-refactoring/` ディレクトリを削除した
