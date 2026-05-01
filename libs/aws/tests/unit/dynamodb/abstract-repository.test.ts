/**
 * AbstractDynamoDBRepository Unit Tests
 *
 * Lambda モジュールインスタンス不一致時の getById エラーハンドリングを検証
 */

import { AbstractDynamoDBRepository } from '../../../src/dynamodb/abstract-repository.js';
import {
  InvalidEntityDataError,
  DatabaseError,
} from '../../../src/dynamodb/errors.js';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { DynamoDBItem } from '../../../src/dynamodb/types.js';

type TestKey = { id: string };
type TestEntity = { id: string; name: string; CreatedAt: number; UpdatedAt: number };

class TestRepository extends AbstractDynamoDBRepository<TestEntity, TestKey> {
  protected buildKeys(key: TestKey): { PK: string; SK: string } {
    return { PK: `TEST#${key.id}`, SK: 'METADATA' };
  }

  protected mapToEntity(item: Record<string, unknown>): TestEntity {
    return {
      id: item.id as string,
      name: item.name as string,
      CreatedAt: item.CreatedAt as number,
      UpdatedAt: item.UpdatedAt as number,
    };
  }

  protected mapToItem(
    entity: Omit<TestEntity, 'CreatedAt' | 'UpdatedAt'>
  ): Omit<DynamoDBItem, 'CreatedAt' | 'UpdatedAt'> {
    const { PK, SK } = this.buildKeys({ id: entity.id });
    return { PK, SK, Type: 'Test', id: entity.id, name: entity.name };
  }
}

describe('AbstractDynamoDBRepository', () => {
  let repository: TestRepository;
  let mockDocClient: jest.Mocked<DynamoDBDocumentClient>;

  beforeEach(() => {
    mockDocClient = { send: jest.fn() } as unknown as jest.Mocked<DynamoDBDocumentClient>;
    repository = new TestRepository(mockDocClient, { tableName: 'test-table', entityType: 'Test' });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getById', () => {
    const validItem = { PK: 'TEST#1', SK: 'METADATA', id: '1', name: 'Item', CreatedAt: 1000, UpdatedAt: 1000 };

    it('存在しないアイテムの場合 null を返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: undefined });
      const result = await repository.getById({ id: '1' });
      expect(result).toBeNull();
    });

    it('正常なアイテムをエンティティとして返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: validItem });
      const result = await repository.getById({ id: '1' });
      expect(result).toEqual({ id: '1', name: 'Item', CreatedAt: 1000, UpdatedAt: 1000 });
    });

    it('InvalidEntityDataError をそのまま re-throw する（instanceof 成功ケース）', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: validItem });
      jest.spyOn(repository as unknown as { mapToEntity: () => void }, 'mapToEntity').mockImplementation(() => {
        throw new InvalidEntityDataError('フィールド "name" が不正');
      });

      await expect(repository.getById({ id: '1' })).rejects.toBeInstanceOf(InvalidEntityDataError);
    });

    it('Lambda モジュール不一致: name が InvalidEntityDataError のエラーを re-throw する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: validItem });
      jest.spyOn(repository as unknown as { mapToEntity: () => void }, 'mapToEntity').mockImplementation(() => {
        // Lambda バンドル環境で instanceof が失敗する場合のシミュレーション
        const err = new Error('エンティティデータが無効です: フィールド "name" が不正');
        err.name = 'InvalidEntityDataError';
        throw err;
      });

      const rejected = repository.getById({ id: '1' });
      await expect(rejected).rejects.toMatchObject({ name: 'InvalidEntityDataError' });
      await expect(rejected).rejects.not.toBeInstanceOf(DatabaseError);
    });

    it('Lambda モジュール不一致: メッセージプレフィックスが一致するエラーを re-throw する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: validItem });
      jest.spyOn(repository as unknown as { mapToEntity: () => void }, 'mapToEntity').mockImplementation(() => {
        throw new Error('エンティティデータが無効です: フィールド "CreatedAt" がタイムスタンプではありません');
      });

      const rejected = repository.getById({ id: '1' });
      await expect(rejected).rejects.toMatchObject({
        message: expect.stringContaining('エンティティデータが無効です'),
      });
      await expect(rejected).rejects.not.toBeInstanceOf(DatabaseError);
    });

    it('無関係なエラーは DatabaseError にラップする', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: validItem });
      jest.spyOn(repository as unknown as { mapToEntity: () => void }, 'mapToEntity').mockImplementation(() => {
        throw new Error('Network connection failed');
      });

      await expect(repository.getById({ id: '1' })).rejects.toBeInstanceOf(DatabaseError);
    });

    it('DynamoDB 送信エラーは DatabaseError にラップする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('DynamoDB unavailable'));
      await expect(repository.getById({ id: '1' })).rejects.toBeInstanceOf(DatabaseError);
    });
  });
});
