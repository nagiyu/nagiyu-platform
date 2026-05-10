/**
 * Factory Pattern のテスト
 */

import {
  createVideoRepository,
  createUserSettingRepository,
  createBatchJobRepository,
  resetRepositoryFactories,
} from '../../../src/repositories/factory';
import { InMemoryVideoRepository } from '../../../src/repositories/inmemory-video.repository';
import { InMemoryUserSettingRepository } from '../../../src/repositories/inmemory-user-setting.repository';
import { InMemoryBatchJobRepository } from '../../../src/repositories/inmemory-batch-job.repository';
import { DynamoDBVideoRepository } from '../../../src/repositories/dynamodb-video.repository';
import { DynamoDBUserSettingRepository } from '../../../src/repositories/dynamodb-user-setting.repository';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('Repository Factory', () => {
  beforeEach(() => {
    delete process.env.USE_IN_MEMORY_DB;
    delete process.env.DYNAMODB_TABLE_NAME;
    resetRepositoryFactories();
    ddbMock.reset();
  });

  describe('createVideoRepository', () => {
    it('USE_IN_MEMORY_DB=true の場合、InMemoryVideoRepository を返す', () => {
      process.env.USE_IN_MEMORY_DB = 'true';

      const repository = createVideoRepository();

      expect(repository).toBeInstanceOf(InMemoryVideoRepository);
    });

    it('引数明示時は DynamoDBVideoRepository を返す', () => {
      const docClient = ddbMock as unknown as DynamoDBDocumentClient;
      const tableName = 'test-table';

      const repository = createVideoRepository(docClient, tableName);

      expect(repository).toBeInstanceOf(DynamoDBVideoRepository);
    });

    it('tableName が引数・env のいずれでも未指定なら例外を投げる', () => {
      expect(() => {
        createVideoRepository();
      }).toThrow('環境変数 DYNAMODB_TABLE_NAME が設定されていません');
    });
  });

  describe('createUserSettingRepository', () => {
    it('USE_IN_MEMORY_DB=true の場合、InMemoryUserSettingRepository を返す', () => {
      process.env.USE_IN_MEMORY_DB = 'true';

      const repository = createUserSettingRepository();

      expect(repository).toBeInstanceOf(InMemoryUserSettingRepository);
    });

    it('引数明示時は DynamoDBUserSettingRepository を返す', () => {
      const docClient = ddbMock as unknown as DynamoDBDocumentClient;
      const tableName = 'test-table';

      const repository = createUserSettingRepository(docClient, tableName);

      expect(repository).toBeInstanceOf(DynamoDBUserSettingRepository);
    });

    it('tableName が引数・env のいずれでも未指定なら例外を投げる', () => {
      expect(() => {
        createUserSettingRepository();
      }).toThrow('環境変数 DYNAMODB_TABLE_NAME が設定されていません');
    });
  });

  describe('createBatchJobRepository', () => {
    it('USE_IN_MEMORY_DB=true の場合、InMemoryBatchJobRepository を返す', () => {
      process.env.USE_IN_MEMORY_DB = 'true';

      const repository = createBatchJobRepository();

      expect(repository).toBeInstanceOf(InMemoryBatchJobRepository);
    });
  });

  describe('シングルトンと resetRepositoryFactories', () => {
    it('同一 factory は singleton として同じインスタンスを返す', () => {
      process.env.USE_IN_MEMORY_DB = 'true';

      const repo1 = createVideoRepository();
      const repo2 = createVideoRepository();

      expect(repo1).toBe(repo2);
    });

    it('resetRepositoryFactories 後は全 factory が新規インスタンスを返す', () => {
      process.env.USE_IN_MEMORY_DB = 'true';

      const videoBefore = createVideoRepository();
      const userSettingBefore = createUserSettingRepository();
      const batchJobBefore = createBatchJobRepository();

      resetRepositoryFactories();

      expect(createVideoRepository()).not.toBe(videoBefore);
      expect(createUserSettingRepository()).not.toBe(userSettingBefore);
      expect(createBatchJobRepository()).not.toBe(batchJobBefore);
    });
  });
});
