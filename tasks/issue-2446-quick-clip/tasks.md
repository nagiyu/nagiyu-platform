# さくっとクリップ (QuickClip) - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-2446-quick-clip/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/issue-2446-quick-clip/requirements.md — 受け入れ条件・ユースケース
    - tasks/issue-2446-quick-clip/external-design.md — 画面設計・概念データモデル
    - tasks/issue-2446-quick-clip/design.md — API 仕様・データモデル・コンポーネント設計
-->

## Phase 1: 基盤整備

<!-- サービス骨格・インフラ・共通設定のセットアップ -->

- [x] サービスディレクトリ構成の作成（`services/quick-clip/{core,web,batch}`）（依存: なし）
- [x] モノレポへのワークスペース追加（ルート `package.json` の `workspaces` に追加）（依存: 上記）
- [x] `core` パッケージ初期設定（`tsconfig`・`jest` 設定・`package.json`）（依存: 上記）
- [x] `web` パッケージ初期設定（Next.js アプリ骨格・`tsconfig`・`package.json`）（依存: 上記）
- [x] `batch` パッケージ初期設定（`tsconfig`・`jest` 設定・`package.json`・Dockerfile）（依存: 上記）
- [x] AWS インフラ構成（S3・DynamoDB・Batch・CloudFront）（依存: なし）
- [x] CI/CD パイプラインの設定（依存: 上記）

## Phase 2: UI PoC（外観調整・要件確認）

<!--
    全画面と PoC 用 API Routes を実装し、見た目を確認・調整する。
    このフェーズが完了したら要件を再 Fix してから Phase 3 以降に進む。

    UI は実 API エンドポイントをそのまま呼び出す。
    PoC データ（ハードコード）は API Route ハンドラー側に置き、必ず TODO コメントを残すこと:
    // TODO(PoC): ハードコードデータ。Phase 5 の本実装時に DynamoDB 実装に差し替える
-->

- [x] PoC 用 API Routes 実装（ハードコードデータを返す。`TODO(PoC)` コメントを各ハンドラーに付与）（依存: Phase 1）
- [x] アップロード画面（SCR-001: `web/src/app/page.tsx`）PoC 実装（依存: 上記）
- [x] 処理中画面（SCR-002: `web/src/app/jobs/[jobId]/page.tsx`）PoC 実装（依存: 上記）
- [x] 見どころ確認画面（SCR-003: `web/src/app/jobs/[jobId]/highlights/page.tsx`）PoC 実装（依存: 上記）
- [x] **要件再確認・Fix**（外観を確認しながら追加要件を洗い出し、`requirements.md` / `external-design.md` を更新する）（依存: 上記全て）

> **PoC での API 通信方針**: UI は実 API エンドポイントをそのまま呼び出す。PoC データはサーバー側（API Route ハンドラー）でハードコードし、`TODO(PoC)` コメントを付与しておく。Phase 5 の本実装時に DynamoDB 実装へ差し替える。

## Phase 3: core 実装（ドメインロジック・インターフェース）

<!-- ビジネスロジックの実装。FFmpeg 非依存のため単体テストが容易 -->

- [x] `JobRepository` インターフェース定義（`core/src/repositories/job.repository.interface.ts`）（依存: Phase 2 要件 Fix）
- [x] `HighlightRepository` インターフェース定義（`core/src/repositories/highlight.repository.interface.ts`）（依存: Phase 2 要件 Fix）
- [x] `HighlightExtractorService` インターフェース定義（`core/src/libs/highlight-extractor.service.ts`）（依存: Phase 2 要件 Fix）
- [x] `ClipSplitterService` インターフェース定義（`core/src/libs/clip-splitter.service.ts`）（依存: Phase 2 要件 Fix）
- [x] `JobService` 実装（`core/src/libs/job.service.ts`）（依存: `JobRepository`）
- [x] `HighlightService` 実装（`core/src/libs/highlight.service.ts`）（依存: `HighlightRepository`）
- [x] `HighlightAggregationService` 実装（`core/src/libs/highlight-aggregation.service.ts`）（依存: `HighlightExtractorService`）
- [x] core ユニットテスト（カバレッジ 80% 以上）（依存: 上記全て）

