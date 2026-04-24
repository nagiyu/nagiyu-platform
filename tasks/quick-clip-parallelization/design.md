# Quick Clip 並列化・パフォーマンス改善 - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/services/quick-clip/architecture.md に ADR として抽出し、
    tasks/quick-clip-parallelization/ ディレクトリごと削除します。

    入力: tasks/quick-clip-parallelization/requirements.md
    次に参照するドキュメント: tasks/quick-clip-parallelization/tasks.md
-->

## 変更対象ファイル

| ファイル | 変更種別 | 内容 |
|---------|---------|------|
| `services/quick-clip/web/src/app/api/jobs/route.ts` | 修正 | 閾値・チャンクサイズ定数を変更 |
| `services/quick-clip/web/src/app/page.tsx` | 修正 | チャンク PUT の並列化、エラー時に abort API を呼ぶ |
| `services/quick-clip/web/src/app/api/jobs/[jobId]/abort-upload/route.ts` | 新規作成 | `AbortMultipartUploadCommand` を呼ぶエンドポイント |
| `services/quick-clip/core/src/libs/transcription.service.ts` | 修正 | チャンク処理の `for` ループを `Promise.all` 化 |
| `services/quick-clip/core/src/libs/emotion-highlight.service.ts` | 修正 | チャンク処理の `for` ループを concurrency limiter 付き `Promise.all` 化 |

---

## Phase 1: マルチパートアップロード改善（Web 層）

### 1-1. 定数変更（`services/quick-clip/web/src/app/api/jobs/route.ts`）

```typescript
// 変更前
const MULTIPART_UPLOAD_THRESHOLD_BYTES = 5 * 1024 * 1024 * 1024;  // 5GB
const MULTIPART_CHUNK_SIZE_BYTES = 500 * 1024 * 1024;              // 500MB

// 変更後
const MULTIPART_UPLOAD_THRESHOLD_BYTES = 100 * 1024 * 1024;        // 100MB
const MULTIPART_CHUNK_SIZE_BYTES = 50 * 1024 * 1024;               // 50MB
```

### 1-2. abort-upload エンドポイント新規作成（`services/quick-clip/web/src/app/api/jobs/[jobId]/abort-upload/route.ts`）

`complete-upload/route.ts` の構造を踏襲する。

- リクエスト: `POST /api/jobs/[jobId]/abort-upload`
- リクエストボディ: `{ uploadId: string }`
- 処理: `AbortMultipartUploadCommand` を S3 に送信する
- レスポンス: 成功時 200、失敗時 500

`AbortMultipartUploadCommand` は AWS SDK `@aws-sdk/client-s3` に含まれる。
S3 キーは `uploads/{jobId}/input.mp4`（`complete-upload` と同じ）。

Job の存在チェック（`jobService.getJob`）は行わなくてよい。
`AbortMultipartUpload` は冪等であり、uploadId が存在しない場合も S3 がエラーを返すだけなので、
追加のバリデーションは不要。

### 1-3. クライアント側 PUT 並列化と abort 呼び出し（`services/quick-clip/web/src/app/page.tsx`）

#### 並列化の方針

現状の `for...of` ループをすべてのチャンクを同時に投げる `Promise.all` に変更する。

```typescript
// 変更後のイメージ
const results = await Promise.all(
  data.multipart.uploadUrls.map(async (uploadUrl, index) => {
    const start = index * chunkSizeBytes;
    const end = Math.min(start + chunkSizeBytes, file.size);
    const chunk = file.slice(start, end);
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': ACCEPTED_FILE_TYPE },
      body: chunk,
    });
    // ETag 取得・エラーチェック
    // ...
    return { PartNumber: index + 1, ETag: eTag, uploadedBytes: chunk.size };
  })
);
const parts = results.map(({ PartNumber, ETag }) => ({ PartNumber, ETag }));
```

#### progress 更新の変更

現状: 各チャンク完了ごとに `uploadedBytes` を加算して進捗を更新（直列前提）。
変更後: `Promise.all` 完了後に 100% にセットする（または各 Promise 内でアトミックに加算する）。

最もシンプルな実装は「全チャンク完了後に 100% にする」。
進捗の細かい更新が必要な場合は、各 Promise 内で `setUploadProgress` を呼ぶが、
React の `setState` は非同期バッチなので厳密な累積は保証されない。

#### エラー時の abort

`Promise.all` がいずれかの Promise で reject した場合（または ETag 取得失敗など）、
`/api/jobs/[jobId]/abort-upload` に `POST` して `AbortMultipartUpload` を呼ぶ。

