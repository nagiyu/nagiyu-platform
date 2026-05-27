import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { DatabaseError, EntityNotFoundError } from '@nagiyu/aws';
import { DynamoDBMemoryRepository } from '../../../src/repositories/dynamodb-memory.repository.js';
import { MEMORY_TIER_C_TTL_SECONDS, MEMORY_TIER_D_TTL_SECONDS } from '../../../src/constants.js';
import type { CreateMemoryInput, MemoryEntity } from '../../../src/entities/memory.entity.js';

type SendHandler = (command: unknown) => Promise<unknown>;
const makeClient = (handler: SendHandler) => ({ send: handler });

const baseInput: CreateMemoryInput = {
  UserID: 'u1',
  CharacterID: 'hiyori',
  Tier: 'B',
  Category: 'food',
  Content: 'コーヒーが好き',
  Confidence: 0.8,
  ReferencedCount: 0,
};

const baseItem = {
  PK: 'USER#u1',
  SK: 'CHAR#hiyori#MEM#B#food#MEM-001',
  Type: 'Memory',
  UserID: 'u1',
  CharacterID: 'hiyori',
  MemoryID: 'MEM-001',
  Tier: 'B',
  Category: 'food',
  Content: 'コーヒーが好き',
  Confidence: 0.8,
  ReferencedCount: 0,
  CreatedAt: '2026-01-01T00:00:00.000Z',
  UpdatedAt: '2026-01-01T00:00:00.000Z',
};

const tableName = 'nagiyu-livetalk-dev';
const fixedNow = '2026-01-01T00:00:00.000Z';
const fixedNowSec = 1_750_000_000;
const ulidFactory = () => 'MEM-001';

