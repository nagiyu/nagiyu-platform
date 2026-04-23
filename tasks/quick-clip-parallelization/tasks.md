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

- [ ] `services/quick-clip/core/src/libs/transcription.service.ts`: `transcribe` メソッド内のチャンク処理 `for` ループを `Promise.all` 化する。`extractAudioChunk → transcribeFile → unlink` を1チャンクずつの async 関数にまとめて並列実行し、結果を `flat()` で結合する（依存: なし）
- [ ] `services/quick-clip/core/src/libs/emotion-highlight.service.ts`: `getScores` メソッド内のチャンク処理 `for` ループを concurrency limiter 付き `Promise.all` 化する。`EMOTION_SCORING_CONCURRENCY = 3` 定数を定義し、`runWithConcurrency` ヘルパーで実装する（依存: なし）
- [ ] Phase 2 のテストを追加・更新する（依存: 上記）

## 完了チェック

- [ ] requirements.md の受け入れ条件をすべて満たしている
- [ ] Lint・型チェックがすべて通過している（`npm run lint`, `npm run typecheck`）
- [ ] `services/quick-clip/web` のテストがパスしている
- [ ] `services/quick-clip/core` のテストがパスしている
- [ ] design.md の「docs/ への移行メモ」を処理した
- [ ] `docs/services/quick-clip/architecture.md` を更新した
- [ ] `tasks/quick-clip-parallelization/` ディレクトリを削除した
