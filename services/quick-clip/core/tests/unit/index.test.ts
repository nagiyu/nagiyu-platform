import {
  HighlightAggregationService,
  HighlightService,
  JobService,
  TranscriptionService,
  EmotionHighlightService,
  createOpenAIClient,
  selectJobDefinition,
  type BatchStage,
  type ClipSplitterService,
  type CreateJobInput,
  type ExtractedHighlight,
  type HighlightScore,
  type Highlight,
  type HighlightRepository,
  type HighlightStatus,
  type ClipStatus,
  type Job,
  type JobDefinitionSize,
  type JobRepository,
  type JobStatus,
  type UpdateHighlightInput,
  type EmotionLabel,
  type EmotionFilter,
  type EmotionScore,
  type EmotionHighlightScore,
  type TranscriptSegment,
} from '../../src/index.js';

describe('quick-clip core exports', () => {
  it('主要なサービスがエクスポートされている', () => {
    expect(JobService).toBeDefined();
    expect(HighlightService).toBeDefined();
    expect(HighlightAggregationService).toBeDefined();
  });

  it('主要な型が利用できる', () => {
    const status: JobStatus = 'PENDING';
    const batchStage: BatchStage = 'downloading';
    const highlightStatus: HighlightStatus = 'unconfirmed';
    const clipStatus: ClipStatus = 'PENDING';
    const jobDefinitionSize: JobDefinitionSize = selectJobDefinition(1024);

    const job: Job = {
      jobId: 'job-1',
      batchJobId: 'batch-1',
      batchStage,
      originalFileName: 'movie.mp4',
      fileSize: 100,
      createdAt: 1,
      expiresAt: 2,
    };

    const highlight: Highlight = {
      highlightId: 'h1',
      jobId: 'job-1',
      order: 1,
      startSec: 10,
      endSec: 20,
      source: 'motion',
      status: highlightStatus,
      clipStatus,
      expiresAt: 2,
    };

    const createInput: CreateJobInput = {
      originalFileName: 'movie.mp4',
      fileSize: 100,
    };

    const updateInput: UpdateHighlightInput = {
      status: 'accepted',
    };

    const extractedHighlight: ExtractedHighlight = {
      startSec: 1,
      endSec: 2,
      score: 10,
      source: 'motion',
    };
    const highlightScore: HighlightScore = {
      second: 1,
      score: 10,
    };

    const clipSplitter: ClipSplitterService = {
      splitClips: async () => ['clip-1.mp4'],
    };

    const jobRepository: JobRepository = {
      getById: async () => job,
      create: async (item) => item,
      updateBatchJobId: async () => undefined,
      updateBatchStage: async () => undefined,
      updateErrorMessage: async () => undefined,
      updateAnalysisProgress: async () => undefined,
    };

    const highlightRepository: HighlightRepository = {
      getByJobId: async () => [highlight],
      getById: async () => highlight,
      update: async () => highlight,
      createMany: async () => undefined,
    };

    expect(status).toBe('PENDING');
    expect(createInput.fileSize).toBe(100);
    expect(jobDefinitionSize).toBe('small');
    expect(updateInput.status).toBe('accepted');
    expect(jobRepository).toBeDefined();
    expect(highlightRepository).toBeDefined();
    expect(extractedHighlight).toBeDefined();
    expect(highlightScore).toBeDefined();
    expect(clipSplitter).toBeDefined();
  });

  it('感情スコア関連の型が利用できる', () => {
    // EmotionLabel は 'laugh' | 'excite' | 'touch' | 'tension' の union 型
    // TypeScript コンパイル時に不正な値は拒否される
    const emotionLabel: EmotionLabel = 'laugh';
    const allEmotionLabels: EmotionLabel[] = ['laugh', 'excite', 'touch', 'tension'];

    // EmotionFilter は EmotionLabel | 'any' の union 型
    const emotionFilter: EmotionFilter = 'any';
    const allEmotionFilters: EmotionFilter[] = ['laugh', 'excite', 'touch', 'tension', 'any'];

    // EmotionScore: スコアは 0.0〜1.0 の範囲（仕様上の制約）
    const emotionScore: EmotionScore = {
      second: 10,
      laugh: 0.8,
      excite: 0.5,
      touch: 0.2,
      tension: 0.3,
    };

    // スコアが 0.0〜1.0 の範囲内であることを確認
    expect(emotionScore.laugh).toBeGreaterThanOrEqual(0);
    expect(emotionScore.laugh).toBeLessThanOrEqual(1);
    expect(emotionScore.excite).toBeGreaterThanOrEqual(0);
    expect(emotionScore.excite).toBeLessThanOrEqual(1);
    expect(emotionScore.touch).toBeGreaterThanOrEqual(0);
    expect(emotionScore.touch).toBeLessThanOrEqual(1);
    expect(emotionScore.tension).toBeGreaterThanOrEqual(0);
    expect(emotionScore.tension).toBeLessThanOrEqual(1);

    const emotionHighlightScore: EmotionHighlightScore = {
      second: 10,
      score: 0.8,
      dominantEmotion: 'laugh',
    };

    // dominantEmotion は EmotionLabel のいずれか
    expect(allEmotionLabels).toContain(emotionHighlightScore.dominantEmotion);

    const transcriptSegment: TranscriptSegment = {
      start: 0,
      end: 5,
      text: 'こんにちは',
    };

    expect(emotionLabel).toBe('laugh');
    expect(emotionFilter).toBe('any');
    expect(allEmotionFilters).toHaveLength(5);
    expect(emotionScore.second).toBe(10);
    expect(emotionHighlightScore.dominantEmotion).toBe('laugh');
    expect(transcriptSegment.text).toBe('こんにちは');
  });

  it('感情分析サービスがエクスポートされている', () => {
    expect(TranscriptionService).toBeDefined();
    expect(EmotionHighlightService).toBeDefined();
    expect(createOpenAIClient).toBeDefined();
  });
});
