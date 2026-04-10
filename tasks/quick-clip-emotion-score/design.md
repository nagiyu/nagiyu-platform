<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/services/quick-clip/architecture.md に ADR として抽出し、
    tasks/quick-clip-emotion-score/ ディレクトリごと削除します。

    入力: tasks/quick-clip-emotion-score/requirements.md
    次に作成するドキュメント: tasks/quick-clip-emotion-score/tasks.md
-->

# さくっとクリップ - 感情スコアによる見どころ抽出 技術設計

---

## API 仕様

### エンドポイント一覧（変更分のみ）

| メソッド | パス | 説明 | 変更内容 |
| ------- | ---- | ---- | -------- |
| POST | /api/jobs | ジョブ作成・単一アップロード | リクエストに `emotionFilter` 追加 |
| POST | /api/jobs/[jobId]/complete-upload | マルチパートアップロード完了 | リクエストに `emotionFilter` 追加 |

### POST /api/jobs

**リクエスト（変更後）**

```typescript
type CreateJobRequest = {
    fileName: string;
    fileSize: number;
    contentType?: string;
    emotionFilter?: EmotionFilter;  // 追加。未指定時は 'any' として扱う
};
```

**変更点**:
- `emotionFilter` を Batch `containerOverrides.environment` に `EMOTION_FILTER` として追加する
- `OPENAI_API_KEY` を `web/src/lib/server/aws.ts` の `getOpenAiApiKey()` で取得し、Batch env に `OPENAI_API_KEY` として追加する

**Batch 投入時の追加 environment**:

```typescript
{ name: 'OPENAI_API_KEY', value: getOpenAiApiKey() ?? '' },
{ name: 'EMOTION_FILTER', value: body.emotionFilter ?? 'any' },
```

### POST /api/jobs/[jobId]/complete-upload

**リクエスト（変更後）**

```typescript
type CompleteUploadRequest = {
    uploadId: string;
    parts: CompletedPart[];
    emotionFilter?: EmotionFilter;  // 追加
};
```

**変更点**:
- `POST /api/jobs` と同様に Batch env に `OPENAI_API_KEY`・`EMOTION_FILTER` を追加する

---

## データモデル

### 論理モデル（追加・変更分）

```typescript
// highlight-extractor.service.ts に追加
export type EmotionLabel = 'laugh' | 'excite' | 'touch' | 'tension';
export type EmotionFilter = EmotionLabel | 'any';

// HighlightSource に 'emotion' を追加
export type HighlightSource = 'motion' | 'volume' | 'emotion' | 'both';

// ExtractedHighlight に dominantEmotion を追加
export type ExtractedHighlight = {
    startSec: number;
    endSec: number;
    score: number;
    source: HighlightSource;
    dominantEmotion?: EmotionLabel;  // 追加（emotion ソース由来のときのみ設定）
};

// 新規型
export type EmotionScore = {
    second: number;
    laugh: number;
    excite: number;
    touch: number;
    tension: number;
};

// EmotionHighlightService が返す集計用スコア
export type EmotionHighlightScore = {
    second: number;
    score: number;
    dominantEmotion: EmotionLabel;
};
```

```typescript
// types.ts の Highlight に dominantEmotion を追加
export type Highlight = {
    highlightId: string;
    jobId: string;
    order: number;
    startSec: number;
    endSec: number;
    source: HighlightSource;
    status: HighlightStatus;
    clipStatus: ClipStatus;
    dominantEmotion?: EmotionLabel;  // 追加
};

// quick-clip-batch-runner.ts の QuickClipBatchRunInput に追加
export type QuickClipBatchRunInput = {
    command: QuickClipBatchCommand;
    jobId: string;
    tableName: string;
    bucketName: string;
    awsRegion: string;
    openAiApiKey?: string;           // 追加（未設定時は感情分析をスキップ）
    emotionFilter?: EmotionFilter;   // 追加（未指定時は 'any'）
};
```

### 物理モデル（DynamoDB）

#### Highlight アイテム（変更後）

```typescript
// dynamodb-highlight.repository.ts の HighlightItem に追加
type HighlightItem = {
    PK: string;
    SK: string;
    Type: 'HIGHLIGHT';
    highlightId: string;
    jobId: string;
    order: number;
    startSec: number;
    endSec: number;
    source: HighlightSource;
    status: HighlightStatus;
    clipStatus: ClipStatus;
    dominantEmotion?: string;  // 追加（DynamoDB スキーマ変更なし。オプション属性として追加）
};
```