## Phase 4: batch 実装（FFmpeg 依存の具象実装）

<!-- FFmpeg を使った動画解析・クリップ書き出し。I/O に特化したトリガー層 -->

- [x] `FfmpegVideoAnalyzer` 実装（`batch/src/libs/ffmpeg-video-analyzer.ts`）（依存: Phase 1）
- [x] `MotionHighlightService` 実装（`batch/src/libs/motion-highlight.service.ts`）（依存: `FfmpegVideoAnalyzer`）
- [x] `VolumeHighlightService` 実装（`batch/src/libs/volume-highlight.service.ts`）（依存: `FfmpegVideoAnalyzer`）
- [x] `FfmpegClipSplitter` 実装（`batch/src/libs/ffmpeg-clip-splitter.ts`）（依存: Phase 1）
- [x] DynamoDB `JobRepository` 実装（`batch/src/repositories/dynamodb-job.repository.ts`）（依存: Phase 3）
- [x] DynamoDB `HighlightRepository` 実装（`batch/src/repositories/dynamodb-highlight.repository.ts`）（依存: Phase 3）
- [x] `entrypoint` 実装（`batch/src/entrypoint.ts`）（依存: 上記全て）

## Phase 5: API Routes 本実装

<!-- Next.js API Routes の PoC 実装を DynamoDB 実装に差し替える。TODO(PoC) コメントをすべて解消する -->

- [x] DynamoDB `JobRepository` 実装（`web/src/repositories/dynamodb-job.repository.ts`）（依存: Phase 3）
- [x] DynamoDB `HighlightRepository` 実装（`web/src/repositories/dynamodb-highlight.repository.ts`）（依存: Phase 3）
- [x] `POST /api/jobs`（Presigned URL 生成・ジョブ作成）の `TODO(PoC)` を本実装に差し替え（依存: Phase 3）
- [x] `GET /api/jobs/[jobId]`（ジョブステータス取得）の `TODO(PoC)` を本実装に差し替え（依存: Phase 3）
- [x] `GET /api/jobs/[jobId]/highlights`（見どころ一覧取得）の `TODO(PoC)` を本実装に差し替え（依存: Phase 3）
- [x] `PATCH /api/jobs/[jobId]/highlights/[highlightId]`（採否・時間更新）の `TODO(PoC)` を本実装に差し替え（依存: Phase 3）
- [x] `POST /api/jobs/[jobId]/download`（ZIP 生成リクエスト・ダウンロード URL 取得）の `TODO(PoC)` を本実装に差し替え（依存: Phase 3）
- [x] API Routes 内に `TODO(PoC)` コメントが残っていないことを確認

## Phase 6: 結合確認・E2E テスト

<!-- Phase 5 の本実装後に UI + 実 API の結合動作を確認し、E2E テストを作成する -->

- [x] 全画面で実 API（DynamoDB）との結合動作を確認
- [x] `TODO(PoC)` コメントがリポジトリ内に残っていないことを確認
- [x] E2E テスト作成（依存: 上記全て）

## Phase 7: 検証・ドキュメント整備

- [ ] 受け入れテスト（`requirements.md` のユースケースを全件手動確認）
- [ ] `docs/services/quick-clip/` ドキュメントを作成・更新
- [ ] `tasks/issue-2446-quick-clip/` ディレクトリを削除

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件をすべて満たしている
- [ ] テストカバレッジ 80% 以上（`quick-clip/core`）
- [ ] Lint・型チェックがすべて通過している
- [ ] `TODO(PoC)` コメントがすべて解消されている
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `docs/services/quick-clip/` の該当ファイルを更新した
- [ ] `tasks/issue-2446-quick-clip/` ディレクトリを削除した