describe('DynamoDBMemoryRepository', () => {
  describe('put', () => {
    it('PutCommand を送り MemoryID / CreatedAt を付与する', async () => {
      const sent: unknown[] = [];
      const client = makeClient(async (cmd) => {
        sent.push(cmd);
        return {};
      });
      const repo = new DynamoDBMemoryRepository(
        client as never,
        tableName,
        ulidFactory,
        () => fixedNow,
        () => fixedNowSec
      );

      const entity = await repo.put(baseInput);
      expect(entity.MemoryID).toBe('MEM-001');
      expect(entity.CreatedAt).toBe(fixedNow);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toBeInstanceOf(PutCommand);
      const input = (sent[0] as PutCommand).input;
      expect(input.Item?.PK).toBe('USER#u1');
      expect(input.Item?.SK).toBe('CHAR#hiyori#MEM#B#food#MEM-001');
    });

    it('Tier B には TTL を付与しない', async () => {
      const sent: unknown[] = [];
      const client = makeClient(async (cmd) => {
        sent.push(cmd);
        return {};
      });
      const repo = new DynamoDBMemoryRepository(
        client as never,
        tableName,
        ulidFactory,
        () => fixedNow,
        () => fixedNowSec
      );
      await repo.put({ ...baseInput, Tier: 'B' });
      const input = (sent[0] as PutCommand).input;
      expect(input.Item?.TTL).toBeUndefined();
    });

    it('Tier C には 30 日後の TTL を付与する', async () => {
      const sent: unknown[] = [];
      const client = makeClient(async (cmd) => {
        sent.push(cmd);
        return {};
      });
      const repo = new DynamoDBMemoryRepository(
        client as never,
        tableName,
        ulidFactory,
        () => fixedNow,
        () => fixedNowSec
      );
      await repo.put({ ...baseInput, Tier: 'C' });
      const input = (sent[0] as PutCommand).input;
      expect(input.Item?.TTL).toBe(fixedNowSec + MEMORY_TIER_C_TTL_SECONDS);
    });

    it('Tier D には 1 日後の TTL を付与する', async () => {
      const sent: unknown[] = [];
      const client = makeClient(async (cmd) => {
        sent.push(cmd);
        return {};
      });
      const repo = new DynamoDBMemoryRepository(
        client as never,
        tableName,
        ulidFactory,
        () => fixedNow,
        () => fixedNowSec
      );
      await repo.put({ ...baseInput, Tier: 'D' });
      const input = (sent[0] as PutCommand).input;
      expect(input.Item?.TTL).toBe(fixedNowSec + MEMORY_TIER_D_TTL_SECONDS);
    });

    it('DynamoDB エラーは DatabaseError でラップする', async () => {
      const client = makeClient(async () => {
        throw new Error('boom');
      });
      const repo = new DynamoDBMemoryRepository(
        client as never,
        tableName,
        ulidFactory,
        () => fixedNow,
        () => fixedNowSec
      );
      await expect(repo.put(baseInput)).rejects.toBeInstanceOf(DatabaseError);
    });

    it('デフォルトコンストラクタで動作する', async () => {
      const client = makeClient(async () => ({}));
      const repo = new DynamoDBMemoryRepository(client as never, tableName);
      const entity = await repo.put(baseInput);
      expect(entity.MemoryID).toMatch(/^[0-9A-Z]{26}$/);
    });
  });

  describe('get', () => {
    it('GetCommand を送り Item があれば Entity を返す', async () => {
      const sent: unknown[] = [];
      const client = makeClient(async (cmd) => {
        sent.push(cmd);
        return { Item: baseItem };
      });
      const repo = new DynamoDBMemoryRepository(
        client as never,
        tableName,
        ulidFactory,
        () => fixedNow,
        () => fixedNowSec
      );
      const result = await repo.get({
        userId: 'u1',
        characterId: 'hiyori',
        tier: 'B',
        category: 'food',
        memoryId: 'MEM-001',
      });
      expect(result?.Content).toBe('コーヒーが好き');
      expect(sent[0]).toBeInstanceOf(GetCommand);
      const input = (sent[0] as GetCommand).input;
      expect(input.Key).toEqual({ PK: 'USER#u1', SK: 'CHAR#hiyori#MEM#B#food#MEM-001' });
    });

    it('Item がなければ null を返す', async () => {
      const client = makeClient(async () => ({ Item: undefined }));
      const repo = new DynamoDBMemoryRepository(
        client as never,
        tableName,
        ulidFactory,
        () => fixedNow,
        () => fixedNowSec
      );
      const result = await repo.get({
        userId: 'u1',
        characterId: 'hiyori',
        tier: 'B',
        category: 'food',
        memoryId: 'missing',
      });
      expect(result).toBeNull();
    });

    it('DynamoDB エラーは DatabaseError でラップする', async () => {
      const client = makeClient(async () => {
        throw new Error('network');
      });
      const repo = new DynamoDBMemoryRepository(
        client as never,
        tableName,
        ulidFactory,
        () => fixedNow,
        () => fixedNowSec
      );
      await expect(
        repo.get({
          userId: 'u1',
          characterId: 'hiyori',
          tier: 'B',
          category: 'food',
          memoryId: 'x',
        })
      ).rejects.toBeInstanceOf(DatabaseError);
    });
  });

  describe('listByTier', () => {
    it('QueryCommand で begins_with による Tier 絞り込みを行う', async () => {
      const sent: unknown[] = [];
      const client = makeClient(async (cmd) => {
        sent.push(cmd);
        return { Items: [baseItem] };
      });
      const repo = new DynamoDBMemoryRepository(
        client as never,
        tableName,
        ulidFactory,
        () => fixedNow,
        () => fixedNowSec
      );
      const result = await repo.listByTier('u1', 'hiyori', 'B');
      expect(result).toHaveLength(1);
      expect(sent[0]).toBeInstanceOf(QueryCommand);
      const input = (sent[0] as QueryCommand).input;
      expect(input.ExpressionAttributeValues?.[':pk']).toBe('USER#u1');
      expect(input.ExpressionAttributeValues?.[':prefix']).toBe('CHAR#hiyori#MEM#B#');
    });

    it('LastEvaluatedKey がある間はページング継続する', async () => {
      let call = 0;
      const client = makeClient(async () => {
        call++;
        if (call === 1) return { Items: [baseItem], LastEvaluatedKey: { PK: 'x', SK: 'y' } };
        return { Items: [] };
      });
      const repo = new DynamoDBMemoryRepository(
        client as never,
        tableName,
        ulidFactory,
        () => fixedNow,
        () => fixedNowSec
      );
      await repo.listByTier('u1', 'hiyori', 'B');
      expect(call).toBe(2);
    });
  });

  describe('listByCategory', () => {
    it('全 Tier を QueryCommand で取得し Category でフィルタする', async () => {
      const foodItem = { ...baseItem };
      const hobbyItem = {
        ...baseItem,
        SK: 'CHAR#hiyori#MEM#B#hobby#MEM-002',
        MemoryID: 'MEM-002',
        Category: 'hobby',
        Content: '読書',
      };
      const client = makeClient(async () => ({ Items: [foodItem, hobbyItem] }));
      const repo = new DynamoDBMemoryRepository(
        client as never,
        tableName,
        ulidFactory,
        () => fixedNow,
        () => fixedNowSec
      );
      const result = await repo.listByCategory('u1', 'hiyori', 'food');
      expect(result).toHaveLength(1);
      expect(result[0].Category).toBe('food');
    });
  });

  describe('update', () => {
    it('UpdateCommand を送り ConditionalCheckFailedException を EntityNotFoundError に変換する', async () => {
      const error = new Error('failed');
      error.name = 'ConditionalCheckFailedException';
      const client = makeClient(async () => {
        throw error;
      });
      const repo = new DynamoDBMemoryRepository(
        client as never,
        tableName,
        ulidFactory,
        () => fixedNow,
        () => fixedNowSec
      );
      await expect(
        repo.update({
          UserID: 'u1',
          CharacterID: 'hiyori',
          Tier: 'B',
          Category: 'food',
          MemoryID: 'MEM-001',
        })
      ).rejects.toBeInstanceOf(EntityNotFoundError);
    });

    it('UpdateCommand を送り更新後のエンティティを返す', async () => {
      const updatedItem = { ...baseItem, Content: '緑茶も好き', Confidence: 0.9 };
      const sent: unknown[] = [];
      const client = makeClient(async (cmd) => {
        sent.push(cmd);
        return { Attributes: updatedItem };
      });
      const repo = new DynamoDBMemoryRepository(
        client as never,
        tableName,
        ulidFactory,
        () => fixedNow,
        () => fixedNowSec
      );
      const result = await repo.update({
        UserID: 'u1',
        CharacterID: 'hiyori',
        Tier: 'B',
        Category: 'food',
        MemoryID: 'MEM-001',
        Content: '緑茶も好き',
        Confidence: 0.9,
      });
      expect(result.Content).toBe('緑茶も好き');
      expect(sent[0]).toBeInstanceOf(UpdateCommand);
    });
  });

  describe('delete', () => {
    it('DeleteCommand を送る', async () => {
      const sent: unknown[] = [];
      const client = makeClient(async (cmd) => {
        sent.push(cmd);
        return {};
      });
      const repo = new DynamoDBMemoryRepository(
        client as never,
        tableName,
        ulidFactory,
        () => fixedNow,
        () => fixedNowSec
      );
      await repo.delete({
        userId: 'u1',
        characterId: 'hiyori',
        tier: 'B',
        category: 'food',
        memoryId: 'MEM-001',
      });
      expect(sent[0]).toBeInstanceOf(DeleteCommand);
      const input = (sent[0] as DeleteCommand).input;
      expect(input.Key).toEqual({ PK: 'USER#u1', SK: 'CHAR#hiyori#MEM#B#food#MEM-001' });
    });

    it('DynamoDB エラーは DatabaseError でラップする', async () => {
      const client = makeClient(async () => {
        throw new Error('boom');
      });
      const repo = new DynamoDBMemoryRepository(
        client as never,
        tableName,
        ulidFactory,
        () => fixedNow,
        () => fixedNowSec
      );
      await expect(
        repo.delete({
          userId: 'u1',
          characterId: 'hiyori',
          tier: 'B',
          category: 'food',
          memoryId: 'x',
        })
      ).rejects.toBeInstanceOf(DatabaseError);
    });
  });

  describe('promote / demote', () => {
    const savedEntity: MemoryEntity = {
      UserID: 'u1',
      CharacterID: 'hiyori',
      MemoryID: 'MEM-001',
      Tier: 'C',
      Category: 'food',
      Content: 'コーヒーが好き',
      Confidence: 0.5,
      ReferencedCount: 1,
      CreatedAt: '2026-01-01T00:00:00.000Z',
      UpdatedAt: '2026-01-01T00:00:00.000Z',
    };

    it('promote は TransactWriteCommand で Put(新SK) + Delete(旧SK) を送る', async () => {
      const sent: unknown[] = [];
      const client = makeClient(async (cmd) => {
        sent.push(cmd);
        return {};
      });
      const repo = new DynamoDBMemoryRepository(
        client as never,
        tableName,
        ulidFactory,
        () => fixedNow,
        () => fixedNowSec
      );
      const result = await repo.promote(savedEntity, 'B');
      expect(result.Tier).toBe('B');
      expect(sent[0]).toBeInstanceOf(TransactWriteCommand);
      const input = (sent[0] as TransactWriteCommand).input;
      expect(input.TransactItems).toHaveLength(2);
      expect(input.TransactItems?.[0].Put?.Item?.SK).toBe('CHAR#hiyori#MEM#B#food#MEM-001');
      expect(input.TransactItems?.[1].Delete?.Key?.SK).toBe('CHAR#hiyori#MEM#C#food#MEM-001');
    });

    it('demote は TransactWriteCommand で Put(新SK) + Delete(旧SK) を送る', async () => {
      const sent: unknown[] = [];
      const client = makeClient(async (cmd) => {
        sent.push(cmd);
        return {};
      });
      const repo = new DynamoDBMemoryRepository(
        client as never,
        tableName,
        ulidFactory,
        () => fixedNow,
        () => fixedNowSec
      );
      const tierAEntity: MemoryEntity = { ...savedEntity, Tier: 'A' };
      const result = await repo.demote(tierAEntity, 'C');
      expect(result.Tier).toBe('C');
      expect(sent[0]).toBeInstanceOf(TransactWriteCommand);
    });

    it('B へ昇格すると TTL なし', async () => {
      const sent: unknown[] = [];
      const client = makeClient(async (cmd) => {
        sent.push(cmd);
        return {};
      });
      const repo = new DynamoDBMemoryRepository(
        client as never,
        tableName,
        ulidFactory,
        () => fixedNow,
        () => fixedNowSec
      );
      await repo.promote(savedEntity, 'B');
      const input = (sent[0] as TransactWriteCommand).input;
      expect(input.TransactItems?.[0].Put?.Item?.TTL).toBeUndefined();
    });

    it('D へ降格すると TTL あり', async () => {
      const sent: unknown[] = [];
      const client = makeClient(async (cmd) => {
        sent.push(cmd);
        return {};
      });
      const repo = new DynamoDBMemoryRepository(
        client as never,
        tableName,
        ulidFactory,
        () => fixedNow,
        () => fixedNowSec
      );
      await repo.demote(savedEntity, 'D');
      const input = (sent[0] as TransactWriteCommand).input;
      expect(input.TransactItems?.[0].Put?.Item?.TTL).toBe(fixedNowSec + MEMORY_TIER_D_TTL_SECONDS);
    });

    it('TransactWrite エラーは DatabaseError でラップする', async () => {
      const client = makeClient(async () => {
        throw new Error('transact error');
      });
      const repo = new DynamoDBMemoryRepository(
        client as never,
        tableName,
        ulidFactory,
        () => fixedNow,
        () => fixedNowSec
      );
      await expect(repo.promote(savedEntity, 'A')).rejects.toBeInstanceOf(DatabaseError);
    });
  });
});
