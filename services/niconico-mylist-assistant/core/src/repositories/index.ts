/**
 * Repositories エクスポート
 */

// Interfaces
export type { VideoRepository } from './video.repository.interface.js';
export type { UserSettingRepository } from './user-setting.repository.interface.js';
export type { BatchJobRepository } from './batch-job.repository.interface.js';
export type { NiconicoCredentialRepository } from './niconico-credential.repository.interface.js';

// DynamoDB Implementations
export { DynamoDBVideoRepository } from './dynamodb-video.repository.js';
export { DynamoDBUserSettingRepository } from './dynamodb-user-setting.repository.js';
export { DynamoDBBatchJobRepository } from './dynamodb-batch-job.repository.js';
export { DynamoDBNiconicoCredentialRepository } from './dynamodb-niconico-credential.repository.js';

// InMemory Implementations
export { InMemoryVideoRepository } from './inmemory-video.repository.js';
export { InMemoryUserSettingRepository } from './inmemory-user-setting.repository.js';
export { InMemoryBatchJobRepository } from './inmemory-batch-job.repository.js';
export { InMemoryNiconicoCredentialRepository } from './inmemory-niconico-credential.repository.js';

// Factory
export {
  createVideoRepository,
  createUserSettingRepository,
  createBatchJobRepository,
  createNiconicoCredentialRepository,
  resetRepositoryFactories,
} from './factory.js';
