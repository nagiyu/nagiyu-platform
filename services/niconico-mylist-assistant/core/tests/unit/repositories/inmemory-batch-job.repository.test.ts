/**
 * InMemory BatchJob Repository のテスト
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { InMemoryBatchJobRepository } from '../../../src/repositories/inmemory-batch-job.repository.js';
import { InMemorySingleTableStore } from '@nagiyu/aws';
import { EntityAlreadyExistsError, EntityNotFoundError } from '@nagiyu/aws';
import type { CreateBatchJobInput } from '../../../src/entities/batch-job.entity.js';

describe('InMemoryBatchJobRepository', () => {
  let repository: InMemoryBatchJobRepository;
  let store: InMemorySingleTableStore;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    repository = new InMemoryBatchJobRepository(store);
  });

  describe('create', () => {
    it('新しいバッチジョブを作成できる', async () => {
      const input: CreateBatchJobInput = {
        jobId: 'job-123',
        userId: 'user-456',
        status: 'SUBMITTED',
      };

      const result = await repository.create(input);

      expect(result.jobId).toBe(input.jobId);
      expect(result.userId).toBe(input.userId);
      expect(result.status).toBe(input.status);
      expect(result.CreatedAt).toBeGreaterThan(0);
      expect(result.UpdatedAt).toBeGreaterThan(0);
    });

    it('同じジョブIDで重複作成するとエラーになる', async () => {
      const input: CreateBatchJobInput = {
        jobId: 'job-123',
        userId: 'user-456',
        status: 'SUBMITTED',
      };

      await repository.create(input);

      await expect(repository.create(input)).rejects.toThrow(EntityAlreadyExistsError);
    });
  });

  describe('getById', () => {
    it('存在するバッチジョブを取得できる', async () => {
      const input: CreateBatchJobInput = {
        jobId: 'job-123',
        userId: 'user-456',
        status: 'SUBMITTED',
      };

      await repository.create(input);

      const result = await repository.getById('job-123', 'user-456');

      expect(result).not.toBeNull();
      expect(result?.jobId).toBe(input.jobId);
      expect(result?.userId).toBe(input.userId);
    });

    it('存在しないバッチジョブはnullを返す', async () => {
      const result = await repository.getById('non-existent', 'user-456');

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('バッチジョブのステータスを更新できる', async () => {
      const input: CreateBatchJobInput = {
        jobId: 'job-123',
        userId: 'user-456',
        status: 'SUBMITTED',
      };

      const created = await repository.create(input);

      // 少し待って UpdatedAt が確実に異なることを保証
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await repository.update('job-123', 'user-456', {
        status: 'RUNNING',
      });

      expect(result.status).toBe('RUNNING');
      expect(result.UpdatedAt).toBeGreaterThan(created.CreatedAt);
    });

    it('二段階認証コードを設定できる', async () => {
      const input: CreateBatchJobInput = {
        jobId: 'job-123',
        userId: 'user-456',
        status: 'SUBMITTED',
      };

      await repository.create(input);

      const result = await repository.update('job-123', 'user-456', {
        status: 'WAITING_FOR_2FA',
        twoFactorAuthCode: '123456',
      });

      expect(result.status).toBe('WAITING_FOR_2FA');
      expect(result.twoFactorAuthCode).toBe('123456');
    });

    it('二段階認証コードをクリアできる', async () => {
      const input: CreateBatchJobInput = {
        jobId: 'job-123',
        userId: 'user-456',
        status: 'WAITING_FOR_2FA',
      };

      await repository.create(input);

      // コードを設定
      await repository.update('job-123', 'user-456', {
        status: 'WAITING_FOR_2FA',
        twoFactorAuthCode: '123456',
      });

      // コードをクリア
      const result = await repository.update('job-123', 'user-456', {
        status: 'RUNNING',
        twoFactorAuthCode: undefined,
      });

      expect(result.status).toBe('RUNNING');
      expect(result.twoFactorAuthCode).toBeUndefined();
    });

    it('存在しないバッチジョブを更新するとエラーになる', async () => {
      await expect(
        repository.update('non-existent', 'user-456', {
          status: 'RUNNING',
        })
      ).rejects.toThrow(EntityNotFoundError);
    });
  });

  describe('delete', () => {
    it('バッチジョブを削除できる', async () => {
      const input: CreateBatchJobInput = {
        jobId: 'job-123',
        userId: 'user-456',
        status: 'SUBMITTED',
      };

      await repository.create(input);
      await repository.delete('job-123', 'user-456');

      const result = await repository.getById('job-123', 'user-456');
      expect(result).toBeNull();
    });

    it('存在しないバッチジョブを削除してもエラーにならない', async () => {
      await expect(repository.delete('non-existent', 'user-456')).resolves.not.toThrow();
    });
  });
});
