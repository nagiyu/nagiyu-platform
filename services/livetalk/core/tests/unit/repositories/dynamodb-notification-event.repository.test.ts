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
  CharacterID: 'hiyori',
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
  CharacterID: 'hiyori',
  Kind: 'normal',
  Title: 'テスト通知',
  Body: 'テスト本文',
  CreatedAt: fixedNow,
  UpdatedAt: fixedNow,
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
      const repo = new DynamoDBNotificationEventRepository(
        client as never,
        tableName,
        () => fixedNow
      );

      const entity = await repo.put(baseInput);
      expect(entity.CreatedAt).toBe(fixedNow);
      expect(sent[0]).toBeInstanceOf(PutCommand);
    });

    it('critical 種別と KnowledgeID を保存できる', async () => {
      const client = makeClient(async () => ({}));
      const repo = new DynamoDBNotificationEventRepository(
        client as never,
        tableName,
        () => fixedNow
      );

      const entity = await repo.put({ ...baseInput, Kind: 'critical', KnowledgeID: 'k1' });
      expect(entity.Kind).toBe('critical');
      expect(entity.KnowledgeID).toBe('k1');
    });

    it('エラー時は DatabaseError を投げる', async () => {
      const client = makeClient(async () => {
        throw new Error('put 失敗');
      });
      const repo = new DynamoDBNotificationEventRepository(
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
      const repo = new DynamoDBNotificationEventRepository(
        client as never,
        tableName,
        () => fixedNow
      );
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
      const repo = new DynamoDBNotificationEventRepository(
        client as never,
        tableName,
        () => fixedNow
      );

      const list = await repo.listByUser('u1');
      expect(list).toHaveLength(1);
      expect(list[0].NotifID).toBe('NOTIF-001');
      expect(sent[0]).toBeInstanceOf(QueryCommand);
      expect((sent[0] as QueryCommand).input.ScanIndexForward).toBe(false);
    });

    it('Items が空のときは空配列を返す', async () => {
      const client = makeClient(async () => ({ Items: [] }));
      const repo = new DynamoDBNotificationEventRepository(
        client as never,
        tableName,
        () => fixedNow
      );

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
      const repo = new DynamoDBNotificationEventRepository(
        client as never,
        tableName,
        () => fixedNow
      );

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
      const repo = new DynamoDBNotificationEventRepository(
        client as never,
        tableName,
        () => fixedNow
      );

      // limit=1 → 1件取得後にページネーション終了
      const list = await repo.listByUser('u1', 1);
      expect(list).toHaveLength(1);
      expect(callCount).toBe(1);
    });

    it('エラー時は DatabaseError を投げる', async () => {
      const client = makeClient(async () => {
        throw new Error('query 失敗');
      });
      const repo = new DynamoDBNotificationEventRepository(
        client as never,
        tableName,
        () => fixedNow
      );
      await expect(repo.listByUser('u1')).rejects.toBeInstanceOf(DatabaseError);
    });
  });

  describe('listLatestUnconsumedByCharacter', () => {
    it('characterIds が空の場合は即 [] を返す', async () => {
      const client = makeClient(async () => ({ Items: [] }));
      const repo = new DynamoDBNotificationEventRepository(
        client as never,
        tableName,
        () => fixedNow
      );
      const result = await repo.listLatestUnconsumedByCharacter('u1', []);
      expect(result).toEqual([]);
    });

    it('キャラごとに最新未消化通知 1 件を返す', async () => {
      const hiyoriItem = {
        ...baseItem,
        NotifID: 'N-HIY',
        CharacterID: 'hiyori',
        SK: 'NOTIF#N-HIY',
      };
      const agehaItem = { ...baseItem, NotifID: 'N-AGE', CharacterID: 'ageha', SK: 'NOTIF#N-AGE' };
      const client = makeClient(async () => ({ Items: [hiyoriItem, agehaItem] }));
      const repo = new DynamoDBNotificationEventRepository(
        client as never,
        tableName,
        () => fixedNow
      );

      const result = await repo.listLatestUnconsumedByCharacter('u1', ['hiyori', 'ageha']);
      expect(result).toHaveLength(2);
      const charIds = result.map((e) => e.CharacterID);
      expect(charIds).toContain('hiyori');
      expect(charIds).toContain('ageha');
    });

    it('消化済みイベントはスキップする', async () => {
      const consumedItem = {
        ...baseItem,
        NotifID: 'N-CONSUMED',
        CharacterID: 'hiyori',
        SK: 'NOTIF#N-CONSUMED',
        ConsumedAt: fixedNow - 1000,
      };
      const client = makeClient(async () => ({ Items: [consumedItem] }));
      const repo = new DynamoDBNotificationEventRepository(
        client as never,
        tableName,
        () => fixedNow
      );

      const result = await repo.listLatestUnconsumedByCharacter('u1', ['hiyori']);
      expect(result).toHaveLength(0);
    });

    it('未消化が 1 ページ目より後ろにあっても取りこぼさない（複数ページ連鎖）', async () => {
      // 1 ページ目: hiyori の消化済み通知 100 件
      // 2 ページ目: hiyori の未消化通知 1 件
      let callCount = 0;
      const client = makeClient(async () => {
        callCount++;
        if (callCount === 1) {
          const consumedItems = Array.from({ length: 100 }, (_, i) => ({
            ...baseItem,
            NotifID: `N-CONSUMED-${i}`,
            CharacterID: 'hiyori',
            SK: `NOTIF#N-CONSUMED-${i}`,
            ConsumedAt: fixedNow - (i + 1) * 1000,
          }));
          return { Items: consumedItems, LastEvaluatedKey: { PK: 'USER#u1', SK: 'cursor' } };
        }
        // 2 ページ目: 未消化が 1 件
        return {
          Items: [
            {
              ...baseItem,
              NotifID: 'N-LATE-UNCONSUMED',
              CharacterID: 'hiyori',
              SK: 'NOTIF#N-LATE-UNCONSUMED',
            },
          ],
        };
      });
      const repo = new DynamoDBNotificationEventRepository(
        client as never,
        tableName,
        () => fixedNow
      );

      const result = await repo.listLatestUnconsumedByCharacter('u1', ['hiyori']);
      // 2 ページ目にある未消化を正しく発見できること
      expect(result).toHaveLength(1);
      expect(result[0].NotifID).toBe('N-LATE-UNCONSUMED');
      expect(callCount).toBe(2);
    });

    it('全キャラ充足したら早期終了する', async () => {
      // 1 ページ目で hiyori, ageha 双方の未消化が揃う → 2 ページ目を問い合わせない
      let callCount = 0;
      const hiyoriItem = {
        ...baseItem,
        NotifID: 'N-HIY',
        CharacterID: 'hiyori',
        SK: 'NOTIF#N-HIY',
      };
      const agehaItem = { ...baseItem, NotifID: 'N-AGE', CharacterID: 'ageha', SK: 'NOTIF#N-AGE' };
      const client = makeClient(async () => {
        callCount++;
        return {
          Items: [hiyoriItem, agehaItem],
          LastEvaluatedKey: { PK: 'USER#u1', SK: 'cursor' },
        };
      });
      const repo = new DynamoDBNotificationEventRepository(
        client as never,
        tableName,
        () => fixedNow
      );

      const result = await repo.listLatestUnconsumedByCharacter('u1', ['hiyori', 'ageha']);
      expect(result).toHaveLength(2);
      // 全キャラ充足で break → 1 回しか呼ばれない
      expect(callCount).toBe(1);
    });

    it('未消化が 0 のキャラが対象に含まれる場合は履歴を走査し尽くし、他キャラは正しく返す', async () => {
      // 最悪ケース: ageha は未消化が一切無いため早期終了せず、全ページを走査する。
      // それでも hiyori の最新未消化は取りこぼさず返ること。
      let callCount = 0;
      const client = makeClient(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            Items: [
              { ...baseItem, NotifID: 'N-HIY', CharacterID: 'hiyori', SK: 'NOTIF#N-HIY' },
              // ageha は消化済みのみ（未消化なし）
              {
                ...baseItem,
                NotifID: 'N-AGE-C',
                CharacterID: 'ageha',
                SK: 'NOTIF#N-AGE-C',
                ConsumedAt: fixedNow - 1000,
              },
            ],
            LastEvaluatedKey: { PK: 'USER#u1', SK: 'cursor1' },
          };
        }
        if (callCount === 2) {
          return {
            Items: [
              {
                ...baseItem,
                NotifID: 'N-AGE-C2',
                CharacterID: 'ageha',
                SK: 'NOTIF#N-AGE-C2',
                ConsumedAt: fixedNow - 2000,
              },
            ],
            LastEvaluatedKey: { PK: 'USER#u1', SK: 'cursor2' },
          };
        }
        // 最終ページ（LastEvaluatedKey なし）
        return { Items: [] };
      });
      const repo = new DynamoDBNotificationEventRepository(
        client as never,
        tableName,
        () => fixedNow
      );

      const result = await repo.listLatestUnconsumedByCharacter('u1', ['hiyori', 'ageha']);
      // ageha は未消化なしで充足しないため、終端まで走査する（早期終了しない）
      expect(callCount).toBe(3);
      // hiyori の未消化のみ返る
      expect(result).toHaveLength(1);
      expect(result[0].CharacterID).toBe('hiyori');
      expect(result[0].NotifID).toBe('N-HIY');
    });

    it('エラー時は DatabaseError を投げる', async () => {
      const client = makeClient(async () => {
        throw new Error('query 失敗');
      });
      const repo = new DynamoDBNotificationEventRepository(
        client as never,
        tableName,
        () => fixedNow
      );
      await expect(repo.listLatestUnconsumedByCharacter('u1', ['hiyori'])).rejects.toBeInstanceOf(
        DatabaseError
      );
    });
  });

  describe('get', () => {
    it('GetCommand で単一イベントを返す', async () => {
      const sent: unknown[] = [];
      const client = makeClient(async (cmd) => {
        sent.push(cmd);
        return { Item: baseItem };
      });
      const repo = new DynamoDBNotificationEventRepository(
        client as never,
        tableName,
        () => fixedNow
      );

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
      const repo = new DynamoDBNotificationEventRepository(
        client as never,
        tableName,
        () => fixedNow
      );

      const found = await repo.get({ userId: 'u1', notifId: 'NOTIF-001' });
      expect(found?.KnowledgeID).toBe('k1');
      expect(found?.ConsumedAt).toBe(fixedNow + 5000);
    });

    it('Item がない場合は null を返す', async () => {
      const client = makeClient(async () => ({ Item: undefined }));
      const repo = new DynamoDBNotificationEventRepository(
        client as never,
        tableName,
        () => fixedNow
      );

      const found = await repo.get({ userId: 'u1', notifId: 'NOTIF-MISSING' });
      expect(found).toBeNull();
    });

    it('エラー時は DatabaseError を投げる', async () => {
      const client = makeClient(async () => {
        throw new Error('get 失敗');
      });
      const repo = new DynamoDBNotificationEventRepository(
        client as never,
        tableName,
        () => fixedNow
      );
      await expect(repo.get({ userId: 'u1', notifId: 'NOTIF-001' })).rejects.toBeInstanceOf(
        DatabaseError
      );
    });
  });

  describe('markConsumed', () => {
    it('UpdateCommand を送る', async () => {
      const sent: unknown[] = [];
      const client = makeClient(async (cmd) => {
        sent.push(cmd);
        return {};
      });
      const repo = new DynamoDBNotificationEventRepository(
        client as never,
        tableName,
        () => fixedNow
      );

      await repo.markConsumed({ userId: 'u1', notifId: 'NOTIF-001' }, fixedNow + 5000);
      expect(sent[0]).toBeInstanceOf(UpdateCommand);
      const input = (sent[0] as UpdateCommand).input;
      expect(input.ExpressionAttributeValues?.[':consumedAt']).toBe(fixedNow + 5000);
    });

    it('エラー時は DatabaseError を投げる', async () => {
      const client = makeClient(async () => {
        throw new Error('update 失敗');
      });
      const repo = new DynamoDBNotificationEventRepository(
        client as never,
        tableName,
        () => fixedNow
      );
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
