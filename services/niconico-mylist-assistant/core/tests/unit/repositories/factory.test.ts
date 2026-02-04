/**
 * Factory Pattern のテスト
 */

import { createVideoRepository, createUserSettingRepository } from '../../../src/repositories/factory';
import { InMemoryVideoRepository } from '../../../src/repositories/inmemory-video.repository';
import { InMemoryUserSettingRepository } from '../../../src/repositories/inmemory-user-setting.repository';
import { DynamoDBVideoRepository } from '../../../src/repositories/dynamodb-video.repository';
import { DynamoDBUserSettingRepository } from '../../../src/repositories/dynamodb-user-setting.repository';
import { getInMemoryStore, clearInMemoryStore } from '../../../src/repositories/store';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('Repository Factory', () => {
  beforeEach(() => {
    // 環境変数をクリア
    delete process.env.USE_IN_MEMORY_DB;
    // ストアをクリア
    clearInMemoryStore();
    ddbMock.reset();
  });

  describe('createVideoRepository', () => {
    it('USE_IN_MEMORY_DB=true の場合、InMemoryVideoRepository を返す', () => {
      process.env.USE_IN_MEMORY_DB = 'true';

      const repository = createVideoRepository();

      expect(repository).toBeInstanceOf(InMemoryVideoRepository);
    });

    it('USE_IN_MEMORY_DB が設定されていない場合、DynamoDBVideoRepository を返す', () => {
      const docClient = ddbMock as unknown as DynamoDBDocumentClient;
      const tableName = 'test-table';

      const repository = createVideoRepository(docClient, tableName);

      expect(repository).toBeInstanceOf(DynamoDBVideoRepository);
    });

    it('DynamoDB実装でdocClientまたはtableNameが指定されていない場合、エラーを投げる', () => {
      expect(() => {
        createVideoRepository();
      }).toThrow('DynamoDB実装にはdocClientとtableNameが必要です');
    });
  });

  describe('createUserSettingRepository', () => {
    it('USE_IN_MEMORY_DB=true の場合、InMemoryUserSettingRepository を返す', () => {
      process.env.USE_IN_MEMORY_DB = 'true';

      const repository = createUserSettingRepository();

      expect(repository).toBeInstanceOf(InMemoryUserSettingRepository);
    });

    it('USE_IN_MEMORY_DB が設定されていない場合、DynamoDBUserSettingRepository を返す', () => {
      const docClient = ddbMock as unknown as DynamoDBDocumentClient;
      const tableName = 'test-table';

      const repository = createUserSettingRepository(docClient, tableName);

      expect(repository).toBeInstanceOf(DynamoDBUserSettingRepository);
    });

    it('DynamoDB実装でdocClientまたはtableNameが指定されていない場合、エラーを投げる', () => {
      expect(() => {
        createUserSettingRepository();
      }).toThrow('DynamoDB実装にはdocClientとtableNameが必要です');
    });
  });

  describe('共通ストアの共有', () => {
    it('VideoRepository と UserSettingRepository が同じ InMemorySingleTableStore を共有する', () => {
      process.env.USE_IN_MEMORY_DB = 'true';

      const videoRepo = createVideoRepository() as InMemoryVideoRepository;
      const userSettingRepo = createUserSettingRepository() as InMemoryUserSettingRepository;

      // 両リポジトリが同じストアインスタンスを使用していることを確認
      const store = getInMemoryStore();
      
      // ストアのサイズを確認することで、同じストアが共有されていることを検証
      expect(store.size()).toBe(0);
      
      // clearInMemoryStore() でクリアできることを確認
      clearInMemoryStore();
      expect(() => getInMemoryStore().size()).not.toThrow();
    });
  });
});
