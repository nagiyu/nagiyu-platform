import {
  HighlightAggregationService,
  HighlightService,
  JobService,
  selectJobDefinition,
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
} from '../../src/index.js';

describe('quick-clip core exports', () => {
  it('主要なサービスがエクスポートされている', () => {
    expect(JobService).toBeDefined();
    expect(HighlightService).toBeDefined();
    expect(HighlightAggregationService).toBeDefined();
  });

  it('主要な型が利用できる', () => {
    const status: JobStatus = 'PENDING';
    const highlightStatus: HighlightStatus = 'unconfirmed';
    const clipStatus: ClipStatus = 'PENDING';
    const jobDefinitionSize: JobDefinitionSize = selectJobDefinition(1024);

    const job: Job = {
      jobId: 'job-1',
      status,
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
      updateStatus: async () => job,
    };

    const highlightRepository: HighlightRepository = {
      getByJobId: async () => [highlight],
      getById: async () => highlight,
      update: async () => highlight,
    };

    expect(createInput.fileSize).toBe(100);
    expect(jobDefinitionSize).toBe('small');
    expect(updateInput.status).toBe('accepted');
    expect(jobRepository).toBeDefined();
    expect(highlightRepository).toBeDefined();
    expect(extractedHighlight).toBeDefined();
    expect(highlightScore).toBeDefined();
    expect(clipSplitter).toBeDefined();
  });
});
