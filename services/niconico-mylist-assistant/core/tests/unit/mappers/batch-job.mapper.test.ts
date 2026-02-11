/**
 * BatchJob Mapper のテスト
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { BatchJobMapper } from '../../../src/mappers/batch-job.mapper.js';
import type { BatchJobEntity } from '../../../src/entities/batch-job.entity.js';

describe('BatchJobMapper', () => {
  let mapper: BatchJobMapper;

  beforeEach(() => {
    mapper = new BatchJobMapper();
  });

  describe('toItem', () => {
    it('必須フィールドのみの Entity を Item に変換できる', () => {
      const entity: BatchJobEntity = {
        jobId: 'job-123',
        userId: 'user-456',
        status: 'SUBMITTED',
        CreatedAt: 1234567890000,
        UpdatedAt: 1234567890000,
      };

      const item = mapper.toItem(entity);

      expect(item.PK).toBe('USER#user-456');
      expect(item.SK).toBe('BATCH_JOB#job-123');
      expect(item.Type).toBe('BATCH_JOB');
      expect(item.jobId).toBe('job-123');
      expect(item.userId).toBe('user-456');
      expect(item.status).toBe('SUBMITTED');
      expect(item.TTL).toBeDefined();
    });

    it('オプショナルフィールド result を含む Entity を変換できる', () => {
      const entity: BatchJobEntity = {
        jobId: 'job-123',
        userId: 'user-456',
        status: 'COMPLETED',
        result: 'SUCCESS',
        CreatedAt: 1234567890000,
        UpdatedAt: 1234567890000,
      };

      const item = mapper.toItem(entity);

      expect(item.result).toBe('SUCCESS');
    });

    it('オプショナルフィールド CompletedAt を含む Entity を変換できる', () => {
      const entity: BatchJobEntity = {
        jobId: 'job-123',
        userId: 'user-456',
        status: 'COMPLETED',
        CompletedAt: 1234567900000,
        CreatedAt: 1234567890000,
        UpdatedAt: 1234567890000,
      };

      const item = mapper.toItem(entity);

      expect(item.CompletedAt).toBe(1234567900000);
    });

    it('オプショナルフィールド twoFactorAuthCode を含む Entity を変換できる', () => {
      const entity: BatchJobEntity = {
        jobId: 'job-123',
        userId: 'user-456',
        status: 'PROCESSING',
        twoFactorAuthCode: '123456',
        CreatedAt: 1234567890000,
        UpdatedAt: 1234567890000,
      };

      const item = mapper.toItem(entity);

      expect(item.twoFactorAuthCode).toBe('123456');
    });
  });

  describe('toEntity', () => {
    it('必須フィールドのみの Item を Entity に変換できる', () => {
      const item = {
        PK: 'BATCH_JOB#job-123#user-456',
        SK: 'BATCH_JOB#job-123#user-456',
        Type: 'BATCH_JOB',
        jobId: 'job-123',
        userId: 'user-456',
        status: 'SUBMITTED',
        CreatedAt: 1234567890000,
        UpdatedAt: 1234567890000,
      };

      const entity = mapper.toEntity(item);

      expect(entity.jobId).toBe('job-123');
      expect(entity.userId).toBe('user-456');
      expect(entity.status).toBe('SUBMITTED');
    });

    it('オプショナルフィールド result を含む Item を変換できる', () => {
      const item = {
        PK: 'BATCH_JOB#job-123#user-456',
        SK: 'BATCH_JOB#job-123#user-456',
        Type: 'BATCH_JOB',
        jobId: 'job-123',
        userId: 'user-456',
        status: 'COMPLETED',
        result: 'FAILURE',
        CreatedAt: 1234567890000,
        UpdatedAt: 1234567890000,
      };

      const entity = mapper.toEntity(item);

      expect(entity.result).toBe('FAILURE');
    });

    it('オプショナルフィールド CompletedAt を含む Item を変換できる', () => {
      const item = {
        PK: 'BATCH_JOB#job-123#user-456',
        SK: 'BATCH_JOB#job-123#user-456',
        Type: 'BATCH_JOB',
        jobId: 'job-123',
        userId: 'user-456',
        status: 'COMPLETED',
        CompletedAt: 1234567900000,
        CreatedAt: 1234567890000,
        UpdatedAt: 1234567890000,
      };

      const entity = mapper.toEntity(item);

      expect(entity.CompletedAt).toBe(1234567900000);
    });

    it('オプショナルフィールド twoFactorAuthCode を含む Item を変換できる', () => {
      const item = {
        PK: 'BATCH_JOB#job-123#user-456',
        SK: 'BATCH_JOB#job-123#user-456',
        Type: 'BATCH_JOB',
        jobId: 'job-123',
        userId: 'user-456',
        status: 'PROCESSING',
        twoFactorAuthCode: '654321',
        CreatedAt: 1234567890000,
        UpdatedAt: 1234567890000,
      };

      const entity = mapper.toEntity(item);

      expect(entity.twoFactorAuthCode).toBe('654321');
    });
  });

  describe('buildUpdateAttributes', () => {
    it('status のみの更新属性を構築できる', () => {
      const updates = {
        status: 'PROCESSING' as const,
      };

      const attributes = mapper.buildUpdateAttributes(updates);

      expect(attributes.status).toBe('PROCESSING');
      expect(attributes.UpdatedAt).toBeDefined();
    });

    it('result を含む更新属性を構築できる', () => {
      const updates = {
        status: 'COMPLETED' as const,
        result: 'SUCCESS' as const,
      };

      const attributes = mapper.buildUpdateAttributes(updates);

      expect(attributes.status).toBe('COMPLETED');
      expect(attributes.result).toBe('SUCCESS');
    });

    it('CompletedAt を含む更新属性を構築できる', () => {
      const completedAt = 1234567900000;
      const updates = {
        status: 'COMPLETED' as const,
        completedAt: completedAt,
      };

      const attributes = mapper.buildUpdateAttributes(updates);

      expect(attributes.CompletedAt).toBe(completedAt);
    });
  });

  describe('buildKeys', () => {
    it('ビジネスキーから PK/SK を構築できる', () => {
      const keys = mapper.buildKeys({
        jobId: 'job-123',
        userId: 'user-456',
      });

      expect(keys.pk).toBe('USER#user-456');
      expect(keys.sk).toBe('BATCH_JOB#job-123');
    });
  });
});