**`createMany` の変更点**:

現在の `UpdateExpression` は全フィールドを静的に列挙しているが、`dominantEmotion` はオプションのため条件付きで追加する。
具体的には、`dominantEmotion` が存在する場合のみ `SET` 式・属性名・属性値に追加する処理を加える。

`mapToEntity` に `dominantEmotion` のマッピングを追加する:

```typescript
private mapToEntity(item: HighlightItem): Highlight {
    return {
        // ...既存フィールド
        dominantEmotion: item.dominantEmotion as EmotionLabel | undefined,
    };
}
```

---

## コンポーネント設計

### パッケージ責務分担

| パッケージ | 責務 |
| --------- | ---- |
| `quick-clip/core` | 感情スコア算出・型定義・集計ロジック拡張 |
| `quick-clip/web` | emotionFilter パラメータ受け取り・Batch env への橋渡し |
| `quick-clip/batch` | 環境変数から emotionFilter・openAiApiKey を読み取り core へ渡す |

### 実装モジュール一覧

**新規作成**

| モジュール | パス | 役割 |
| --------- | ---- | ---- |
| `createOpenAIClient` | `core/src/libs/openai-client.ts` | OpenAI クライアントファクトリ（Stock Tracker 準拠） |
| `TranscriptionService` | `core/src/libs/transcription.service.ts` | gpt-4o-mini-transcribe による文字起こし |
| `EmotionHighlightService` | `core/src/libs/emotion-highlight.service.ts` | gpt-5-mini Responses API による感情スコア算出 |

**変更**

| モジュール | パス | 変更内容 |
| --------- | ---- | -------- |
| `HighlightSource` 等 | `core/src/libs/highlight-extractor.service.ts` | `EmotionLabel`, `EmotionFilter`, `EmotionScore`, `EmotionHighlightScore` 追加。`HighlightSource` に `'emotion'` 追加。`ExtractedHighlight` に `dominantEmotion?` 追加 |
| `Highlight`, `QuickClipBatchRunInput` | `core/src/types.ts` と `core/src/libs/quick-clip-batch-runner.ts` | 上記データモデルの変更を適用 |
| `HighlightAggregationService` | `core/src/libs/highlight-aggregation.service.ts` | 3ソース round-robin 対応（後述） |
| `buildHighlights` | `core/src/libs/quick-clip-batch-runner.ts` | 文字起こし・感情スコア算出を追加 |
| `DynamoDBHighlightRepository` | `core/src/repositories/dynamodb-highlight.repository.ts` | `dominantEmotion` の保存・取得を追加 |
| `validateEnvironment` | `batch/src/lib/environment.ts` | `OPENAI_API_KEY`・`EMOTION_FILTER` の読み取りを追加 |
| `getOpenAiApiKey` | `web/src/lib/server/aws.ts` | `OPENAI_API_KEY` 環境変数取得関数を追加（任意項目。未設定時 `undefined` を返す） |
| `POST /api/jobs` | `web/src/app/api/jobs/route.ts` | `emotionFilter` を受け取り Batch env に渡す |
| `POST /api/jobs/[jobId]/complete-upload` | `web/src/app/api/jobs/[jobId]/complete-upload/route.ts` | `emotionFilter` を受け取り Batch env に渡す |

### モジュール間インターフェース

#### `openai-client.ts`

```typescript
// Stock Tracker の openai-client.ts を参照。パターンを合わせる。
// services/stock-tracker/batch/src/lib/openai-client.ts
import OpenAI from 'openai';

export const createOpenAIClient = (apiKey: string): OpenAI =>
    new OpenAI({ apiKey, maxRetries: 0 });
```

#### `transcription.service.ts`

```typescript
// POST /v1/audio/transcriptions (response_format: 'verbose_json') でセグメント付きトランスクリプトを取得
export type TranscriptSegment = {
    start: number;  // 開始秒
    end: number;    // 終了秒
    text: string;
};

export class TranscriptionService {
    constructor(private readonly client: OpenAI) {}

    public async transcribe(audioFilePath: string): Promise<TranscriptSegment[]>;
    // 実装: fs.createReadStream でファイルを読み込み audio.transcriptions.create() を呼び出す
    // model: 'gpt-4o-mini-transcribe', response_format: 'verbose_json'
    // 返却: verbose_json の segments フィールドを TranscriptSegment[] に変換
    // エラー時: 例外をそのままスロー（呼び出し側で catch して graceful degradation）
}
```

##### 音声ファイルサイズ対応（バグ修正）

