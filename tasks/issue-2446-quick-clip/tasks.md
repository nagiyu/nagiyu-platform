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

## Phase 7: アーキテクチャ修正

<!--
    Phase 6 完了後に判明した不備（プレビュー・ダウンロード・ハイライト数）を解消するためのアーキテクチャ修正。
    設計方針:
    - Batch は動画解析のみ（split コマンド廃止）
    - クリップ生成は clip-regenerate Lambda に委譲（Web から非同期 Invoke）
    - ZIP 生成は zip-generator Lambda に委譲（Web から同期 Invoke）
    - clipStatus (PENDING/GENERATING/GENERATED/FAILED) で生成状態を管理
    - クリップ S3 キーは outputs/{jobId}/clips/{highlightId}.mp4 として導出（DynamoDB に保存しない）
-->

### 7-1. 仕様更新（依存: なし）

- [x] `requirements.md` 更新（プレビュー方式・ダウンロード方式・ハイライト数）
- [x] `external-design.md` 更新（SCR-003 プレビュー・ダウンロード・GENERATING 状態）
- [x] `design.md` 更新（データモデル・API レスポンス・コンポーネント構成）
- [x] `requirements.md` / `external-design.md` のドメインオブジェクト定義に `clipStatus` を反映（仕様整合）

### 7-2. データモデル修正（依存: 7-1）

- [x] `Highlight` 型に `clipStatus: 'PENDING' | 'GENERATING' | 'GENERATED' | 'FAILED'` 追加（`core/src/types.ts`）
- [x] `DynamoDBHighlightRepository` の save / find に `clipStatus` を反映（`core/src/repositories/dynamodb-highlight.repository.ts`）
- [x] ユニットテスト更新

### 7-3. Batch 修正（依存: 7-2）

- [x] `QuickClipBatchRunner.extract()` の末尾からクリップ生成処理を除去し、全ハイライトの `clipStatus='PENDING'` 保存のみに変更（`core/src/libs/quick-clip-batch-runner.ts`）
- [x] バッチの "split" コマンドを廃止（`batch/src/entrypoint.ts` から削除）
- [x] テスト更新

### 7-4. 新規 Lambda 実装（依存: 7-2）

**clip-regenerate Lambda（FFmpeg 必要）**

- [ ] 新規パッケージ作成（`services/quick-clip/lambda/clip/`）
- [x] 新規パッケージ作成（`services/quick-clip/lambda/clip/`）
  - 入力: `{ jobId, highlightId, startSec, endSec }`
  - S3 から元動画取得 → FFmpeg でクリップ切り出し → S3 保存（`outputs/{jobId}/clips/{highlightId}.mp4`）→ DynamoDB の `clipStatus='GENERATED'` 更新
  - エラー時は `clipStatus='FAILED'` に更新
  - FFmpeg はコンテナイメージに同梱（Batch と同方針）
- [ ] インフラ（Lambda 関数・ECR リポジトリ・IAM 権限）を CDK で追加（`infra/quick-clip/`）
- [x] インフラ（Lambda 関数・ECR リポジトリ・IAM 権限）を CDK で追加（`infra/quick-clip/`）
- [x] テスト作成

**zip-generator Lambda（FFmpeg 不要）**

- [ ] 新規パッケージ作成（`services/quick-clip/lambda/zip/`）
- [x] 新規パッケージ作成（`services/quick-clip/lambda/zip/`）
  - 入力: `{ jobId, highlightIds: string[] }`
  - S3 から clip ファイルを並列取得 → メモリ上で ZIP 組み立て → S3 保存（`outputs/{jobId}/clips.zip`）→ Presigned URL 返却
- [ ] インフラ（Lambda 関数・IAM 権限・タイムアウト設定）を CDK で追加（`infra/quick-clip/`）
- [x] インフラ（Lambda 関数・IAM 権限・タイムアウト設定）を CDK で追加（`infra/quick-clip/`）
- [x] テスト作成

### 7-5. Web API 修正（依存: 7-4）

- [ ] `GET /api/jobs/[jobId]/highlights`（`web/src/app/api/jobs/[jobId]/highlights/route.ts`）
  - `sourceVideoUrl` の返却を廃止
  - `clipStatus='PENDING'` のハイライトに対し clip-regenerate Lambda を非同期 Invoke
  - Invoke 直後に `clipStatus='GENERATING'` に更新
  - 各 Highlight に `clipUrl`（`GENERATED` のもののみ Presigned URL）を追加して返却
- [ ] `PATCH /api/jobs/[jobId]/highlights/[highlightId]`（`web/src/app/api/jobs/[jobId]/highlights/[highlightId]/route.ts`）
  - 時間変更（startSec / endSec）がある場合、DynamoDB 更新後に clip-regenerate Lambda を非同期 Invoke
  - Invoke 直後に `clipStatus='GENERATING'` で返却
- [ ] `POST /api/jobs/[jobId]/download`（`web/src/app/api/jobs/[jobId]/download/route.ts`）
  - accepted ハイライトに `PENDING` / `GENERATING` が含まれる場合は `409 Conflict` を返す
  - Batch Submit・S3 ポーリングを廃止
  - zip-generator Lambda を同期 Invoke → Presigned URL を返却
- [ ] ユニットテスト更新

### 7-6. ハイライト確認画面修正（依存: 7-5）

- [ ] `jobs/[jobId]/highlights/page.tsx`
  - `sourceVideoUrl` 参照を廃止
  - `GENERATING` / `PENDING` 状態の行はローディングインジケーターを表示
  - `PENDING` / `GENERATING` のハイライトが存在する間、GET /highlights を数秒おきにポーリング
  - `GENERATED` になったら `clipUrl` で `<video>` を直接再生（シーク・timeupdate ロジックを削除）
  - 時間調整後は該当行が `GENERATING` → `GENERATED` に遷移するまでローディング表示
  - 採用クリップに `GENERATED` 以外が含まれる場合はダウンロードボタンを無効化

## Phase 8: 検証・ドキュメント整備

- [ ] 受け入れテスト（`requirements.md` のユースケースを全件手動確認）
- [ ] `docs/services/quick-clip/` ドキュメントを作成・更新
- [ ] `tasks/issue-2446-quick-clip/` ディレクトリを削除

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件をすべて満たしている
- [ ] テストカバレッジ 80% 以上（`quick-clip/core`）
- [ ] Lint・型チェックがすべて通過している
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `docs/services/quick-clip/` の該当ファイルを更新した
- [ ] `tasks/issue-2446-quick-clip/` ディレクトリを削除した
