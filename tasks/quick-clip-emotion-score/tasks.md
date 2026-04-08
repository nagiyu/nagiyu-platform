<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/quick-clip-emotion-score/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/quick-clip-emotion-score/requirements.md — 受け入れ条件・ユースケース
    - tasks/quick-clip-emotion-score/design.md — API 仕様・データモデル・コンポーネント設計
-->

# さくっとクリップ - 感情スコアによる見どころ抽出 実装タスク

## Phase 1: 依存ライブラリ追加

- [x] `services/quick-clip/core/package.json` に `openai ^6.33.0`・`zod`・`@nagiyu/common` を追加する（依存: なし）

## Phase 2: 型定義・共通型の更新

- [x] `services/quick-clip/core/src/libs/highlight-extractor.service.ts` に `EmotionLabel`・`EmotionFilter`・`EmotionScore`・`EmotionHighlightScore` を追加し、`HighlightSource` に `'emotion'` を追加し、`ExtractedHighlight` に `dominantEmotion?: EmotionLabel` を追加する（依存: Phase 1）
- [x] `services/quick-clip/core/src/types.ts` の `Highlight` に `dominantEmotion?: EmotionLabel` を追加する（依存: 上記）
- [x] `services/quick-clip/core/src/libs/quick-clip-batch-runner.ts` の `QuickClipBatchRunInput` に `openAiApiKey?: string`・`emotionFilter?: EmotionFilter` を追加する（依存: 上記）

## Phase 3: OpenAI クライアント・サービス実装（並列実行可能）

- [ ] `services/quick-clip/core/src/libs/openai-client.ts` を新規作成する（`createOpenAIClient(apiKey: string): OpenAI`。design.md の「openai-client.ts」セクション参照。Stock Tracker の `services/stock-tracker/batch/src/lib/openai-client.ts` を参考にする）（依存: Phase 1）
- [ ] `services/quick-clip/core/src/libs/transcription.service.ts` を新規作成する（`TranscriptionService` クラス。design.md の「transcription.service.ts」セクション参照）（依存: 上記）
- [ ] `services/quick-clip/core/src/libs/emotion-highlight.service.ts` を新規作成する（`EmotionHighlightService` クラス。design.md の「emotion-highlight.service.ts」セクション参照。`withRetry` と `withTimeout` を使用する）（依存: Phase 2）
- [ ] `TranscriptionService` の単体テストを作成する（`core/tests/unit/libs/transcription.service.test.ts`。OpenAI クライアントをモックして `TranscriptSegment[]` が正しく変換されるか検証）（依存: 上記）
- [ ] `EmotionHighlightService` の単体テストを作成する（`core/tests/unit/libs/emotion-highlight.service.test.ts`。Responses API レスポンスをモックして各 `EmotionFilter` の動作・`dominantEmotion` の設定を検証）（依存: 上記）

## Phase 4: 集計ロジック拡張

- [ ] `services/quick-clip/core/src/libs/highlight-aggregation.service.ts` を3ソース round-robin 対応に変更する（design.md の「highlight-aggregation.service.ts」セクション参照。`emotionScores` が未指定・空配列の場合は既存の2ソース動作を維持する）（依存: Phase 2）
- [ ] `highlight-aggregation.service.ts` の既存テストがすべてパスすることを確認し、emotion ソースの動作を検証するテストケースを追加する（依存: 上記）

## Phase 5: バッチランナー統合

- [ ] `services/quick-clip/core/src/libs/quick-clip-batch-runner.ts` の `buildHighlights` を変更する（design.md の「buildHighlights」セクション参照。`openAiApiKey` と `emotionFilter` を受け取り、感情分析を実行。失敗時は graceful degradation）（依存: Phase 3、Phase 4）
- [ ] `services/quick-clip/core/src/libs/quick-clip-batch-runner.ts` の `runExtract` で `openAiApiKey`・`emotionFilter` を `buildHighlights` に渡す（依存: 上記）
- [ ] `quick-clip-batch-runner.ts` の既存テストが引き続きパスすることを確認する（依存: 上記）

## Phase 6: DynamoDB リポジトリ変更

- [ ] `services/quick-clip/core/src/repositories/dynamodb-highlight.repository.ts` の `HighlightItem` に `dominantEmotion?: string` を追加し、`createMany`・`mapToEntity` を変更する（design.md の「DynamoDB 変更」セクション参照）（依存: Phase 2）

## Phase 7: バッチ環境変数

- [ ] `services/quick-clip/batch/src/lib/environment.ts` の `validateEnvironment` に `OPENAI_API_KEY`（任意）と `EMOTION_FILTER`（任意・デフォルト `'any'`）の読み取りを追加し、`QuickClipBatchRunInput` に設定する（依存: Phase 2）
- [ ] `batch/tests/unit/lib/environment.test.ts` を更新して新しい環境変数の動作を検証する（依存: 上記）

## Phase 8: Web API 変更

- [ ] `services/quick-clip/web/src/lib/server/aws.ts` に `getOpenAiApiKey(): string | undefined` を追加する（`OPENAI_API_KEY` が未設定の場合 `undefined` を返す。エラーを throw しない）（依存: なし）
- [ ] `services/quick-clip/web/src/app/api/jobs/route.ts` の `CreateJobRequest` に `emotionFilter?: EmotionFilter` を追加し、`isCreateJobRequest` バリデーターを更新し、Batch `containerOverrides.environment` に `OPENAI_API_KEY`・`EMOTION_FILTER` を追加する（依存: Phase 2、上記）
- [ ] `services/quick-clip/web/src/app/api/jobs/[jobId]/complete-upload/route.ts` の `CompleteUploadRequest` に `emotionFilter?: EmotionFilter` を追加し、Batch env に `OPENAI_API_KEY`・`EMOTION_FILTER` を追加する（依存: Phase 2、上記）

## Phase 9: インフラ変更

- [ ] `infra/quick-clip/` に `SecretsStack` を追加し、`nagiyu-quick-clip-openai-api-key-{environment}` シークレットを PLACEHOLDER 値で作成する（`infra/stock-tracker/lib/secrets-stack.ts` を参照）（依存: なし）
- [ ] quick-clip の `bin/quick-clip.ts` で `tryGetContext('openAiApiKey') || 'PLACEHOLDER'` として受け取り、Lambda（Web）スタックの `environment: { OPENAI_API_KEY: openAiApiKey }` で Lambda 環境変数として注入する（ランタイムで Secrets Manager を呼ばない。`infra/stock-tracker/bin/stock-tracker.ts` と `infra/stock-tracker/lib/lambda-stack.ts` を参照）（依存: 上記）

## Phase 10: エクスポート確認

- [ ] `services/quick-clip/core/src/index.ts` から新規型（`EmotionLabel`・`EmotionFilter`・`EmotionScore`・`EmotionHighlightScore`）と新規サービス（`TranscriptionService`・`EmotionHighlightService`・`createOpenAIClient`）が適切にエクスポートされているか確認・追加する（依存: Phase 3）

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件をすべて満たしている
- [ ] テストカバレッジ 80% 以上（`quick-clip/core`）
- [ ] Lint・型チェックがすべて通過している（`services/quick-clip/core`・`batch`・`web`）
- [ ] `OPENAI_API_KEY` 未設定時に既存テストがすべてパスする（後方互換性）
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `docs/services/quick-clip/requirements.md` の F-009 を更新した
- [ ] `docs/services/quick-clip/architecture.md` に ADR-007 を追記した
- [ ] `tasks/quick-clip-emotion-score/` ディレクトリを削除した
