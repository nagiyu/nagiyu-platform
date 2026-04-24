# Quick Clip 並列化・パフォーマンス改善 - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/quick-clip-parallelization/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/quick-clip-parallelization/requirements.md — 受け入れ条件
    - tasks/quick-clip-parallelization/design.md       — 技術設計・実装方針
-->

## Phase 1: マルチパートアップロード改善（Web 層）

Web 層の変更はすべて独立しており、Core 層に依存しない。

- [x] `services/quick-clip/web/src/app/api/jobs/route.ts`: `MULTIPART_UPLOAD_THRESHOLD_BYTES` を 100MB に、`MULTIPART_CHUNK_SIZE_BYTES` を 50MB に変更する（依存: なし）
- [x] `services/quick-clip/web/src/app/api/jobs/[jobId]/abort-upload/route.ts`: 新規作成。`AbortMultipartUploadCommand` を呼ぶ POST エンドポイントを実装する。`complete-upload/route.ts` の構造を参考にする（依存: なし）
- [x] `services/quick-clip/web/src/app/page.tsx`: チャンク PUT を `Promise.all` 化し、エラー時に abort-upload API を呼ぶように修正する。進捗表示は全チャンク完了後に 100% にする（依存: abort-upload エンドポイント）
- [x] Phase 1 のテストを追加・更新する（依存: 上記）

## Phase 2: バッチ処理並列化（Core 層）

Core 層の変更は Web 層に依存しない。Phase 1 と並行して作業可能。

- [x] `services/quick-clip/core/src/libs/transcription.service.ts`: `transcribe` メソッド内のチャンク処理 `for` ループを `Promise.all` 化する。`extractAudioChunk → transcribeFile → unlink` を1チャンクずつの async 関数にまとめて並列実行し、結果を `flat()` で結合する（依存: なし）
- [x] `services/quick-clip/core/src/libs/emotion-highlight.service.ts`: `getScores` メソッド内のチャンク処理 `for` ループを concurrency limiter 付き `Promise.all` 化する。`EMOTION_SCORING_CONCURRENCY = 3` 定数を定義し、`runWithConcurrency` ヘルパーで実装する（依存: なし）
- [x] Phase 2 のテストを追加・更新する（依存: 上記）

## Phase 3: 安定性改善

Phase 1・2 の実装完了後に判明した不具合・改善点。

- [x] `services/quick-clip/web/src/app/page.tsx`: チャンク完了ベースの進捗更新に修正する。`uploadPartsInParallel` 内で各 PUT 完了後に `完了チャンク数 / 総チャンク数` で `setUploadProgress` を呼ぶ。現状は全チャンク完了後に一括で 100% にしているため、アップロード中は 0% のまま完了時に 100% へジャンプしており進捗バーが機能していない（依存: Promise.all 化）
- [x] `services/quick-clip/core/src/libs/transcription.service.ts`: 文字起こしチャンクのサイズ縮小とリトライ追加。① チャンク計算用に `CHUNK_TARGET_SIZE_BYTES`（10MB）を新設し `CHUNK_DURATION_SEC` の計算に使用する（チャンク判定閾値 `MAX_FILE_SIZE_BYTES = 24MB` は変更しない）。② `transcribeFile` 呼び出しを `withRetry` + `withTimeout` で囲み、タイムアウトエラーもリトライ対象とする（感情スコアリングの `withRetry` は timeout を除外しているが、Whisper は一時的な負荷・ネットワーク起因が多いためリトライすべき）。背景: 現状は 1 チャンク約 104 分の音声を Whisper に投げており OpenAI ライブラリのデフォルトタイムアウト 600s を超えることがある。リトライがないため `buildHighlights` の catch に落ちて感情分析ごとスキップされる（依存: なし）
- [x] Phase 3 のテストを追加・更新する（依存: 上記）

## Phase 4: バッチ処理ログ拡充

現状は warn/error 系 4 件のみで正常系・異常系ともにほぼブラックボックス。障害時の再現条件（動画サイズ・チャンク数・どのステージで失敗したか）が特定できない。

