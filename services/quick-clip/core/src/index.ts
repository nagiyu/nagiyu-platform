export type {
  JobStatus,
  HighlightStatus,
  Job,
  Highlight,
  CreateJobInput,
  UpdateHighlightInput,
} from './types.js';

export type { JobRepository } from './repositories/job.repository.interface.js';
export type { HighlightRepository } from './repositories/highlight.repository.interface.js';
export type { EnvironmentVariables, BatchCommand } from './lib/environment.js';

export type {
  ExtractedHighlight,
  HighlightExtractorService,
} from './libs/highlight-extractor.service.js';
export type { ClipSplitterService } from './libs/clip-splitter.service.js';

export { JobService } from './libs/job.service.js';
export { HighlightService } from './libs/highlight.service.js';
export { HighlightAggregationService } from './libs/highlight-aggregation.service.js';
export { validateEnvironment } from './lib/environment.js';
export { FfmpegVideoAnalyzer } from './libs/ffmpeg-video-analyzer.js';
export { MotionHighlightService } from './libs/motion-highlight.service.js';
export { VolumeHighlightService } from './libs/volume-highlight.service.js';
export { FfmpegClipSplitter } from './libs/ffmpeg-clip-splitter.js';
export { runQuickClipBatch } from './libs/quick-clip-batch-runner.js';
export { DynamoDBJobRepository } from './repositories/dynamodb-job.repository.js';
export { DynamoDBHighlightRepository } from './repositories/dynamodb-highlight.repository.js';
