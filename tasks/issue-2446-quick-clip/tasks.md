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

- [ ] サービスディレクトリ構成の作成（`services/quick-clip/{core,web,batch}`）（依存: なし）
- [ ] モノレポへのワークスペース追加（ルート `package.json` の `workspaces` に追加）（依存: 上記）
- [ ] `core` パッケージ初期設定（`tsconfig`・`jest` 設定・`package.json`）（依存: 上記）
- [ ] `web` パッケージ初期設定（Next.js アプリ骨格・`tsconfig`・`package.json`）（依存: 上記）
- [ ] `batch` パッケージ初期設定（`tsconfig`・`jest` 設定・`package.json`・Dockerfile）（依存: 上記）
- [ ] AWS インフラ構成（S3・DynamoDB・Batch・CloudFront）（依存: なし）
- [ ] CI/CD パイプラインの設定（依存: 上記）

## Phase 2: UI PoC（外観調整・要件確認）

<!--
    PoC データ（ハードコード）で全画面を実装し、見た目を確認・調整する。
    このフェーズが完了したら要件を再 Fix してから Phase 3 以降に進む。

    PoC データを使用している箇所には必ず TODO コメントを残すこと:
    // TODO(PoC): ダミーデータ。Phase 4 の API Routes 実装後に実 API 呼び出しに差し替える
-->

- [ ] アップロード画面（SCR-001: `web/src/app/page.tsx`）PoC 実装（依存: Phase 1）
- [ ] 処理中画面（SCR-002: `web/src/app/jobs/[jobId]/page.tsx`）PoC 実装（依存: Phase 1）
- [ ] 見どころ確認画面（SCR-003: `web/src/app/jobs/[jobId]/highlights/page.tsx`）PoC 実装（依存: Phase 1）
- [ ] **要件再確認・Fix**（外観を確認しながら追加要件を洗い出し、`requirements.md` / `external-design.md` を更新する）（依存: 上記全て）

> **PoC での API 通信方針**: 実 API の呼び出しを含める場合は、呼び出し先をスタブ関数として切り出し、`TODO(PoC)` コメントを付与しておく。Phase 4 完了後にスタブを実 API 呼び出しに差し替えやすくするため。

## Phase 3: core 実装（ドメインロジック・インターフェース）

<!-- ビジネスロジックの実装。FFmpeg 非依存のため単体テストが容易 -->

- [ ] `JobRepository` インターフェース定義（`core/src/repositories/job.repository.interface.ts`）（依存: Phase 2 要件 Fix）
- [ ] `HighlightRepository` インターフェース定義（`core/src/repositories/highlight.repository.interface.ts`）（依存: Phase 2 要件 Fix）
- [ ] `HighlightExtractorService` インターフェース定義（`core/src/libs/highlight-extractor.service.ts`）（依存: Phase 2 要件 Fix）
- [ ] `ClipSplitterService` インターフェース定義（`core/src/libs/clip-splitter.service.ts`）（依存: Phase 2 要件 Fix）
- [ ] `JobService` 実装（`core/src/libs/job.service.ts`）（依存: `JobRepository`）
- [ ] `HighlightService` 実装（`core/src/libs/highlight.service.ts`）（依存: `HighlightRepository`）
- [ ] `HighlightAggregationService` 実装（`core/src/libs/highlight-aggregation.service.ts`）（依存: `HighlightExtractorService`）
- [ ] core ユニットテスト（カバレッジ 80% 以上）（依存: 上記全て）

## Phase 4: batch 実装（FFmpeg 依存の具象実装）

<!-- FFmpeg を使った動画解析・クリップ書き出し。I/O に特化したトリガー層 -->

- [ ] `FfmpegVideoAnalyzer` 実装（`batch/src/libs/ffmpeg-video-analyzer.ts`）（依存: Phase 1）
- [ ] `MotionHighlightService` 実装（`batch/src/libs/motion-highlight.service.ts`）（依存: `FfmpegVideoAnalyzer`）
- [ ] `VolumeHighlightService` 実装（`batch/src/libs/volume-highlight.service.ts`）（依存: `FfmpegVideoAnalyzer`）
- [ ] `FfmpegClipSplitter` 実装（`batch/src/libs/ffmpeg-clip-splitter.ts`）（依存: Phase 1）
- [ ] DynamoDB `JobRepository` 実装（`batch/src/repositories/dynamodb-job.repository.ts`）（依存: Phase 3）
- [ ] DynamoDB `HighlightRepository` 実装（`batch/src/repositories/dynamodb-highlight.repository.ts`）（依存: Phase 3）
- [ ] `entrypoint` 実装（`batch/src/entrypoint.ts`）（依存: 上記全て）

## Phase 5: API Routes 実装

<!-- Next.js API Routes の実装 -->

- [ ] DynamoDB `JobRepository` 実装（`web/src/repositories/dynamodb-job.repository.ts`）（依存: Phase 3）
- [ ] DynamoDB `HighlightRepository` 実装（`web/src/repositories/dynamodb-highlight.repository.ts`）（依存: Phase 3）
- [ ] `POST /api/jobs`（Presigned URL 生成・ジョブ作成）（依存: Phase 3）
- [ ] `GET /api/jobs/[jobId]`（ジョブステータス取得）（依存: Phase 3）
- [ ] `GET /api/jobs/[jobId]/highlights`（見どころ一覧取得）（依存: Phase 3）
- [ ] `PATCH /api/jobs/[jobId]/highlights/[highlightId]`（採否・時間更新）（依存: Phase 3）
- [ ] `POST /api/jobs/[jobId]/download`（ZIP 生成リクエスト・ダウンロード URL 取得）（依存: Phase 3）

## Phase 6: UI 本実装（PoC → 本番への差し替え）

<!-- Phase 2 の PoC 実装を実 API 呼び出しに差し替え、TODO(PoC) コメントをすべて解消する -->

- [ ] アップロード画面（SCR-001）の `TODO(PoC)` を実 API 呼び出しに差し替え（依存: Phase 5）
- [ ] 処理中画面（SCR-002）の `TODO(PoC)` を実 API 呼び出しに差し替え（依存: Phase 5）
- [ ] 見どころ確認画面（SCR-003）の `TODO(PoC)` を実 API 呼び出しに差し替え（依存: Phase 5）
- [ ] `TODO(PoC)` コメントが残っていないことを確認
- [ ] E2E テスト作成（依存: 上記全て）

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
