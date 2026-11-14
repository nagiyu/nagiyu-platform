export type {
  JobStatus,
  BatchStage,
  HighlightStatus,
  JobKey,
  HighlightKey,
  ClipStatus,
  Job,
  Highlight,
  CreateJobInput,
  UpdateHighlightInput,
  AnalysisProgressItem,
  AnalysisProgress,
  UsageKind,
  UsageRecord,
} from './types.js';

export type { JobRepository } from './repositories/job.repository.interface.js';
export type { UsageRepository, UsageCounts } from './repositories/usage.repository.interface.js';
export type { HighlightRepository } from './repositories/highlight.repository.interface.js';
export type {
  QuickClipBatchRunInput,
  QuickClipBatchCommand,
} from './libs/quick-clip-batch-runner.js';

export type {
  ExtractedHighlight,
  HighlightScore,
  HighlightSource,
  EmotionLabel,
  EmotionFilter,
  EmotionScore,
  EmotionHighlightScore,
} from './libs/highlight-extractor.service.js';
export type { ClipSplitterService } from './libs/clip-splitter.service.js';
export type { JobDefinitionSize } from './libs/job-definition-selector.js';
export type { QuickClipBatchJobInput } from './libs/batch-job-input.js';

export { JobService } from './libs/job.service.js';
export { HighlightService } from './libs/highlight.service.js';
export { DOMAIN_ERROR_MESSAGES } from './libs/domain-error-messages.js';
export { HighlightAggregationService } from './libs/highlight-aggregation.service.js';
export { FfmpegVideoAnalyzer } from './libs/ffmpeg-video-analyzer.js';
export { MotionHighlightService } from './libs/motion-highlight.service.js';
export { VolumeHighlightService } from './libs/volume-highlight.service.js';
export { FfmpegClipSplitter } from './libs/ffmpeg-clip-splitter.js';
export { selectJobDefinition } from './libs/job-definition-selector.js';
export {
  BATCH_JOB_ENV_NAMES,
  DEFAULT_EMOTION_FILTER,
  EMOTION_FILTERS,
  readBatchJobInput,
  toBatchJobEnvironment,
} from './libs/batch-job-input.js';
export { runQuickClipBatch } from './libs/quick-clip-batch-runner.js';
export { DynamoDBJobRepository } from './repositories/dynamodb-job.repository.js';
export { DynamoDBHighlightRepository } from './repositories/dynamodb-highlight.repository.js';
export { InMemoryJobRepository } from './repositories/in-memory-job.repository.js';
export { InMemoryHighlightRepository } from './repositories/in-memory-highlight.repository.js';
export {
  createJobRepository,
  createHighlightRepository,
  createUsageRepository,
  resetInMemoryRepositories,
} from './repositories/factory.js';
export { UsageService, IP_DAILY_JOB_LIMIT, USAGE_DENY_MESSAGES } from './libs/usage.service.js';
export type {
  ConsumeInput,
  ConsumeResult,
  UsageDenyCode,
  UsageSnapshot,
} from './libs/usage.service.js';
export { USAGE_LIMITS, getUsageLimit, resolveUsageTier } from './libs/usage-plan.js';
export type { UsageLimit, UsageTier } from './libs/usage-plan.js';
export { buildAnonymousSubject, buildUserSubject } from './mappers/usage-keys.js';
export { DynamoDBUsageRepository } from './repositories/dynamodb-usage.repository.js';
export { InMemoryUsageRepository } from './repositories/in-memory-usage.repository.js';
export { createOpenAIClient } from './libs/openai-client.js';
export { TranscriptionService } from './libs/transcription.service.js';
export type { TranscriptSegment } from './libs/transcription.service.js';
export { EmotionHighlightService } from './libs/emotion-highlight.service.js';
