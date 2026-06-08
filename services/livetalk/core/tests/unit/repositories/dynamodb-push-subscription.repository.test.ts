import { DeleteCommand, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { DatabaseError } from '@nagiyu/aws';
import { DynamoDBPushSubscriptionRepository } from '../../../src/repositories/dynamodb-push-subscription.repository.js';
import type { CreatePushSubscriptionInput } from '../../../src/entities/push-subscription.entity.js';

type SendHandler = (command: unknown) => Promise<unknown>;
const makeClient = (handler: SendHandler) => ({ send: handler });

const fixedNow = 1_750_000_000_000;
const tableName = 'nagiyu-livetalk-dev';

const baseInput: CreatePushSubscriptionInput = {
  UserID: 'u1',
  SubscriptionID: 'sub_abc123',
  Endpoint: 'https://push.example.com/sub1',
  P256dhKey: 'p256-key',
  AuthKey: 'auth-key',
};

const baseItem = {
  PK: 'USER#u1',
  SK: 'PUSH_SUBSCRIPTION#sub_abc123',
  Type: 'PushSubscription',
  UserID: 'u1',
  SubscriptionID: 'sub_abc123',
  Endpoint: 'https://push.example.com/sub1',
  P256dhKey: 'p256-key',
  AuthKey: 'auth-key',
  CreatedAt: fixedNow,
  UpdatedAt: fixedNow,
};

describe('DynamoDBPushSubscriptionRepository', () => {
  describe('put', () => {
    it('PutCommand を送り CreatedAt / UpdatedAt を付与する', async () => {
      const sent: unknown[] = [];
      const client = makeClient(async (cmd) => {
        sent.push(cmd);
        return {};
      });
      const repo = new DynamoDBPushSubscriptionRepository(
        client as never,
        tableName,
        () => fixedNow
      );

      const entity = await repo.put(baseInput);
      expect(entity.CreatedAt).toBe(fixedNow);
      expect(entity.UpdatedAt).toBe(fixedNow);
      expect(sent[0]).toBeInstanceOf(PutCommand);
    });

    it('エラー時は DatabaseError を投げる', async () => {
      const client = makeClient(async () => {
        throw new Error('put 失敗');
      });
      const repo = new DynamoDBPushSubscriptionRepository(
        client as never,
        tableName,
        () => fixedNow
      );
      await expect(repo.put(baseInput)).rejects.toBeInstanceOf(DatabaseError);
    });

    it('非 Error オブジェクトのエラーも DatabaseError に変換する', async () => {
      const client = makeClient(async () => {
        throw 'string error';
      });
      const repo = new DynamoDBPushSubscriptionRepository(
        client as never,
        tableName,
        () => fixedNow
      );
      await expect(repo.put(baseInput)).rejects.toBeInstanceOf(DatabaseError);
    });
  });

  describe('listByUser', () => {
    it('QueryCommand でユーザーのサブスクリプションを返す', async () => {
      const sent: unknown[] = [];
      const client = makeClient(async (cmd) => {
        sent.push(cmd);
        return { Items: [baseItem] };
      });
      const repo = new DynamoDBPushSubscriptionRepository(
        client as never,
        tableName,
        () => fixedNow
      );

      const list = await repo.listByUser('u1');
      expect(list).toHaveLength(1);
      expect(list[0].SubscriptionID).toBe('sub_abc123');
      expect(sent[0]).toBeInstanceOf(QueryCommand);
    });

    it('Items が空のときは空配列を返す', async () => {
      const client = makeClient(async () => ({ Items: [] }));
      const repo = new DynamoDBPushSubscriptionRepository(
        client as never,
        tableName,
        () => fixedNow
      );

      const list = await repo.listByUser('u1');
      expect(list).toEqual([]);
    });

    it('LastEvaluatedKey がある場合はページネーションを継続する', async () => {
      let callCount = 0;
      const client = makeClient(async () => {
        callCount++;
        if (callCount === 1) {
          return { Items: [baseItem], LastEvaluatedKey: { PK: 'USER#u1', SK: 'last' } };
        }
        return { Items: [] };
      });
      const repo = new DynamoDBPushSubscriptionRepository(
        client as never,
        tableName,
        () => fixedNow
      );

      const list = await repo.listByUser('u1');
      expect(list).toHaveLength(1);
      expect(callCount).toBe(2);
    });

    it('エラー時は DatabaseError を投げる', async () => {
      const client = makeClient(async () => {
        throw new Error('query 失敗');
      });
      const repo = new DynamoDBPushSubscriptionRepository(
        client as never,
        tableName,
        () => fixedNow
      );
      await expect(repo.listByUser('u1')).rejects.toBeInstanceOf(DatabaseError);
    });
  });

  describe('get', () => {
    it('GetCommand で単一サブスクリプションを返す', async () => {
      const sent: unknown[] = [];
      const client = makeClient(async (cmd) => {
        sent.push(cmd);
        return { Item: baseItem };
      });
      const repo = new DynamoDBPushSubscriptionRepository(
        client as never,
        tableName,
        () => fixedNow
      );

      const found = await repo.get({ userId: 'u1', subscriptionId: 'sub_abc123' });
      expect(found?.Endpoint).toBe('https://push.example.com/sub1');
      expect(sent[0]).toBeInstanceOf(GetCommand);
    });

    it('Item がない場合は null を返す', async () => {
      const client = makeClient(async () => ({ Item: undefined }));
      const repo = new DynamoDBPushSubscriptionRepository(
        client as never,
        tableName,
        () => fixedNow
      );

      const found = await repo.get({ userId: 'u1', subscriptionId: 'sub_missing' });
      expect(found).toBeNull();
    });

    it('エラー時は DatabaseError を投げる', async () => {
      const client = makeClient(async () => {
        throw new Error('get 失敗');
      });
      const repo = new DynamoDBPushSubscriptionRepository(
        client as never,
        tableName,
        () => fixedNow
      );
      await expect(repo.get({ userId: 'u1', subscriptionId: 'sub_abc123' })).rejects.toBeInstanceOf(
        DatabaseError
      );
    });
  });

  describe('delete', () => {
    it('DeleteCommand を送る', async () => {
      const sent: unknown[] = [];
      const client = makeClient(async (cmd) => {
        sent.push(cmd);
        return {};
      });
      const repo = new DynamoDBPushSubscriptionRepository(
        client as never,
        tableName,
        () => fixedNow
      );

      await repo.delete({ userId: 'u1', subscriptionId: 'sub_abc123' });
      expect(sent[0]).toBeInstanceOf(DeleteCommand);
    });

    it('エラー時は DatabaseError を投げる', async () => {
      const client = makeClient(async () => {
        throw new Error('delete 失敗');
      });
      const repo = new DynamoDBPushSubscriptionRepository(
        client as never,
        tableName,
        () => fixedNow
      );
      await expect(
        repo.delete({ userId: 'u1', subscriptionId: 'sub_abc123' })
      ).rejects.toBeInstanceOf(DatabaseError);
    });
  });

  describe('デフォルト nowMs', () => {
    it('nowMs 省略時は Date.now() が使われる', async () => {
      const client = makeClient(async () => ({}));
      const repo = new DynamoDBPushSubscriptionRepository(client as never, tableName);
      const before = Date.now();
      const entity = await repo.put(baseInput);
      expect(entity.CreatedAt).toBeGreaterThanOrEqual(before);
    });
  });
});
