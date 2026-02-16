/**
 * NiconicoMylistAssistant Core - InMemory BatchJob Repository
 *
 * テスト用のインメモリ実装
 */

import {
  InMemorySingleTableStore,
  EntityAlreadyExistsError,
  EntityNotFoundError,
} from '@nagiyu/aws';
import type { BatchJobRepository } from './batch-job.repository.interface.js';
import type {
  BatchJobEntity,
  CreateBatchJobInput,
  UpdateBatchJobInput,
} from '../entities/batch-job.entity.js';
import { BatchJobMapper } from '../mappers/batch-job.mapper.js';

/**
 * InMemory BatchJob Repository
 *
 * テスト用のインメモリバッチジョブリポジトリの実装
 */
export class InMemoryBatchJobRepository implements BatchJobRepository {
  private readonly mapper: BatchJobMapper;
  private readonly store: InMemorySingleTableStore;

  constructor(store: InMemorySingleTableStore) {
    this.store = store;
    this.mapper = new BatchJobMapper();
  }

  /**
   * ジョブIDとユーザーIDで単一のバッチジョブを取得
   */
  public async getById(jobId: string, userId: string): Promise<BatchJobEntity | null> {
    const { pk, sk } = this.mapper.buildKeys({ jobId, userId });
    const item = this.store.get(pk, sk);

    if (!item) {
      return null;
    }

    return this.mapper.toEntity(item);
  }

  /**
   * 新しいバッチジョブを作成
   */
  public async create(input: CreateBatchJobInput): Promise<BatchJobEntity> {
    const now = Date.now();
    const entity: BatchJobEntity = {
      ...input,
      CreatedAt: now,
      UpdatedAt: now,
    };

    const item = this.mapper.toItem(entity);
    const { pk, sk } = this.mapper.buildKeys({ jobId: input.jobId, userId: input.userId });

    // 既存チェック
    const existingItem = this.store.get(pk, sk);
    if (existingItem) {
      throw new EntityAlreadyExistsError('BatchJob', `${input.jobId}#${input.userId}`);
    }

    this.store.put(item);
    return entity;
  }

  /**
   * バッチジョブのステータスを更新
   */
  public async update(
    jobId: string,
    userId: string,
    input: UpdateBatchJobInput
  ): Promise<BatchJobEntity> {
    const { pk, sk } = this.mapper.buildKeys({ jobId, userId });
    const existingItem = this.store.get(pk, sk);

    if (!existingItem) {
      throw new EntityNotFoundError('BatchJob', `${jobId}#${userId}`);
    }

    const existingEntity = this.mapper.toEntity(existingItem);
    const attributes = this.mapper.buildUpdateAttributes(input);

    // 更新されたエンティティを構築
    const updatedEntity: BatchJobEntity = {
      ...existingEntity,
      status: attributes.status as BatchJobEntity['status'],
      UpdatedAt: attributes.UpdatedAt as number,
    };

    if (attributes.result !== undefined) {
      updatedEntity.result = attributes.result as BatchJobEntity['result'];
    }

    if (attributes.CompletedAt !== undefined) {
      updatedEntity.CompletedAt = attributes.CompletedAt as number;
    }

    if (attributes.twoFactorAuthCode !== undefined) {
      updatedEntity.twoFactorAuthCode = attributes.twoFactorAuthCode as string;
    } else if (input.twoFactorAuthCode === undefined && existingEntity.twoFactorAuthCode) {
      // twoFactorAuthCode が明示的に undefined で渡された場合、削除する
      delete updatedEntity.twoFactorAuthCode;
    }

    const updatedItem = this.mapper.toItem(updatedEntity);
    this.store.put(updatedItem);

    return updatedEntity;
  }

  /**
   * バッチジョブを削除
   */
  public async delete(jobId: string, userId: string): Promise<void> {
    const { pk, sk } = this.mapper.buildKeys({ jobId, userId });
    this.store.delete(pk, sk);
  }
}
