import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { withRetry } from '@nagiyu/common';
import type OpenAI from 'openai';
import type {
  EmotionFilter,
  EmotionHighlightScore,
  EmotionLabel,
} from './highlight-extractor.service.js';
import type { TranscriptSegment } from './transcription.service.js';

const OPENAI_MODEL = 'gpt-5-mini';
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 600_000;
const SEGMENTS_PER_CHUNK = 50;
const EMOTION_SCORING_CONCURRENCY = 3;

const ERROR_MESSAGES = {
  TIMEOUT: 'OpenAI APIの呼び出しがタイムアウトしました',
} as const;

const emotionScoresSchema = z.object({
  items: z.array(
    z.object({
      second: z.number(),
      laugh: z.number(),
      excite: z.number(),
      touch: z.number(),
      tension: z.number(),
    })
  ),
});

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(ERROR_MESSAGES.TIMEOUT));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

function createPrompt(segments: TranscriptSegment[]): string {
  const segmentText = segments.map((s) => `[${s.start.toFixed(1)}] ${s.text.trim()}`).join('\n');

  return [
    'あなたは動画コンテンツの感情分析の専門家です。以下はゲーム実況の文字起こしです。',
    '各セグメントについて、以下の感情カテゴリを 0.0〜1.0 で評価してください:',
    '- laugh: 笑い・面白さ（「草」「ｗｗｗ」「笑」「ウケる」「面白い」なども含む）',
    '- excite: 興奮・盛り上がり（「やばい」「すごい」「マジ」「えぐい」なども含む）',
    '- touch: 感動・エモさ',
    '- tension: 緊張・ドキドキ',
    '',
    '文字起こし:',
    segmentText,
  ].join('\n');
}

function toScore(
  item: { laugh: number; excite: number; touch: number; tension: number },
  filter: EmotionFilter
): number {
  if (filter === 'any') {
    return Math.max(item.laugh, item.excite, item.touch, item.tension);
  }
  return item[filter];
}

function toDominantEmotion(item: {
  laugh: number;
  excite: number;
  touch: number;
  tension: number;
}): EmotionLabel {
  const entries: [EmotionLabel, number][] = [
    ['laugh', item.laugh],
    ['excite', item.excite],
    ['touch', item.touch],
    ['tension', item.tension],
  ];
  return entries.reduce((best, current) => (current[1] > best[1] ? current : best))[0];
}

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

export class EmotionHighlightService {
  private readonly client: OpenAI;

  constructor(client: OpenAI) {
    this.client = client;
  }

  public async getScores(
    segments: TranscriptSegment[],
    filter: EmotionFilter,
    onProgress?: (completed: number, total: number) => Promise<void>
  ): Promise<EmotionHighlightScore[]> {
    const chunks = chunkArray(segments, SEGMENTS_PER_CHUNK);
    console.info(
      `[EmotionHighlightService] getScores 開始: segments=${segments.length} chunks=${chunks.length}`
    );
    const allItems: Array<{
      second: number;
      laugh: number;
      excite: number;
      touch: number;
      tension: number;
    }> = [];

    const responses = await runWithConcurrency(
      chunks.map((chunk, chunkIndex) => async () => {
        console.info(
          `[EmotionHighlightService] チャンク${chunkIndex + 1}/${chunks.length} API 呼び出し開始`
        );
        const response = await withRetry(
          async () =>
            withTimeout(
              this.client.responses.parse({
                model: OPENAI_MODEL,
                stream: false,
                text: {
                  format: zodTextFormat(emotionScoresSchema, 'emotion_scores'),
                },
                input: [
                  {
                    role: 'user',
                    content: [
                      {
                        type: 'input_text',
                        text: createPrompt(chunk),
                      },
                    ],
                  },
                ],
              }),
              REQUEST_TIMEOUT_MS
            ),
          {
            maxRetries: MAX_RETRIES,
            shouldRetry: (error) =>
              !(error instanceof Error && error.message === ERROR_MESSAGES.TIMEOUT),
            logger: {
              warn: (message: string, meta?: Record<string, unknown>) => {
                console.warn(
                  `[EmotionHighlightService] チャンク${chunkIndex + 1}/${chunks.length} リトライ: ${message}`,
                  meta
                );
              },
              error: (message: string, meta?: Record<string, unknown>) => {
                console.error(
                  `[EmotionHighlightService] チャンク${chunkIndex + 1}/${chunks.length} リトライ上限: ${message}`,
                  meta
                );
              },
            },
          }
        );
        console.info(
          `[EmotionHighlightService] チャンク${chunkIndex + 1}/${chunks.length} API 呼び出し完了`
        );
        if (onProgress && chunks.length > 1) {
          await onProgress(chunkIndex + 1, chunks.length);
        }
        return response;
      }),
      EMOTION_SCORING_CONCURRENCY
    );
    for (const response of responses) {
      allItems.push(...(response.output_parsed?.items ?? []));
    }

    return allItems.map((item) => ({
      second: item.second,
      score: toScore(item, filter),
      dominantEmotion: toDominantEmotion(item),
    }));
  }
}
