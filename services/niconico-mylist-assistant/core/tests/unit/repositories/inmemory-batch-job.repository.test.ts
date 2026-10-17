/**
 * InMemoryBatchJobRepository のユニットテスト
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  InMemorySingleTableStore,
  EntityAlreadyExistsError,
  EntityNotFoundError,
  InvalidEntityDataError,
} from '@nagiyu/aws';
import { InMemoryBatchJobRepository } from '../../../src/repositories/inmemory-batch-job.repository.js';
import type { CreateBatchJobInput } from '../../../src/entities/batch-job.entity.js';

const CREATED_AT = 1704067200000;
const PK = 'USER#user-1';
const SK = 'BATCH_JOB#job-1';

const input: CreateBatchJobInput = {
  jobId: 'job-1',
  userId: 'user-1',
  status: 'SUBMITTED',
};

describe('InMemoryBatchJobRepository', () => {
  let store: InMemorySingleTableStore;
  let repository: InMemoryBatchJobRepository;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    repository = new InMemoryBatchJobRepository(store);
  });

  describe('create', () => {
    it('バッチジョブを作成できる', async () => {
      const result = await repository.create({
        ...input,
        pushSubscription: {
          endpoint: 'https://push.example.com/abc',
          keys: { p256dh: 'p', auth: 'a' },
        },
      });

      expect(result).toMatchObject({ jobId: 'job-1', userId: 'user-1', status: 'SUBMITTED' });
      expect(result.pushSubscription?.endpoint).toBe('https://push.example.com/abc');
      expect(result.createdAt).toBeGreaterThan(0);
      expect(result.updatedAt).toBeGreaterThan(0);
    });

    it('同じキーで 2 回作成すると EntityAlreadyExistsError を投げる', async () => {
      await repository.create(input);

      await expect(repository.create(input)).rejects.toThrow(EntityAlreadyExistsError);
    });
  });

  describe('getById', () => {
    it('作成したバッチジョブを取得できる', async () => {
      await repository.create(input);

      expect(await repository.getById('job-1', 'user-1')).toMatchObject(input);
    });

    it('存在しないバッチジョブは null を返す', async () => {
      expect(await repository.getById('job-x', 'user-1')).toBeNull();
    });

    it('別ユーザーのジョブは取得できない', async () => {
      await repository.create(input);

      expect(await repository.getById('job-1', 'user-2')).toBeNull();
    });
  });

  describe('update', () => {
    it('ステータス・結果・完了日時を更新できる', async () => {
      const created = await repository.create(input);

      const result = await repository.update('job-1', 'user-1', {
        status: 'SUCCEEDED',
        result: { registeredCount: 2, failedCount: 1, totalCount: 3 },
        completedAt: CREATED_AT + 1000,
      });

      expect(result).toMatchObject({
        status: 'SUCCEEDED',
        result: { registeredCount: 2, failedCount: 1, totalCount: 3 },
        completedAt: CREATED_AT + 1000,
        createdAt: created.createdAt,
      });
      expect(result.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
      expect(await repository.getById('job-1', 'user-1')).toEqual(result);
    });

    it('指定しなかった項目は変えない', async () => {
      await repository.create({ ...input, twoFactorAuthCode: '123456' });

      const result = await repository.update('job-1', 'user-1', { status: 'RUNNING' });

      expect(result.status).toBe('RUNNING');
      expect(result.twoFactorAuthCode).toBe('123456');
    });

    it('twoFactorAuthCode を null にすると削除する', async () => {
      await repository.create({ ...input, twoFactorAuthCode: '123456' });

      const result = await repository.update('job-1', 'user-1', { twoFactorAuthCode: null });

      expect(result.twoFactorAuthCode).toBeUndefined();
      expect(store.get(PK, SK)).not.toHaveProperty('TwoFactorAuthCode');
    });

    it('status に null を渡すと InvalidEntityDataError を投げる', async () => {
      await repository.create(input);

      await expect(repository.update('job-1', 'user-1', { status: null })).rejects.toThrow(
        InvalidEntityDataError
      );
    });

    it('存在しないバッチジョブを更新すると EntityNotFoundError を投げる', async () => {
      await expect(repository.update('job-x', 'user-1', { status: 'RUNNING' })).rejects.toThrow(
        EntityNotFoundError
      );
    });

    it('更新しても TTL は作成時のまま変わらない', async () => {
      const created = await repository.create(input);
      const ttl = store.get(PK, SK)?.TTL;

      await repository.update('job-1', 'user-1', { status: 'FAILED' });

      expect(ttl).toBe(Math.floor(created.createdAt / 1000) + 7 * 24 * 60 * 60);
      expect(store.get(PK, SK)?.TTL).toBe(ttl);
    });
  });

  describe('delete', () => {
    it('バッチジョブを削除できる', async () => {
      await repository.create(input);

      await repository.delete('job-1', 'user-1');

      expect(await repository.getById('job-1', 'user-1')).toBeNull();
    });

    it('存在しないバッチジョブを削除すると EntityNotFoundError を投げる', async () => {
      await expect(repository.delete('job-x', 'user-1')).rejects.toThrow(EntityNotFoundError);
    });
  });

  describe('deleteIfExists', () => {
    it('存在するバッチジョブを削除できる', async () => {
      await repository.create(input);

      await repository.deleteIfExists('job-1', 'user-1');

      expect(await repository.getById('job-1', 'user-1')).toBeNull();
    });

    it('存在しなくても成功する', async () => {
      await expect(repository.deleteIfExists('job-x', 'user-1')).resolves.toBeUndefined();
    });
  });

  describe('保存形式', () => {
    const legacyItem = {
      PK,
      SK,
      Type: 'BATCH_JOB',
      jobId: 'job-1',
      userId: 'user-1',
      status: 'WAITING_FOR_2FA',
      twoFactorAuthCode: '123456',
      CreatedAt: CREATED_AT,
      UpdatedAt: CREATED_AT,
      TTL: 1,
    };

    it('PascalCase の属性名と TTL で保存する', async () => {
      const created = await repository.create({ ...input, twoFactorAuthCode: '123456' });

      const item = store.get(PK, SK);

      expect(item).toMatchObject({
        Type: 'BATCH_JOB',
        JobID: 'job-1',
        UserID: 'user-1',
        Status: 'SUBMITTED',
        TwoFactorAuthCode: '123456',
        TTL: Math.floor(created.createdAt / 1000) + 7 * 24 * 60 * 60,
      });
      for (const legacyName of ['jobId', 'userId', 'status', 'twoFactorAuthCode']) {
        expect(item).not.toHaveProperty(legacyName);
      }
    });

    it('旧属性名 (camelCase) で保存されたアイテムを読める', async () => {
      store.put(legacyItem);

      expect(await repository.getById('job-1', 'user-1')).toEqual({
        jobId: 'job-1',
        userId: 'user-1',
        status: 'WAITING_FOR_2FA',
        twoFactorAuthCode: '123456',
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      });
    });

    it('旧属性名のアイテムを更新すると、更新した項目の旧名が消えて新名だけが残る', async () => {
      store.put(legacyItem);

      const result = await repository.update('job-1', 'user-1', {
        status: 'RUNNING',
        twoFactorAuthCode: null,
      });

      expect(result.status).toBe('RUNNING');
      expect(result.twoFactorAuthCode).toBeUndefined();
      const item = store.get(PK, SK);
      expect(item).toMatchObject({ Status: 'RUNNING', TTL: 1 });
      for (const name of ['status', 'twoFactorAuthCode', 'TwoFactorAuthCode']) {
        expect(item).not.toHaveProperty(name);
      }
      // 更新していない項目は旧名のまま残り、読み取りは引き続き成功する
      expect(item).toMatchObject({ jobId: 'job-1', userId: 'user-1' });
    });
  });
});