```typescript
// エラー時の処理イメージ
try {
  const results = await Promise.all(...);
  // complete-upload へ進む
} catch (error) {
  await fetch(`/api/jobs/${data.jobId}/abort-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadId: data.multipart.uploadId }),
  });
  setErrorMessage(ERROR_MESSAGES.UPLOAD_FAILED);
  resetSubmitting();
  return;
}
```

abort API の失敗はユーザー体験に影響しないため、エラーは `console.error` のみとする。

---

## Phase 2: バッチ処理並列化（Core 層）

### 2-1. 文字起こしチャンク並列化（`services/quick-clip/core/src/libs/transcription.service.ts`）

現状コード（`transcribe` メソッド内、24MB 超の場合）:

```typescript
for (let i = 0; i < numChunks; i++) {
  const startSec = i * CHUNK_DURATION_SEC;
  const chunkPath = `/tmp/quick-clip-audio-${randomUUID()}-chunk-${i}.mp3`;
  await this.extractAudioChunk(audioFilePath, chunkPath, startSec, CHUNK_DURATION_SEC);
  try {
    const segments = await this.transcribeFile(chunkPath);
    allSegments.push(...segments.map((s) => ({ ...s, start: s.start + startSec, end: s.end + startSec })));
  } finally {
    await unlink(chunkPath).catch(...);
  }
}
```

並列化方針:
- 各チャンクの `extractAudioChunk → transcribeFile → unlink` をひとつの async 関数にまとめ、`Promise.all` で全チャンクを並列実行する
- `extractAudioChunk` は同じ `audioFilePath`（読み取り専用）に対して複数 FFmpeg プロセスが並列で動く形になるが、読み取り専用アクセスなので問題ない
- 各チャンクのパスは `randomUUID()` で一意なので競合しない
- セグメントの時刻オフセット補正（`s.start + startSec`）は変更不要、各チャンクの Promise 内で行う
- 並列実行後、結果を `index` でソートして `allSegments` に結合する（元の順序を保証するため）

```typescript
// 変更後のイメージ
const chunkSegments = await Promise.all(
  Array.from({ length: numChunks }, async (_, i) => {
    const startSec = i * CHUNK_DURATION_SEC;
    const chunkPath = `/tmp/quick-clip-audio-${randomUUID()}-chunk-${i}.mp3`;
    await this.extractAudioChunk(audioFilePath, chunkPath, startSec, CHUNK_DURATION_SEC);
    try {
      const segments = await this.transcribeFile(chunkPath);
      return segments.map((s) => ({
        start: s.start + startSec,
        end: s.end + startSec,
        text: s.text,
      }));
    } finally {
      await unlink(chunkPath).catch((err: unknown) => {
        console.warn('[TranscriptionService] チャンクファイルの削除に失敗しました:', err);
      });
    }
  })
);
return chunkSegments.flat();
```

`Promise.all` は配列の順序を保持するため、`flat()` でそのまま結合すれば時刻順が保たれる。

### 2-2. 感情スコアリングチャンク並列化（`services/quick-clip/core/src/libs/emotion-highlight.service.ts`）

現状コード（`getScores` メソッド内）:

```typescript
for (const chunk of chunks) {
  const response = await withRetry(
    async () => withTimeout(this.client.responses.parse({...}), REQUEST_TIMEOUT_MS),
    { maxRetries: MAX_RETRIES, shouldRetry: ... }
  );
  allItems.push(...(response.output_parsed?.items ?? []));
}
```

並列化方針:
- `chunks` 配列を `EMOTION_SCORING_CONCURRENCY`（初期値 3）件ずつ並列で処理する
- concurrency limiter は外部ライブラリ不使用で実装する
- 結果の順序は `chunks` の順序を保持する（`allItems` への結合順序が変わると aggregate の結果に影響する可能性があるため）

concurrency limiter の実装例（外部ライブラリ不使用）:

```typescript
const EMOTION_SCORING_CONCURRENCY = 3;

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}
```

`getScores` メソッド内での使用例:

```typescript
const responses = await runWithConcurrency(
  chunks.map((chunk) => () =>
    withRetry(
      async () => withTimeout(this.client.responses.parse({...}), REQUEST_TIMEOUT_MS),
      { maxRetries: MAX_RETRIES, shouldRetry: ... }
    )
  ),
  EMOTION_SCORING_CONCURRENCY
);
for (const response of responses) {
  allItems.push(...(response.output_parsed?.items ?? []));
}
```

---

## 実装上の注意点

- `AbortMultipartUpload` はクライアントから直接 S3 を叩くのではなく Web サーバー経由の API として実装する（S3 クライアントが Web サーバー側に存在するため）
- 進捗バー（`uploadProgress`）は並列化後は「全チャンク完了後に 100%」が最もシンプル。詳細な進捗が必要な要件があれば別途検討する
- `runWithConcurrency` ヘルパー関数は `emotion-highlight.service.ts` 内のモジュールスコープに定義するか、共通ユーティリティとして `core/src/libs/` に切り出すか、既存のユーティリティがあれば再利用する

---

## Phase 5: 解析進捗可視化 & モーション+音量+文字起こし並列化

### 変更対象ファイル（Phase 5）

| ファイル | 変更種別 | 内容 |
|---------|---------|------|
| `services/quick-clip/core/src/types.ts` | 修正 | `AnalysisProgress` 型・`Job` 型に `analysisProgress` フィールド追加 |
| `services/quick-clip/core/src/libs/job.service.ts` | 修正 | `updateAnalysisProgress()` メソッド追加 |
| `services/quick-clip/core/src/libs/dynamodb-job.repository.ts` | 修正 | `updateAnalysisProgress()` DynamoDB 実装追加 |
| `services/quick-clip/core/src/libs/transcription.service.ts` | 修正 | `transcribe()` にオプションの進捗コールバック追加 |
| `services/quick-clip/core/src/libs/emotion-highlight.service.ts` | 修正 | `getScores()` にオプションの進捗コールバック追加 |
| `services/quick-clip/core/src/libs/quick-clip-batch-runner.ts` | 修正 | 並列実行への変更・各処理の進捗コールバックで DynamoDB 更新 |
| `services/quick-clip/web/src/app/api/jobs/[jobId]/route.ts` | 修正 | レスポンスに `analysisProgress` を追加 |
| `services/quick-clip/web/src/app/jobs/[jobId]/page.tsx` | 修正 | 解析ステップにサブ項目 UI を追加 |

---

### 5-1. データモデル（`services/quick-clip/core/src/types.ts`）

```typescript
export interface AnalysisProgressItem {
    status: 'in_progress' | 'done' | 'failed';
    completed?: number; // total > 1 のチャンク分割時のみ設定
    total?: number;     // total > 1 のチャンク分割時のみ設定
}