**問題**: WAV (16kHz mono) は ~1.875 MB/分のため、~13 分超の動画で Whisper API の 25MB 上限を超え 413 エラーになる。さくっとクリップは 3 時間程度の動画も受け付けるため対応が必要。

**対応**: WAV → MP3 (32kbps mono) に変換し、24MB 超の場合はチャンク分割して送信する。

**定数**:
- `MAX_FILE_SIZE_BYTES = 24 * 1024 * 1024`（安全マージン）
- `MP3_BYTES_PER_SEC = 32000 / 8`（32kbps mono = 4000 bytes/sec）
- `CHUNK_DURATION_SEC = Math.floor(MAX_FILE_SIZE_BYTES / MP3_BYTES_PER_SEC)`（≈ 6144 sec ≈ 102 分）

**処理フロー（変更後の `transcribe()`）**:

1. `extractAudio()` で MP3 (32kbps mono) に変換（FFmpeg: `-c:a libmp3lame -b:a 32k -f mp3`）
2. `fs.stat()` でファイルサイズ確認
3. サイズ ≤ 24MB → `transcribeFile()` で直接送信（~102 分以内をカバー）
4. サイズ > 24MB → チャンク分割:
    - `estimatedDurationSec = size / MP3_BYTES_PER_SEC` でおおよその長さを推定
    - `numChunks = Math.ceil(estimatedDurationSec / CHUNK_DURATION_SEC)`
    - 各チャンクを `extractAudioChunk()` で MP3 から時間切り出し（FFmpeg: `-ss -t -c:a copy`）
    - `transcribeFile()` で送信し、セグメントに `startSec` オフセットを加算
    - チャンクファイルを `finally` で削除
5. 元の MP3 ファイルを `finally` で削除

**追加 private メソッド**:
- `runFfmpeg(args: string[]): Promise<void>` — 共通 FFmpeg 実行（既存 `extractAudio` 内ロジックを移動）
- `extractAudioChunk(audioFilePath, chunkOutputPath, startSec, durationSec): Promise<void>`
- `transcribeFile(audioFilePath): Promise<TranscriptSegment[]>` — 単一ファイルを API 送信

**インポート追加**: `stat` from `node:fs/promises`

#### `emotion-highlight.service.ts`

```typescript
// Responses API + zodTextFormat で感情スコアを一括取得
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { withRetry } from '@nagiyu/common';

export class EmotionHighlightService {
    constructor(private readonly client: OpenAI) {}

    public async getScores(
        segments: TranscriptSegment[],
        filter: EmotionFilter
    ): Promise<EmotionHighlightScore[]>;
    // 実装: segments を1回の gpt-5-mini Responses API 呼び出しで処理
    // Zod スキーマ: z.array(z.object({ second: z.number(), laugh: z.number(), excite: z.number(), touch: z.number(), tension: z.number() }))
    // zodTextFormat(schema, 'emotion_scores') でフォーマット指定
    // withRetry({ maxRetries: 3 }) でリトライ
    // withTimeout は @nagiyu/common に含まれないため、Stock Tracker のローカル実装
    //   (services/stock-tracker/batch/src/lib/openai-client.ts の withTimeout 関数)
    //   を emotion-highlight.service.ts 内にそのままコピーして使用する
    // filter に応じてスコア列を選択:
    //   'any' → Math.max(laugh, excite, touch, tension)
    //   その他 → 対応するカテゴリのスコアをそのまま使用
    // dominantEmotion: 常に4カテゴリの中の最大値のラベルを設定
    // 返却: EmotionHighlightScore[] = { second, score, dominantEmotion }[]
}
```

**gpt-5-mini プロンプト（概要）**:

出力形式は `zodTextFormat` がAPIレベルで強制するため、プロンプトには分析指示のみを記述する（Stock Tracker と同じアプローチ）。

```
あなたは動画コンテンツの感情分析の専門家です。以下はゲーム実況の文字起こしです。
各セグメントについて、以下の感情カテゴリを 0.0〜1.0 で評価してください:
- laugh: 笑い・面白さ（「草」「ｗｗｗ」「笑」「ウケる」「面白い」なども含む）
- excite: 興奮・盛り上がり（「やばい」「すごい」「マジ」「えぐい」なども含む）
- touch: 感動・エモさ
- tension: 緊張・ドキドキ

文字起こし:
{segments を以下の形式でテキスト化。second には segment.start を使用}
[0.0] やばい！これは面白すぎるwww
[5.3] マジで？どういうことだよ
...
```

**segments テキスト化の実装**:

