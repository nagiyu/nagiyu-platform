import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DatabaseError } from '@nagiyu/aws';
import { DynamoDBNotificationEventRepository } from '../../../src/repositories/dynamodb-notification-event.repository.js';
import type { CreateNotificationEventInput } from '../../../src/entities/notification-event.entity.js';

type SendHandler = (command: unknown) => Promise<unknown>;
const makeClient = (handler: SendHandler) => ({ send: handler });

const fixedNow = 1_750_000_000_000;
const tableName = 'nagiyu-livetalk-dev';

const baseInput: CreateNotificationEventInput = {
  UserID: 'u1',
  NotifID: 'NOTIF-001',
  Kind: 'normal',
  Title: 'テスト通知',
  Body: 'テスト本文',
  Ttl: Math.floor(fixedNow / 1000) + 86400,
};

const baseItem = {
  PK: 'USER#u1',
  SK: 'NOTIF#NOTIF-001',
  Type: 'NotificationEvent',
  UserID: 'u1',
  NotifID: 'NOTIF-001',
  Kind: 'normal',
  Title: 'テスト通知',
  Body: 'テスト本文',
  CreatedAt: fixedNow,
  Ttl: Math.floor(fixedNow / 1000) + 86400,
};

describe('DynamoDBNotificationEventRepository', () => {
  describe('put', () => {
    it('PutCommand を送り CreatedAt を付与する', async () => {
      const sent: unknown[] = [];
      const client = makeClient(async (cmd) => {
        sent.push(cmd);
        return {};
      });
      const repo = new DynamoDBNotificationEventRepository(client as never, tableName, () => fixedNow);

      const entity = await repo.put(baseInput);
      expect(entity.CreatedAt).toBe(fixedNow);
      expect(sent[0]).toBeInstanceOf(PutCommand);
    });

    it('critical 種別と KnowledgeID を保存できる', async () => {
      const client = makeClient(async () => ({}));
      const repo = new DynamoDBNotificationEventRepository(client as never, tableName, () => fixedNow);

      const entity = await repo.put({ ...baseInput, Kind: 'critical', KnowledgeID: 'k1' });
      expect(entity.Kind).toBe('critical');
      expect(entity.KnowledgeID).toBe('k1');
    });

    it('エラー時は DatabaseError を投げる', async () => {
      const client = makeClient(async () => { throw new Error('put 失敗'); });
      const repo = new DynamoDBNotificationEventRepository(client as never, tableName, () => fixedNow);
      await expect(repo.put(baseInput)).rejects.toBeInstanceOf(DatabaseError);
    });

    it('非 Error オブジェクトのエラーも DatabaseError に変換する', async () => {
      const client = makeClient(async () => { throw 'string error'; });
      const repo = new DynamoDBNotificationEventRepository(client as never, tableName, () => fixedNow);
      await expect(repo.put(baseInput)).rejects.toBeInstanceOf(DatabaseError);
    });
  });

  describe('listByUser', () => {
    it('QueryCommand でユーザーの通知イベントを返す', async () => {
      const sent: unknown[] = [];
      const client = makeClient(async (cmd) => {
        sent.push(cmd);
        return { Items: [baseItem] };
      });
      const repo = new DynamoDBNotificationEventRepository(client as never, tableName, () => fixedNow);

      const list = await repo.listByUser('u1');
      expect(list).toHaveLength(1);
      expect(list[0].NotifID).toBe('NOTIF-001');
      expect(sent[0]).toBeInstanceOf(QueryCommand);
      expect((sent[0] as QueryCommand).input.ScanIndexForward).toBe(false);
    });

    it('Items が空のときは空配列を返す', async () => {
      const client = makeClient(async () => ({ Items: [] }));
      const repo = new DynamoDBNotificationEventRepository(client as never, tableName, () => fixedNow);

      const list = await repo.listByUser('u1');
      expect(list).toEqual([]);
    });

    it('LastEvaluatedKey があり limit 未満の場合はページネーションを継続する', async () => {
      let callCount = 0;
      const client = makeClient(async () => {
        callCount++;
        if (callCount === 1) {
          return { Items: [baseItem], LastEvaluatedKey: { PK: 'USER#u1', SK: 'last' } };
        }
        return { Items: [] };
      });
      const repo = new DynamoDBNotificationEventRepository(client as never, tableName, () => fixedNow);

      const list = await repo.listByUser('u1', 100);
      expect(list).toHaveLength(1);
      expect(callCount).toBe(2);
    });

    it('limit に達したらページネーションを打ち切る', async () => {
      let callCount = 0;
      const client = makeClient(async () => {
        callCount++;
        // 最初のページで limit 分のアイテムを返す
        const item = { ...baseItem, NotifID: `NOTIF-${callCount}` };
        return { Items: [item], LastEvaluatedKey: { PK: 'USER#u1', SK: 'last' } };
      });
      const repo = new DynamoDBNotificationEventRepository(client as never, tableName, () => fixedNow);

      // limit=1 → 1件取得後にページネーション終了
      const list = await repo.listByUser('u1', 1);
      expect(list).toHaveLength(1);
      expect(callCount).toBe(1);
    });

    it('エラー時は DatabaseError を投げる', async () => {
      const client = makeClient(async () => { throw new Error('query 失敗'); });
      const repo = new DynamoDBNotificationEventRepository(client as never, tableName, () => fixedNow);
      await expect(repo.listByUser('u1')).rejects.toBeInstanceOf(DatabaseError);
    });
  });

  describe('get', () => {
    it('GetCommand で単一イベントを返す', async () => {
      const sent: unknown[] = [];
      const client = makeClient(async (cmd) => {
        sent.push(cmd);
        return { Item: baseItem };
      });
      const repo = new DynamoDBNotificationEventRepository(client as never, tableName, () => fixedNow);

      const found = await repo.get({ userId: 'u1', notifId: 'NOTIF-001' });
      expect(found?.Body).toBe('テスト本文');
      expect(sent[0]).toBeInstanceOf(GetCommand);
    });

    it('KnowledgeID と ConsumedAt がある場合も正しく返す', async () => {
      const itemWithOptionals = {
        ...baseItem,
        KnowledgeID: 'k1',
        ConsumedAt: fixedNow + 5000,
      };
      const client = makeClient(async () => ({ Item: itemWithOptionals }));
      const repo = new DynamoDBNotificationEventRepository(client as never, tableName, () => fixedNow);

      const found = await repo.get({ userId: 'u1', notifId: 'NOTIF-001' });
      expect(found?.KnowledgeID).toBe('k1');
      expect(found?.ConsumedAt).toBe(fixedNow + 5000);
    });

    it('Item がない場合は null を返す', async () => {
      const client = makeClient(async () => ({ Item: undefined }));
      const repo = new DynamoDBNotificationEventRepository(client as never, tableName, () => fixedNow);

      const found = await repo.get({ userId: 'u1', notifId: 'NOTIF-MISSING' });
      expect(found).toBeNull();
    });

    it('エラー時は DatabaseError を投げる', async () => {
      const client = makeClient(async () => { throw new Error('get 失敗'); });
      const repo = new DynamoDBNotificationEventRepository(client as never, tableName, () => fixedNow);
      await expect(repo.get({ userId: 'u1', notifId: 'NOTIF-001' })).rejects.toBeInstanceOf(DatabaseError);
    });
  });

  describe('markConsumed', () => {
    it('UpdateCommand を送る', async () => {
      const sent: unknown[] = [];
      const client = makeClient(async (cmd) => {
        sent.push(cmd);
        return {};
      });
      const repo = new DynamoDBNotificationEventRepository(client as never, tableName, () => fixedNow);

      await repo.markConsumed({ userId: 'u1', notifId: 'NOTIF-001' }, fixedNow + 5000);
      expect(sent[0]).toBeInstanceOf(UpdateCommand);
      const input = (sent[0] as UpdateCommand).input;
      expect(input.ExpressionAttributeValues?.[':consumedAt']).toBe(fixedNow + 5000);
    });

    it('エラー時は DatabaseError を投げる', async () => {
      const client = makeClient(async () => { throw new Error('update 失敗'); });
      const repo = new DynamoDBNotificationEventRepository(client as never, tableName, () => fixedNow);
      await expect(
        repo.markConsumed({ userId: 'u1', notifId: 'NOTIF-001' }, fixedNow)
      ).rejects.toBeInstanceOf(DatabaseError);
    });
  });

  describe('デフォルト nowMs', () => {
    it('nowMs 省略時は Date.now() が使われる', async () => {
      const client = makeClient(async () => ({}));
      const repo = new DynamoDBNotificationEventRepository(client as never, tableName);
      const before = Date.now();
      const entity = await repo.put(baseInput);
      expect(entity.CreatedAt).toBeGreaterThanOrEqual(before);
    });
  });
});
