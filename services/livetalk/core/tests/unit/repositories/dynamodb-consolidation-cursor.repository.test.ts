import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { DatabaseError } from '@nagiyu/aws';
import { DynamoDBConsolidationCursorRepository } from '../../../src/repositories/dynamodb-consolidation-cursor.repository.js';
import { OptimisticLockError } from '../../../src/repositories/optimistic-lock.error.js';

const TABLE = 'nagiyu-livetalk-test';
const FIXED_NOW = 1_700_000_000_000;

type SendHandler = (command: unknown) => Promise<unknown>;
const makeClient = (handler: SendHandler) => ({ send: handler });

function makeRepo(handler: SendHandler) {
  return new DynamoDBConsolidationCursorRepository(
    makeClient(handler) as never,
    TABLE,
    () => FIXED_NOW
  );
}

describe('DynamoDBConsolidationCursorRepository', () => {
  describe('get', () => {
    it('GetCommand を送り、見つからなければ null', async () => {
      const sent: unknown[] = [];
      const repo = makeRepo(async (cmd) => {
        sent.push(cmd);
        return { Item: undefined };
      });
      const result = await repo.get('u1', 'hiyori');
      expect(result).toBeNull();
      expect(sent[0]).toBeInstanceOf(GetCommand);
      expect((sent[0] as GetCommand).input.Key).toEqual({
        PK: 'USER#u1',
        SK: 'CHAR#hiyori#CURSOR',
      });
    });

    it('Item があればエンティティを返す', async () => {
      const item = {
        PK: 'USER#u1',
        SK: 'CHAR#hiyori#CURSOR',
        Type: 'ConsolidationCursor',
        UserID: 'u1',
        CharacterID: 'hiyori',
        MsgCursor: 100,
        WebrawCursor: 50,
        UpdatedAt: FIXED_NOW,
      };
      const repo = makeRepo(async () => ({ Item: item }));
      const result = await repo.get('u1', 'hiyori');
      expect(result?.MsgCursor).toBe(100);
    });

    it('DynamoDB エラーは DatabaseError でラップ', async () => {
      const repo = makeRepo(async () => {
        throw new Error('boom');
      });
      await expect(repo.get('u1', 'hiyori')).rejects.toBeInstanceOf(DatabaseError);
    });
  });

  describe('put', () => {
    it('新規作成は attribute_not_exists(PK) を条件に Put する', async () => {
      const sent: unknown[] = [];
      const repo = makeRepo(async (cmd) => {
        sent.push(cmd);
        return {};
      });
      const cursor = await repo.put({
        UserID: 'u1',
        CharacterID: 'hiyori',
        MsgCursor: 100,
        WebrawCursor: 50,
      });
      expect(cursor.UpdatedAt).toBe(FIXED_NOW);
      expect(sent[0]).toBeInstanceOf(PutCommand);
      const input = (sent[0] as PutCommand).input;
      expect(input.ConditionExpression).toBe('attribute_not_exists(PK)');
      expect(input.ExpressionAttributeValues).toBeUndefined();
    });

    it('更新（expectedUpdatedAt 指定）は条件付き Put する', async () => {
      const sent: unknown[] = [];
      const repo = makeRepo(async (cmd) => {
        sent.push(cmd);
        return {};
      });
      await repo.put(
        { UserID: 'u1', CharacterID: 'hiyori', MsgCursor: 200, WebrawCursor: 60 },
        { expectedUpdatedAt: FIXED_NOW - 1000 }
      );
      const input = (sent[0] as PutCommand).input;
      expect(input.ConditionExpression).toBe('UpdatedAt = :expectedUpdatedAt');
      expect(input.ExpressionAttributeValues).toEqual({
        ':expectedUpdatedAt': FIXED_NOW - 1000,
      });
    });

    it('ConditionalCheckFailedException は OptimisticLockError に変換する', async () => {
      const error = Object.assign(new Error('conflict'), {
        name: 'ConditionalCheckFailedException',
      });
      const repo = makeRepo(async () => {
        throw error;
      });
      await expect(
        repo.put({ UserID: 'u1', CharacterID: 'hiyori', MsgCursor: 100, WebrawCursor: 50 })
      ).rejects.toBeInstanceOf(OptimisticLockError);
    });

    it('その他のエラーは DatabaseError でラップする', async () => {
      const repo = makeRepo(async () => {
        throw new Error('DB down');
      });
      await expect(
        repo.put({ UserID: 'u1', CharacterID: 'hiyori', MsgCursor: 100, WebrawCursor: 50 })
      ).rejects.toBeInstanceOf(DatabaseError);
    });
  });
});
