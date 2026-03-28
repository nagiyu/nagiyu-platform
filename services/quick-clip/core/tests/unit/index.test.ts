import {
  HighlightAggregationService,
  HighlightService,
  JobService,
  type ClipSplitterService,
  type CreateJobInput,
  type ExtractedHighlight,
  type Highlight,
  type HighlightExtractorService,
  type HighlightRepository,
  type HighlightStatus,
  type Job,
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
    const highlightStatus: HighlightStatus = 'pending';

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
      status: highlightStatus,
    };

    const createInput: CreateJobInput = {
      originalFileName: 'movie.mp4',
      fileSize: 100,
    };

    const updateInput: UpdateHighlightInput = {
      status: 'accepted',
    };

    const extractor: HighlightExtractorService = {
      extractHighlights: async () =>
        [
          {
            startSec: 1,
            endSec: 2,
            score: 10,
            source: 'motion',
          },
        ] as ExtractedHighlight[],
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
    expect(updateInput.status).toBe('accepted');
    expect(jobRepository).toBeDefined();
    expect(highlightRepository).toBeDefined();
    expect(extractor).toBeDefined();
    expect(clipSplitter).toBeDefined();
  });
});