```typescript
const segmentText = segments
    .map(s => `[${s.start.toFixed(1)}] ${s.text.trim()}`)
    .join('\n');
```

GPT が返す各要素の `second` は上記の `segment.start` に対応する。GPT がセグメントを省略したり異なる second を返した場合でも、`EmotionHighlightScore[]` として受け取ればスコアリングに使えるため問題ない（全セグメントへの1対1対応は不要）。

#### `highlight-aggregation.service.ts`（変更後）

3ソース round-robin に拡張する。`emotionScores` が空配列 or 未指定の場合は2ソース動作を維持する（既存テストの後方互換性を保つ）。

```typescript
public aggregate(
    motionScores: HighlightScore[],
    volumeScores: HighlightScore[],
    duration: number,
    emotionScores?: EmotionHighlightScore[]  // 追加（オプション）
): ExtractedHighlight[]
```

**実装アルゴリズム変更**:

`EmotionHighlightScore` は `dominantEmotion` を持つため、motion/volume と同じ `HighlightScore[]` の sources 配列には混在させない。emotion ソースだけ別途管理し、ピーク選択時に `dominantEmotion` を直接参照する。

```typescript
// motion・volume は既存の HighlightScore[] のまま
const sortedMotion = [...motionScores].sort((a, b) => b.score - a.score);
const sortedVolume = [...volumeScores].sort((a, b) => b.score - a.score);
// emotion は EmotionHighlightScore[] のままソート（dominantEmotion を保持するため）
const sortedEmotion = emotionScores ? [...emotionScores].sort((a, b) => b.score - a.score) : [];

const hasEmotion = sortedEmotion.length > 0;
// ソース数: emotion があれば3、なければ2
const sourceCount = hasEmotion ? 3 : 2;
let motionIdx = 0, volumeIdx = 0, emotionIdx = 0;
let currentSourceIdx = 0;

while (accepted.length < MAX_HIGHLIGHTS) {
    const sourceSlot = currentSourceIdx % sourceCount;
    // sourceSlot 0 → motion, 1 → volume, 2 → emotion
    if (sourceSlot === 0) {
        if (motionIdx >= sortedMotion.length) { /* スキップ */ }
        else { const clip = toClip(sortedMotion[motionIdx++], 'motion', duration); ... }
    } else if (sourceSlot === 1) {
        if (volumeIdx >= sortedVolume.length) { /* スキップ */ }
        else { const clip = toClip(sortedVolume[volumeIdx++], 'volume', duration); ... }
    } else {
        if (emotionIdx >= sortedEmotion.length) { /* スキップ */ }
        else {
            const peak = sortedEmotion[emotionIdx++];
            // EmotionHighlightScore から dominantEmotion を直接取得
            const clip = toClip(peak, 'emotion', duration, peak.dominantEmotion);
            ...
        }
    }
    currentSourceIdx++;
    // 全ソースが枯渇したら終了
}
```

`toClip` に `dominantEmotion` オプションを追加:

```typescript
const toClip = (
    peak: HighlightScore,
    source: Exclude<HighlightSource, 'both'>,
    duration: number,
    dominantEmotion?: EmotionLabel
): ExtractedHighlight => ({
    startSec: Math.max(0, peak.second - CLIP_HALF_WINDOW_SECONDS),
    endSec: Math.min(duration, peak.second + CLIP_HALF_WINDOW_SECONDS),
    score: peak.score,
    source,
    dominantEmotion,
});
```

`mergeHighlights` に `dominantEmotion` マージを追加:

```typescript
const mergeHighlights = (
    left: ExtractedHighlight,
    right: ExtractedHighlight
): ExtractedHighlight => ({
    startSec: Math.min(left.startSec, right.startSec),
    endSec: Math.max(left.endSec, right.endSec),
    score: Math.max(left.score, right.score),
    source: mergeSource(left.source, right.source),
    dominantEmotion: left.score >= right.score ? left.dominantEmotion : right.dominantEmotion,
});
```

#### `quick-clip-batch-runner.ts`（`buildHighlights` 変更後）

