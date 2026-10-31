/**
 * NiconicoMylistAssistant Core - InMemory BatchJob Repository
 *
 * テスト用のインメモリ実装
 */

import { InMemoryEntityStore, type EntityStore, type InMemorySingleTableStore } from '@nagiyu/aws';
import type { BatchJobRepository } from './batch-job.repository.interface.js';
import type {
  BatchJobEntity,
  BatchJobKey,
  CreateBatchJobInput,
  UpdateBatchJobInput,
} from '../entities/batch-job.entity.js';
import { BatchJobMapper } from '../mappers/batch-job.mapper.js';

/**
 * InMemory BatchJob Repository
 *
 * 単一アイテムの CRUD をすべて EntityStore に任せる。
 * テスト環境で使用
 */
export class InMemoryBatchJobRepository implements BatchJobRepository {
  private readonly entityStore: EntityStore<BatchJobEntity, BatchJobKey>;

  constructor(store: InMemorySingleTableStore) {
    this.entityStore = new InMemoryEntityStore(store, new BatchJobMapper());
  }

  /**
   * ジョブIDとユーザーIDで単一のバッチジョブを取得
   */
  public async getById(jobId: string, userId: string): Promise<BatchJobEntity | null> {
    return this.entityStore.get({ jobId, userId });
  }

  /**
   * 新しいバッチジョブを作成
   */
  public async create(input: CreateBatchJobInput): Promise<BatchJobEntity> {
    return this.entityStore.create(input);
  }

  /**
   * バッチジョブを更新
   */
  public async update(
    jobId: string,
    userId: string,
    input: UpdateBatchJobInput
  ): Promise<BatchJobEntity> {
    return this.entityStore.update({ jobId, userId }, input);
  }

  /**
   * バッチジョブを削除
   */
  public async delete(jobId: string, userId: string): Promise<void> {
    await this.entityStore.delete({ jobId, userId });
  }

  /**
   * バッチジョブを削除する。対象がなくても成功する
   */
  public async deleteIfExists(jobId: string, userId: string): Promise<void> {
    await this.entityStore.deleteIfExists({ jobId, userId });
  }
}