- [x] バッチ処理の主要フローにログを追加する。追加対象と観点:
    - `services/quick-clip/batch/src/entrypoint.ts`: ジョブ開始ログ（ジョブ ID 等のコンテキスト）
    - `services/quick-clip/core/src/libs/quick-clip-batch-runner.ts`: 各ステージ遷移の開始（downloading / analyzing / aggregating）、`buildHighlights` 入口（動画ファイルサイズ）、ダウンロードリトライ（リトライ回数・エラー内容）、並列分析（モーション・音量・文字起こし・感情）の開始・完了、ハイライト保存完了（保存件数）
    - `services/quick-clip/core/src/libs/transcription.service.ts`: 音声抽出の開始・完了（ファイルサイズ）、単一ファイル vs チャンク分割の選択結果、チャンク分割時のチャンク総数・各チャンクの開始（何番目・サイズ）・完了
    - `services/quick-clip/core/src/libs/emotion-highlight.service.ts`: `getScores` 入口（セグメント数・チャンク数）、各チャンクの API 呼び出し開始・完了・リトライ発生

## Phase 5: 解析進捗可視化 & モーション+音量+文字起こし並列化

- [ ] `services/quick-clip/core/src/types.ts`: `AnalysisProgressItem` 型・`AnalysisProgress` 型を追加する。`Job` 型に `analysisProgress?: AnalysisProgress` を追加する（依存: なし）
- [ ] `services/quick-clip/core/src/libs/dynamodb-job.repository.ts`: `updateAnalysisProgress(jobId, progress)` を追加する。`updateBatchStage` と同じパターンで `analysisProgress` フィールドを SET する（依存: 型定義）
- [ ] `services/quick-clip/core/src/libs/job.service.ts`: `updateAnalysisProgress()` ラッパーメソッドを追加する（依存: repository）
- [ ] `services/quick-clip/core/src/libs/transcription.service.ts`: `transcribe()` にオプション引数 `onProgress?: (completed: number, total: number) => Promise<void>` を追加する。チャンク分割時（numChunks > 1）のみ各チャンク完了後に呼ぶ（依存: なし）
- [ ] `services/quick-clip/core/src/libs/emotion-highlight.service.ts`: `getScores()` にオプション引数 `onProgress?: (completed: number, total: number) => Promise<void>` を追加する。チャンク数 > 1 のみ各チャンク完了後に呼ぶ（依存: なし）
- [ ] `services/quick-clip/core/src/libs/quick-clip-batch-runner.ts`: モーション・音量・文字起こしを `Promise.all` で並列実行するよう変更する。進捗オブジェクトを共有しコールバックで DynamoDB を更新する。感情分析は3つ完了後に開始する。design.md Phase 5-3 の実装方針に従う（依存: 上記すべて）
- [ ] `services/quick-clip/web/src/app/api/jobs/[jobId]/route.ts`: レスポンスに `analysisProgress` を追加する（batchStage=analyzing かつ存在する場合のみ）（依存: core 型定義）
- [ ] `services/quick-clip/web/src/app/jobs/[jobId]/page.tsx`: `JobApiResponse` 型に `analysisProgress` を追加し、解析ステップにサブ項目 UI を実装する。design.md Phase 5-7 の仕様に従う（依存: API 変更）
- [ ] Phase 5 のテストを追加・更新する（依存: 上記）

## 完了チェック

- [ ] requirements.md の受け入れ条件をすべて満たしている
- [ ] Lint・型チェックがすべて通過している（`npm run lint`, `npm run typecheck`）
- [ ] `services/quick-clip/web` のテストがパスしている
- [ ] `services/quick-clip/core` のテストがパスしている
- [ ] design.md の「docs/ への移行メモ」を処理した
- [ ] `docs/services/quick-clip/architecture.md` を更新した
- [ ] `tasks/quick-clip-parallelization/` ディレクトリを削除した
