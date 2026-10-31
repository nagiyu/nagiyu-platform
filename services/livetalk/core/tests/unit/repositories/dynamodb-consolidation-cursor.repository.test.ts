import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { DatabaseError, EntityNotFoundError, OptimisticLockError } from '@nagiyu/aws';
import { DynamoDBConsolidationCursorRepository } from '../../../src/repositories/dynamodb-consolidation-cursor.repository.js';

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
      expect(result?.msgCursor).toBe(100);
    });

    it('DynamoDB エラーは DatabaseError でラップ', async () => {
      const repo = makeRepo(async () => {
        throw new Error('boom');
      });
      await expect(repo.get('u1', 'hiyori')).rejects.toBeInstanceOf(DatabaseError);
    });
  });

  describe('put', () => {
    it('新規作成は存在しないことを条件に Put する', async () => {
      const sent: unknown[] = [];
      const repo = makeRepo(async (cmd) => {
        sent.push(cmd);
        return {};
      });
      const cursor = await repo.put({
        userId: 'u1',
        characterId: 'hiyori',
        msgCursor: 100,
        webrawCursor: 50,
      });
      expect(cursor.updatedAt).toBe(FIXED_NOW);
      expect(sent[0]).toBeInstanceOf(PutCommand);
      const input = (sent[0] as PutCommand).input;
      expect(input.ConditionExpression).toBe('attribute_not_exists(#pk)');
      expect(input.ExpressionAttributeValues).toBeUndefined();
    });

    it('更新（expectedUpdatedAt 指定）は条件付き Put する', async () => {
      const sent: unknown[] = [];
      const repo = makeRepo(async (cmd) => {
        sent.push(cmd);
        return {};
      });
      await repo.put(
        { userId: 'u1', characterId: 'hiyori', msgCursor: 200, webrawCursor: 60 },
        { expectedUpdatedAt: FIXED_NOW - 1000 }
      );
      const input = (sent[0] as PutCommand).input;
      expect(input.ConditionExpression).toContain('#updatedAt = :expectedUpdatedAt');
      expect(input.ExpressionAttributeValues).toEqual({
        ':expectedUpdatedAt': FIXED_NOW - 1000,
      });
    });

    it('新規作成の衝突は OptimisticLockError に揃える', async () => {
      const error = Object.assign(new Error('conflict'), {
        name: 'ConditionalCheckFailedException',
      });
      const repo = makeRepo(async () => {
        throw error;
      });
      const promise = repo.put({
        userId: 'u1',
        characterId: 'hiyori',
        msgCursor: 100,
        webrawCursor: 50,
      });
      await expect(promise).rejects.toBeInstanceOf(OptimisticLockError);
      await expect(promise).rejects.toThrow('ConsolidationCursor=');
    });

    it('更新で UpdatedAt が一致しなければ OptimisticLockError を投げる', async () => {
      const error = Object.assign(new Error('conflict'), {
        name: 'ConditionalCheckFailedException',
        Item: { PK: { S: 'USER#u1' } },
      });
      const repo = makeRepo(async () => {
        throw error;
      });
      await expect(
        repo.put(
          { userId: 'u1', characterId: 'hiyori', msgCursor: 100, webrawCursor: 50 },
          { expectedUpdatedAt: 1 }
        )
      ).rejects.toBeInstanceOf(OptimisticLockError);
    });

    it('更新でカーソルが存在しなければ EntityNotFoundError を投げる', async () => {
      const error = Object.assign(new Error('conflict'), {
        name: 'ConditionalCheckFailedException',
      });
      const repo = makeRepo(async () => {
        throw error;
      });
      await expect(
        repo.put(
          { userId: 'u1', characterId: 'hiyori', msgCursor: 100, webrawCursor: 50 },
          { expectedUpdatedAt: 1 }
        )
      ).rejects.toBeInstanceOf(EntityNotFoundError);
    });

    it('その他のエラーは DatabaseError でラップする', async () => {
      const repo = makeRepo(async () => {
        throw new Error('DB down');
      });
      await expect(
        repo.put({ userId: 'u1', characterId: 'hiyori', msgCursor: 100, webrawCursor: 50 })
      ).rejects.toBeInstanceOf(DatabaseError);
    });
  });
});
