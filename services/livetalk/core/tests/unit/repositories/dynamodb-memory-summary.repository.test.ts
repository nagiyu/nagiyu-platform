import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DatabaseError } from '@nagiyu/aws';
import { DynamoDBMemorySummaryRepository } from '../../../src/repositories/dynamodb-memory-summary.repository.js';
import type { CreateMemorySummaryInput } from '../../../src/entities/memory-summary.entity.js';

type SendHandler = (command: unknown) => Promise<unknown>;
const makeClient = (handler: SendHandler) => ({ send: handler });

const fixedNow = 1_750_000_000_000;
const tableName = 'nagiyu-livetalk-dev';

const baseInput: CreateMemorySummaryInput = {
  UserID: 'u1',
  CharacterID: 'hiyori',
  SummaryText: 'コーヒーが好きな人',
  LastCompressedAt: fixedNow,
};

const mockAttributes = {
  PK: 'USER#u1',
  SK: 'CHAR#hiyori#MEMORY#SUMMARY',
  Type: 'MemorySummary',
  UserID: 'u1',
  CharacterID: 'hiyori',
  SummaryText: 'コーヒーが好きな人',
  LastCompressedAt: fixedNow,
  CreatedAt: fixedNow,
  UpdatedAt: fixedNow,
};

describe('DynamoDBMemorySummaryRepository', () => {
  describe('get', () => {
    it('Item がない場合は null を返す', async () => {
      const client = makeClient(async () => ({ Item: undefined }));
      const repo = new DynamoDBMemorySummaryRepository(client as never, tableName, () => fixedNow);
      expect(await repo.get('u1', 'hiyori')).toBeNull();
    });

    it('GetCommand を正しいキーで送信する', async () => {
      const sent: unknown[] = [];
      const client = makeClient(async (cmd) => {
        sent.push(cmd);
        return { Item: mockAttributes };
      });
      const repo = new DynamoDBMemorySummaryRepository(client as never, tableName, () => fixedNow);
      await repo.get('u1', 'hiyori');
      expect(sent[0]).toBeInstanceOf(GetCommand);
      const input = (sent[0] as GetCommand).input;
      expect(input.Key?.PK).toBe('USER#u1');
      expect(input.Key?.SK).toBe('CHAR#hiyori#MEMORY#SUMMARY');
    });

    it('アイテムが存在する場合はエンティティを返す', async () => {
      const client = makeClient(async () => ({ Item: mockAttributes }));
      const repo = new DynamoDBMemorySummaryRepository(client as never, tableName, () => fixedNow);
      const entity = await repo.get('u1', 'hiyori');
      expect(entity?.UserID).toBe('u1');
      expect(entity?.SummaryText).toBe('コーヒーが好きな人');
    });

    it('DynamoDB エラーを DatabaseError にラップする', async () => {
      const client = makeClient(async () => {
        throw new Error('接続エラー');
      });
      const repo = new DynamoDBMemorySummaryRepository(client as never, tableName, () => fixedNow);
      await expect(repo.get('u1', 'hiyori')).rejects.toBeInstanceOf(DatabaseError);
    });
  });

  describe('put', () => {
    it('UpdateCommand を送信する', async () => {
      const sent: unknown[] = [];
      const client = makeClient(async (cmd) => {
        sent.push(cmd);
        return { Attributes: mockAttributes };
      });
      const repo = new DynamoDBMemorySummaryRepository(client as never, tableName, () => fixedNow);
      await repo.put(baseInput);
      expect(sent[0]).toBeInstanceOf(UpdateCommand);
    });

    it('正しいキーで UpdateCommand を送信する', async () => {
      const sent: unknown[] = [];
      const client = makeClient(async (cmd) => {
        sent.push(cmd);
        return { Attributes: mockAttributes };
      });
      const repo = new DynamoDBMemorySummaryRepository(client as never, tableName, () => fixedNow);
      await repo.put(baseInput);
      const input = (sent[0] as UpdateCommand).input;
      expect(input.Key?.PK).toBe('USER#u1');
      expect(input.Key?.SK).toBe('CHAR#hiyori#MEMORY#SUMMARY');
    });

    it('UpdateExpression に if_not_exists(CreatedAt) が含まれる', async () => {
      const sent: unknown[] = [];
      const client = makeClient(async (cmd) => {
        sent.push(cmd);
        return { Attributes: mockAttributes };
      });
      const repo = new DynamoDBMemorySummaryRepository(client as never, tableName, () => fixedNow);
      await repo.put(baseInput);
      const input = (sent[0] as UpdateCommand).input;
      expect(input.UpdateExpression).toContain('if_not_exists(CreatedAt');
    });

    it('エンティティを返す', async () => {
      const client = makeClient(async () => ({ Attributes: mockAttributes }));
      const repo = new DynamoDBMemorySummaryRepository(client as never, tableName, () => fixedNow);
      const entity = await repo.put(baseInput);
      expect(entity.UserID).toBe('u1');
      expect(entity.SummaryText).toBe('コーヒーが好きな人');
      expect(entity.UpdatedAt).toBe(fixedNow);
    });

    it('DynamoDB エラーを DatabaseError にラップする', async () => {
      const client = makeClient(async () => {
        throw new Error('書き込みエラー');
      });
      const repo = new DynamoDBMemorySummaryRepository(client as never, tableName, () => fixedNow);
      await expect(repo.put(baseInput)).rejects.toBeInstanceOf(DatabaseError);
    });
  });
});