```typescript
const buildHighlights = async (
    jobId: string,
    localPath: string,
    openAiApiKey?: string,
    emotionFilter?: EmotionFilter
): Promise<Highlight[]> => {
    const analyzer = new FfmpegVideoAnalyzer();
    const motionService = new MotionHighlightService(analyzer);
    const volumeService = new VolumeHighlightService(analyzer);
    const duration = await analyzer.getDurationSec(localPath);
    const [motionScores, volumeScores] = await Promise.all([
        motionService.analyzeMotion(localPath),
        volumeService.analyzeVolume(localPath),
    ]);

    let emotionScores: EmotionHighlightScore[] = [];
    if (openAiApiKey) {
        try {
            const openai = createOpenAIClient(openAiApiKey);
            const transcriptionService = new TranscriptionService(openai);
            const emotionService = new EmotionHighlightService(openai);
            const segments = await transcriptionService.transcribe(localPath);
            if (segments.length > 0) {
                emotionScores = await emotionService.getScores(segments, emotionFilter ?? 'any');
            }
        } catch (error) {
            // 感情分析失敗は graceful degradation（motion・volume のみで継続）
            console.warn('[buildHighlights] 感情分析をスキップします:', error);
        }
    }

    const aggregationService = new HighlightAggregationService();
    const extracted = aggregationService.aggregate(
        motionScores,
        volumeScores,
        duration,
        emotionScores.length > 0 ? emotionScores : undefined
    );
    // ...以降は既存と同様
};
```

---

## 実装上の注意点

### 依存関係・前提条件

- `core/package.json` に `openai ^6.33.0`（Stock Tracker と同バージョン）と `zod`・`@nagiyu/common` を追加する
- **参照実装**: `services/stock-tracker/batch/src/lib/openai-client.ts`（Responses API + zodTextFormat の実装パターン）
- **参照テスト**: `services/stock-tracker/batch/tests/unit/lib/openai-client.test.ts`（モックパターン）
- `@nagiyu/common` の `withRetry` を使用（Stock Tracker と同様）

### インフラ（Secrets Manager + CDK コンテキスト）

`OPENAI_API_KEY` は Secrets Manager で管理する。Stock Tracker と同パターン:

- **参照実装**: `infra/stock-tracker/lib/secrets-stack.ts`・`infra/stock-tracker/bin/stock-tracker.ts`
- 初回デプロイ時は `PLACEHOLDER` 値でシークレットを作成し、デプロイ後に AWS Console から実際の API キーを手動で差し替える
- シークレット名の命名規則: `nagiyu-quick-clip-openai-api-key-{environment}`

**注入の仕組み（実行時に Secrets Manager は呼ばない）**:

```
① AWS Console でシークレットの値を実際の API キーに更新
② CDK デプロイ時に --context openAiApiKey=xxx でキーを渡す
③ bin/quick-clip.ts で tryGetContext('openAiApiKey') || 'PLACEHOLDER' として受け取る
④ LambdaStack の environment: { OPENAI_API_KEY: openAiApiKey } で Lambda env に直接注入
⑤ Lambda は process.env.OPENAI_API_KEY を読むだけ
⑥ Batch へは containerOverrides.environment 経由で渡す
```

### OpenAI API 仕様

- **文字起こし**: `POST /v1/audio/transcriptions`
    - `model: 'gpt-4o-mini-transcribe'`
    - `response_format: 'verbose_json'`（セグメント付きタイムスタンプを取得）
    - `language: 'ja'`（日本語指定で精度向上）
    - SDK: `client.audio.transcriptions.create()`
- **感情分析**: `client.responses.parse()`（Responses API）
    - `model: 'gpt-5-mini'`
    - `stream: false`
    - `tools: なし`（web_search 不要）
    - `zodTextFormat(emotionScoresSchema, 'emotion_scores')`
    - リトライ: `withRetry` + `withTimeout`（120秒）

### パフォーマンス考慮事項

- 文字起こしと感情分析は逐次実行（前者の結果を後者に渡すため）
- 感情スコアは秒単位で保持し、将来のパート分割では時間範囲でフィルタするだけで対応可能

### セキュリティ考慮事項

- `OPENAI_API_KEY` は `batch/src/lib/environment.ts` で読み取り、`QuickClipBatchRunInput.openAiApiKey` に格納
- `web/src/lib/server/aws.ts` に `getOpenAiApiKey(): string | undefined` を追加（`OPENAI_API_KEY` が未設定の場合 `undefined` を返す）

---

## docs/ への移行メモ

- [ ] `docs/services/quick-clip/requirements.md` の F-009 を今回実装した内容に更新すること:
      感情スコアによる見どころ抽出の機能説明、受け入れ条件を記述
- [ ] `docs/services/quick-clip/architecture.md` に ADR-007 として追記すること:
      感情スコア統合の設計決定（gpt-4o-mini-transcribe + gpt-5-mini Responses API、3ソース round-robin、graceful degradation 方針）