export interface AnalysisProgress {
    motion: AnalysisProgressItem;
    volume: AnalysisProgressItem;
    transcription?: AnalysisProgressItem;  // openAiApiKey 設定時のみ
    emotionScoring?: AnalysisProgressItem; // 文字起こし完了後・感情分析開始時に追加
}
```

`Job` 型に `analysisProgress?: AnalysisProgress` フィールドを追加する。

---

### 5-2. DynamoDB 更新メソッド

**`dynamodb-job.repository.ts`** に `updateAnalysisProgress(jobId, progress)` を追加する。
既存の `updateBatchStage()` と同じパターンで `analysisProgress` フィールドを SET する。

**`job.service.ts`** に対応するラッパーメソッドを追加する。

---

### 5-3. 並列実行への変更（`quick-clip-batch-runner.ts`）

**変更前（現状）:**
```typescript
const [motionScores, volumeScores] = await Promise.all([
    motionService.analyzeMotion(localPath),
    volumeService.analyzeVolume(localPath),
]);
// 完了後に逐次実行
const segments = await transcriptionService.transcribe(localPath);
```

**変更後:**
```typescript
// 並列実行開始前に初期進捗を DynamoDB に書き込む
const initialProgress: AnalysisProgress = {
    motion: { status: 'in_progress' },
    volume: { status: 'in_progress' },
    ...(openAiApiKey ? { transcription: { status: 'in_progress' } } : {}),
};
await updateAnalysisProgress(jobId, initialProgress, ...);

// mutable な共有オブジェクトを then チェーンで更新する
// （Node.js シングルスレッドのためコールバック間の競合なし）
const progress = { ...initialProgress };

const [motionScores, volumeScores, segments] = await Promise.all([
    motionService.analyzeMotion(localPath).then(async (scores) => {
        progress.motion = { status: 'done' };
        await updateAnalysisProgress(jobId, progress, ...);
        return scores;
    }),
    volumeService.analyzeVolume(localPath).then(async (scores) => {
        progress.volume = { status: 'done' };
        await updateAnalysisProgress(jobId, progress, ...);
        return scores;
    }),
    openAiApiKey
        ? transcriptionService.transcribe(localPath, async (completed, total) => {
              progress.transcription = {
                  status: completed === total ? 'done' : 'in_progress',
                  ...(total > 1 ? { completed, total } : {}),
              };
              await updateAnalysisProgress(jobId, progress, ...);
          }).catch(async (err) => {
              console.warn('[buildHighlights] 文字起こしをスキップします:', err);
              progress.transcription = { status: 'failed' };
              await updateAnalysisProgress(jobId, progress, ...);
              return [] as Segment[];
          })
        : Promise.resolve([] as Segment[]),
]);

