/**
 * AbstractDynamoDBRepository Unit Tests
 *
 * Lambda モジュールインスタンス不一致時の getById エラーハンドリングを検証
 */

import { AbstractDynamoDBRepository } from '../../../src/dynamodb/abstract-repository.js';
import {
  InvalidEntityDataError,
  DatabaseError,
  EntityAlreadyExistsError,
  EntityNotFoundError,
} from '../../../src/dynamodb/errors.js';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
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
    const validItem = {
      PK: 'TEST#1',
      SK: 'METADATA',
      id: '1',
      name: 'Item',
      CreatedAt: 1000,
      UpdatedAt: 1000,
    };

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
      jest
        .spyOn(repository as unknown as { mapToEntity: () => void }, 'mapToEntity')
        .mockImplementation(() => {
          throw new InvalidEntityDataError('フィールド "name" が不正');
        });

      await expect(repository.getById({ id: '1' })).rejects.toBeInstanceOf(InvalidEntityDataError);
    });

    it('Lambda モジュール不一致: name が InvalidEntityDataError のエラーを re-throw する', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: validItem });
      jest
        .spyOn(repository as unknown as { mapToEntity: () => void }, 'mapToEntity')
        .mockImplementation(() => {
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
      jest
        .spyOn(repository as unknown as { mapToEntity: () => void }, 'mapToEntity')
        .mockImplementation(() => {
          throw new Error(
            'エンティティデータが無効です: フィールド "CreatedAt" がタイムスタンプではありません'
          );
        });

      const rejected = repository.getById({ id: '1' });
      await expect(rejected).rejects.toMatchObject({
        message: expect.stringContaining('エンティティデータが無効です'),
      });
      await expect(rejected).rejects.not.toBeInstanceOf(DatabaseError);
    });

    it('無関係なエラーは DatabaseError にラップする', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: validItem });
      jest
        .spyOn(repository as unknown as { mapToEntity: () => void }, 'mapToEntity')
        .mockImplementation(() => {
          throw new Error('Network connection failed');
        });

      await expect(repository.getById({ id: '1' })).rejects.toBeInstanceOf(DatabaseError);
    });

    it('DynamoDB 送信エラーは DatabaseError にラップする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('DynamoDB unavailable'));
      await expect(repository.getById({ id: '1' })).rejects.toBeInstanceOf(DatabaseError);
    });
  });

  describe('create', () => {
    const newEntity = { id: '1', name: 'New Item' };

    it('エンティティを作成して返す', async () => {
      mockDocClient.send.mockResolvedValueOnce({});
      const result = await repository.create(newEntity);
      expect(result.id).toBe('1');
      expect(result.name).toBe('New Item');
      expect(typeof result.CreatedAt).toBe('number');
      expect(typeof result.UpdatedAt).toBe('number');
    });

    it('ConditionalCheckFailedException (instanceof) で EntityAlreadyExistsError を throw する', async () => {
      mockDocClient.send.mockRejectedValueOnce(
        new ConditionalCheckFailedException({ message: 'Condition failed', $metadata: {} })
      );
      await expect(repository.create(newEntity)).rejects.toBeInstanceOf(EntityAlreadyExistsError);
    });

    it('ConditionalCheckFailedException (name) で EntityAlreadyExistsError を throw する（Lambda モジュール不一致ケース）', async () => {
      const err = new Error('条件チェック失敗');
      err.name = 'ConditionalCheckFailedException';
      mockDocClient.send.mockRejectedValueOnce(err);
      await expect(repository.create(newEntity)).rejects.toBeInstanceOf(EntityAlreadyExistsError);
    });

    it('無関係なエラーは DatabaseError にラップする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('Network error'));
      await expect(repository.create(newEntity)).rejects.toBeInstanceOf(DatabaseError);
    });
  });

  describe('update', () => {
    const validItem = {
      PK: 'TEST#1',
      SK: 'METADATA',
      id: '1',
      name: 'Updated Item',
      CreatedAt: 1000,
      UpdatedAt: 2000,
    };

    it('フィールドを更新して最新エンティティを返す', async () => {
      mockDocClient.send
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ Item: validItem });
      const result = await repository.update({ id: '1' }, { name: 'Updated Item' });
      expect(result.name).toBe('Updated Item');
    });

    it('空オブジェクトを渡すと InvalidEntityDataError を throw する', async () => {
      await expect(repository.update({ id: '1' }, {})).rejects.toBeInstanceOf(
        InvalidEntityDataError
      );
    });

    it('CreatedAt / UpdatedAt のみ指定すると InvalidEntityDataError を throw する', async () => {
      await expect(
        repository.update({ id: '1' }, { CreatedAt: 9999, UpdatedAt: 9999 })
      ).rejects.toBeInstanceOf(InvalidEntityDataError);
    });

    it('ConditionalCheckFailedException (instanceof) で EntityNotFoundError を throw する', async () => {
      mockDocClient.send.mockRejectedValueOnce(
        new ConditionalCheckFailedException({ message: 'Condition failed', $metadata: {} })
      );
      await expect(repository.update({ id: '1' }, { name: 'x' })).rejects.toBeInstanceOf(
        EntityNotFoundError
      );
    });

    it('ConditionalCheckFailedException (name) で EntityNotFoundError を throw する（Lambda モジュール不一致ケース）', async () => {
      const err = new Error('条件チェック失敗');
      err.name = 'ConditionalCheckFailedException';
      mockDocClient.send.mockRejectedValueOnce(err);
      await expect(repository.update({ id: '1' }, { name: 'x' })).rejects.toBeInstanceOf(
        EntityNotFoundError
      );
    });

    it('更新後に getById が null を返すと EntityNotFoundError を throw する', async () => {
      mockDocClient.send
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ Item: undefined });
      await expect(repository.update({ id: '1' }, { name: 'x' })).rejects.toBeInstanceOf(
        EntityNotFoundError
      );
    });

    it('無関係なエラーは DatabaseError にラップする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('Network error'));
      await expect(repository.update({ id: '1' }, { name: 'x' })).rejects.toBeInstanceOf(
        DatabaseError
      );
    });
  });

  describe('delete', () => {
    it('正常に削除が完了する', async () => {
      mockDocClient.send.mockResolvedValueOnce({});
      await expect(repository.delete({ id: '1' })).resolves.toBeUndefined();
    });

    it('ConditionalCheckFailedException (instanceof) で EntityNotFoundError を throw する', async () => {
      mockDocClient.send.mockRejectedValueOnce(
        new ConditionalCheckFailedException({ message: 'Condition failed', $metadata: {} })
      );
      await expect(repository.delete({ id: '1' })).rejects.toBeInstanceOf(EntityNotFoundError);
    });

    it('ConditionalCheckFailedException (name) で EntityNotFoundError を throw する（Lambda モジュール不一致ケース）', async () => {
      const err = new Error('条件チェック失敗');
      err.name = 'ConditionalCheckFailedException';
      mockDocClient.send.mockRejectedValueOnce(err);
      await expect(repository.delete({ id: '1' })).rejects.toBeInstanceOf(EntityNotFoundError);
    });

    it('無関係なエラーは DatabaseError にラップする', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('Network error'));
      await expect(repository.delete({ id: '1' })).rejects.toBeInstanceOf(DatabaseError);
    });
  });
});
