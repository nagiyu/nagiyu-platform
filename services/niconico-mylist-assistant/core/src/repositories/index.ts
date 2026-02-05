/**
 * Repositories エクスポート
 */

// Interfaces
export type { VideoRepository } from './video.repository.interface';
export type { UserSettingRepository } from './user-setting.repository.interface';
export type { BatchJobRepository } from './batch-job.repository.interface';

// DynamoDB Implementations
export { DynamoDBVideoRepository } from './dynamodb-video.repository';
export { DynamoDBUserSettingRepository } from './dynamodb-user-setting.repository';
export { DynamoDBBatchJobRepository } from './dynamodb-batch-job.repository';

// InMemory Implementations
export { InMemoryVideoRepository } from './inmemory-video.repository';
export { InMemoryUserSettingRepository } from './inmemory-user-setting.repository';
export { InMemoryBatchJobRepository } from './inmemory-batch-job.repository';

// Factory
export {
  createVideoRepository,
  createUserSettingRepository,
  createBatchJobRepository,
} from './factory';

// Store
export { getInMemoryStore, clearInMemoryStore } from './store';