// 感情分析は 3 つ全て完了後に開始
if (openAiApiKey && segments.length > 0) {
    progress.emotionScoring = { status: 'in_progress' };
    await updateAnalysisProgress(jobId, progress, ...);

    try {
        emotionScores = await emotionService.getScores(
            segments,
            emotionFilter ?? 'any',
            async (completed, total) => {
                progress.emotionScoring = {
                    status: completed === total ? 'done' : 'in_progress',
                    ...(total > 1 ? { completed, total } : {}),
                };
                await updateAnalysisProgress(jobId, progress, ...);
            }
        );
    } catch (err) {
        console.warn('[buildHighlights] 感情分析をスキップします:', err);
        progress.emotionScoring = { status: 'failed' };
        await updateAnalysisProgress(jobId, progress, ...);
    }
}
```

---

### 5-4. TranscriptionService への進捗コールバック追加

```typescript
// 変更後のシグネチャ
async transcribe(
    videoFilePath: string,
    onProgress?: (completed: number, total: number) => Promise<void>
): Promise<Segment[]>
```

**呼び出しタイミング:**
- チャンク分割あり（numChunks > 1）: 各チャンクの処理完了時に `onProgress(完了数, numChunks)` を呼ぶ
    - 既存の `Promise.all` 内で、各チャンクの処理完了後にアトミックにカウンターをインクリメントして呼ぶ
- チャンク分割なし（numChunks === 1 または単一ファイル処理）: `onProgress` は呼ばない
    - `total=1` の場合はサブ表示不要（UI 側でも `total > 1` 条件で分岐）

---

### 5-5. EmotionHighlightService への進捗コールバック追加

```typescript
// 変更後のシグネチャ
async getScores(
    segments: Segment[],
    emotionFilter: EmotionFilter,
    onProgress?: (completed: number, total: number) => Promise<void>
): Promise<EmotionHighlightScore[]>
```

**呼び出しタイミング:**
- 各チャンク処理完了後に `onProgress(完了数, chunks.length)` を呼ぶ
- chunks.length === 1 の場合は `onProgress` は呼ばない

既存の `runWithConcurrency` 内で、各タスクの完了後にコールバックを呼ぶ形で実装する。
completedCount は並列実行されるがシングルスレッドなので安全にインクリメントできる。

---

### 5-6. Web API 変更（`/api/jobs/[jobId]/route.ts`）

レスポンスに `analysisProgress` を追加する。
返却条件: `status === 'PROCESSING'` かつ `batchStage === 'analyzing'` かつ `job.analysisProgress` が存在する場合。

```typescript
...(status === 'PROCESSING' && job.batchStage === 'analyzing' && job.analysisProgress
    ? { analysisProgress: job.analysisProgress }
    : {}),
```

---

### 5-7. UI 変更（`/jobs/[jobId]/page.tsx`）

`JobApiResponse` 型に `analysisProgress?: AnalysisProgress` を追加する（`AnalysisProgress` / `AnalysisProgressItem` 型は core から import するか同等の型をローカル定義する）。

解析ステップの `StepLabel` の `optional` を、`analysisProgress` がある場合はサブ項目リストに差し替える。

```tsx
// サブ項目の表示例（MUI の Typography + CircularProgress / CheckCircle / Warning アイコンで実装）
{job.analysisProgress ? (
    <Stack spacing={0.5}>
        <AnalysisItem label="モーション解析" item={job.analysisProgress.motion} />
        <AnalysisItem label="音量解析" item={job.analysisProgress.volume} />
        {job.analysisProgress.transcription && (
            <AnalysisItem label="文字起こし" item={job.analysisProgress.transcription} />
        )}
        {job.analysisProgress.emotionScoring && (
            <AnalysisItem label="感情分析" item={job.analysisProgress.emotionScoring} />
        )}
    </Stack>
) : (
    <Typography variant="caption">{BATCH_STAGE_LABELS[job.batchStage]}</Typography>
)}
```

`AnalysisItem` はファイル内のローカルコンポーネントとして実装する（新規ファイル不要）。

| 状態 | 表示 |
|-----|------|
| `status: 'in_progress'`、`total` なし | `CircularProgress (size=12)` + "ラベル" |
| `status: 'in_progress'`、`total > 1` | `CircularProgress (size=12)` + "ラベル (X/Y)" |
| `status: 'done'` | CheckCircle アイコン（緑）+ "ラベル" |
| `status: 'failed'` | Warning アイコン（橙）+ "ラベル（スキップ）" |

`failed` は文字起こし・感情分析の graceful degradation 時のみ発生する（モーション・音量は失敗するとジョブ全体が FAILED になるため `failed` 状態にはならない）。

---

## docs/ への移行メモ

<!-- 開発完了後にここを確認し、docs/ を更新してからこのディレクトリを削除する -->

- [ ] `docs/services/quick-clip/architecture.md` に ADR として追記すること:
      マルチパートアップロード閾値変更の理由（5GB → 100MB）、
      感情スコアリング concurrency limiter の設計決定
