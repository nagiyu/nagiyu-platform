<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/services/quick-clip/architecture.md に ADR として抽出し、
    tasks/quick-clip-emotion-batch/ ディレクトリごと削除します。

    入力: tasks/quick-clip-emotion-batch/requirements.md
    次に作成するドキュメント: tasks/quick-clip-emotion-batch/tasks.md
-->

# さくっとクリップ 感情分析バッチ分割対応 - 技術設計

---

## 変更対象ファイル

| ファイル | 変更種別 |
| -------- | -------- |
| `services/quick-clip/core/src/libs/emotion-highlight.service.ts` | 修正 |
| `services/quick-clip/core/tests/unit/libs/emotion-highlight.service.test.ts` | テスト追加 |

---

## 現在の実装の概要

エージェントがソースコードを読まなくてもコンテキストを把握できるよう、現状の実装を以下にまとめる。

### `EmotionHighlightService`（`emotion-highlight.service.ts`）

```typescript
const OPENAI_MODEL = 'gpt-5-mini';
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 600_000; // 10分

// Responses API のレスポンス型（Zod スキーマで定義）
const emotionScoresSchema = z.object({
  items: z.array(z.object({
    second: z.number(),
    laugh: z.number(),
    excite: z.number(),
    touch: z.number(),
    tension: z.number(),
  })),
});

// プロンプト生成: 全セグメントを "[timestamp] text\n..." 形式でまとめる
function createPrompt(segments: TranscriptSegment[]): string { ... }

export class EmotionHighlightService {
  public async getScores(
    segments: TranscriptSegment[],
    filter: EmotionFilter
  ): Promise<EmotionHighlightScore[]> {
    // 現状: 全セグメントを1回のリクエストに詰め込む
    const response = await withRetry(
      async () => withTimeout(
        this.client.responses.parse({
          model: OPENAI_MODEL,
          stream: false,
          text: { format: zodTextFormat(emotionScoresSchema, 'emotion_scores') },
          input: [{ role: 'user', content: [{ type: 'input_text', text: createPrompt(segments) }] }],
        }),
        REQUEST_TIMEOUT_MS
      ),
      { maxRetries: MAX_RETRIES, shouldRetry: (error) => !(error instanceof Error && error.message === ERROR_MESSAGES.TIMEOUT) }
    );

    const items = response.output_parsed?.items ?? [];
    return items.map((item) => ({
      second: item.second,
      score: toScore(item, filter),
      dominantEmotion: toDominantEmotion(item),
    }));
  }
}
```

### 呼び出し元（`quick-clip-batch-runner.ts`）

```typescript
// emotionService.getScores が throw した場合は warn ログを出して graceful degradation
try {
  const segments = await transcriptionService.transcribe(localPath);
  if (segments.length > 0) {
    emotionScores = await emotionService.getScores(segments, emotionFilter ?? 'any');
  }
} catch (error) {
  console.warn('[buildHighlights] 感情分析をスキップします:', error);
}
```

---

## 変更内容の設計

### 追加する定数

```typescript
const SEGMENTS_PER_CHUNK = 50; // 1回のAPI呼び出しあたりのセグメント数上限
```

**根拠**: 日本語セグメント 1 件 ≈ 50〜70 トークン。50 件 × 70 トークン ≈ 3,500 入力トークン。
出力（JSON スコア配列）も同程度のトークン数になるため、gpt-5-mini の 128K トークン制限に対して十分な余裕がある。

### 追加するヘルパー関数

```typescript
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
```

- ファイル内部のみ使用（`export` 不要）

### `getScores` の変更後実装

```typescript
public async getScores(
  segments: TranscriptSegment[],
  filter: EmotionFilter
): Promise<EmotionHighlightScore[]> {
  const chunks = chunkArray(segments, SEGMENTS_PER_CHUNK);
  const allItems: Array<{ second: number; laugh: number; excite: number; touch: number; tension: number }> = [];

  for (const chunk of chunks) {
    const response = await withRetry(
      async () =>
        withTimeout(
          this.client.responses.parse({
            model: OPENAI_MODEL,
            stream: false,
            text: { format: zodTextFormat(emotionScoresSchema, 'emotion_scores') },
            input: [
              {
                role: 'user',
                content: [{ type: 'input_text', text: createPrompt(chunk) }],
              },
            ],
          }),
          REQUEST_TIMEOUT_MS
        ),
      {
        maxRetries: MAX_RETRIES,
        shouldRetry: (error) =>
          !(error instanceof Error && error.message === ERROR_MESSAGES.TIMEOUT),
      }
    );

    allItems.push(...(response.output_parsed?.items ?? []));
  }

  return allItems.map((item) => ({
    second: item.second,
    score: toScore(item, filter),
    dominantEmotion: toDominantEmotion(item),
  }));
}
```

**変更のポイント**:
- `withRetry` + `withTimeout` は**チャンクごと**に適用（既存ロジックを流用、変更なし）
- チャンクは**順次処理**（並列化しない）
- 呼び出し元（`quick-clip-batch-runner.ts`）は**変更不要**（インターフェースが変わらない）

---

## コンポーネント設計

### パッケージ責務分担

| パッケージ | 責務 |
| ---------- | ---- |
| `quick-clip/core` | 感情分析チャンク処理ロジック（本変更の対象） |
| `quick-clip/batch` | エントリーポイント（変更なし） |
| `quick-clip/web` | UI（変更なし） |

### 実装モジュール一覧

| モジュール | パス | 役割 |
| ---------- | ---- | ---- |
| `EmotionHighlightService` | `core/src/libs/emotion-highlight.service.ts` | 感情分析（チャンク分割対応） |

---

## テスト設計

既存テストファイル: `core/tests/unit/libs/emotion-highlight.service.test.ts`

### 追加するテストケース

| テストケース | 概要 | 検証内容 |
| ------------ | ---- | -------- |
| チャンク境界: 50件 | 50件のセグメントで `mockParse` が1回呼ばれる | `expect(mockParse).toHaveBeenCalledTimes(1)` |
| チャンク境界: 51件 | 51件のセグメントで `mockParse` が2回呼ばれ、結果が結合される | `expect(mockParse).toHaveBeenCalledTimes(2)` かつ結果が2チャンク分結合されている |
| チャンク内エラーのリトライ | 1チャンク目が1回失敗後に成功する | `expect(mockParse).toHaveBeenCalledTimes(2)`（リトライ1回含む） |

**テストデータ生成のヒント**:
```typescript
const makeSegments = (count: number): TranscriptSegment[] =>
  Array.from({ length: count }, (_, i) => ({
    start: i * 5.0,
    end: i * 5.0 + 4.9,
    text: `セグメント${i + 1}`,
  }));
```

---

## 実装上の注意点

### 依存関係・前提条件

- `withRetry`、`withTimeout` は既存の実装をそのまま使用する（変更不要）
- `chunkArray` はファイルスコープのみ（`export` しない）
- `createPrompt` はチャンク単位のセグメント配列を渡すことで自然にチャンク対応になる（変更不要）

### パフォーマンス考慮事項

- チャンク処理は順次実行（`for...of` ループ、`await` あり）
- 並列化（`Promise.all`）は API レート制限とトークン消費の観点から採用しない

### セキュリティ考慮事項

- 変更なし（OpenAI API キーの扱いは既存のまま）

---

## docs/ への移行メモ

- [ ] `docs/services/quick-clip/architecture.md` に ADR として追記すること：
      感情分析のチャンク分割処理を採用した理由（長尺動画でのトークン上限問題への対処）と `SEGMENTS_PER_CHUNK = 50` の根拠
