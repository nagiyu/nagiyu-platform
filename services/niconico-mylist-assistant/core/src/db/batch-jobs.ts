import { docClient, TABLE_NAME } from './client.js';
import { createBatchJobRepository } from '../repositories/factory.js';
import type { BatchJobRepository } from '../repositories/batch-job.repository.interface.js';
import type {
  BatchJobEntity,
  CreateBatchJobInput,
  UpdateBatchJobInput,
} from '../entities/batch-job.entity.js';

// Repository インスタンスの遅延作成
// 環境変数 USE_IN_MEMORY_DB により、DynamoDB または InMemory 実装を切り替える
let batchJobRepositoryInstance: BatchJobRepository | null = null;

function getBatchJobRepository(): BatchJobRepository {
  if (!batchJobRepositoryInstance) {
    batchJobRepositoryInstance = createBatchJobRepository(docClient, TABLE_NAME);
  }
  return batchJobRepositoryInstance;
}

/**
 * バッチジョブ（BATCH_JOB エンティティ）の操作
 */

/**
 * バッチジョブを作成
 * @throws EntityAlreadyExistsError - 既に同じ jobId のジョブが存在する場合
 */
export async function createBatchJob(input: CreateBatchJobInput): Promise<BatchJobEntity> {
  return await getBatchJobRepository().create(input);
}

/**
 * バッチジョブを取得
 * @returns バッチジョブ、存在しない場合は null
 */
export async function getBatchJob(jobId: string, userId: string): Promise<BatchJobEntity | null> {
  return await getBatchJobRepository().getById(jobId, userId);
}

/**
 * バッチジョブを更新
 * @throws EntityNotFoundError - ジョブが存在しない場合
 */
export async function updateBatchJob(
  jobId: string,
  userId: string,
  input: UpdateBatchJobInput
): Promise<BatchJobEntity> {
  return await getBatchJobRepository().update(jobId, userId, input);
}

/**
 * バッチジョブを削除
 */
export async function deleteBatchJob(jobId: string, userId: string): Promise<void> {
  return await getBatchJobRepository().delete(jobId, userId);
}
