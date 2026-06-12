import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { DatabaseError } from '@nagiyu/aws';
import { DynamoDBProfileRepository } from '../../../src/repositories/dynamodb-profile.repository.js';

type SendHandler = (command: unknown) => Promise<unknown>;
const makeClient = (handler: SendHandler) => ({ send: handler });

describe('DynamoDBProfileRepository', () => {
  const tableName = 'nagiyu-livetalk-dev';
  const now = 1_700_000_000_000;

  it('nowMs を省略した場合は Date.now が使われる', async () => {
    const client = makeClient(async (cmd) => {
      if (cmd instanceof GetCommand) return { Item: undefined };
      return {};
    });
    const repo = new DynamoDBProfileRepository(client as never, tableName);
    const before = Date.now();
    const result = await repo.upsert({ UserID: 'u1' });
    expect(result.CreatedAt).toBeGreaterThanOrEqual(before);
  });

  it('Error 以外の例外も DatabaseError でラップする', async () => {
    const client = makeClient(async () => {
      throw 'string error';
    });
    const repo = new DynamoDBProfileRepository(client as never, tableName, () => now);
    await expect(repo.getById({ userId: 'u1' })).rejects.toBeInstanceOf(DatabaseError);
  });

  it('upsert は GetCommand → PutCommand の順に送り、初回は CreatedAt=now', async () => {
    const sent: unknown[] = [];
    const client = makeClient(async (cmd) => {
      sent.push(cmd);
      if (cmd instanceof GetCommand) return { Item: undefined };
      return {};
    });
    const repo = new DynamoDBProfileRepository(client as never, tableName, () => now);

    const result = await repo.upsert({ UserID: 'u1' });

    expect(sent[0]).toBeInstanceOf(GetCommand);
    expect(sent[1]).toBeInstanceOf(PutCommand);
    const put = (sent[1] as PutCommand).input;
    expect(put.Item?.PK).toBe('USER#u1');
    expect(put.Item?.SK).toBe('PROFILE');
    expect(put.Item?.CreatedAt).toBe(now);
    expect(put.Item?.LastActiveAt).toBe(now);
    // PII を持ち込まない
    expect(put.Item?.DisplayName).toBeUndefined();
    expect(put.Item?.Email).toBeUndefined();
    expect(put.Item?.GoogleID).toBeUndefined();
    expect(result.CreatedAt).toBe(now);
  });

  it('既存があれば CreatedAt は維持しつつ LastActiveAt と UpdatedAt を反映する', async () => {
    const existing = {
      PK: 'USER#u1',
      SK: 'PROFILE',
      Type: 'Profile',
      UserID: 'u1',
      LastActiveAt: now - 1000,
      CreatedAt: 1_600_000_000_000,
      UpdatedAt: now - 1000,
    };
    const client = makeClient(async (cmd) => {
      if (cmd instanceof GetCommand) return { Item: existing };
      return {};
    });
    const repo = new DynamoDBProfileRepository(client as never, tableName, () => now);

    const result = await repo.upsert({ UserID: 'u1' }, { LastActiveAt: now });

    expect(result.CreatedAt).toBe(1_600_000_000_000);
    expect(result.UpdatedAt).toBe(now);
    expect(result.LastActiveAt).toBe(now);
  });

  it('getById は未登録時に null を返す', async () => {
    const client = makeClient(async () => ({ Item: undefined }));
    const repo = new DynamoDBProfileRepository(client as never, tableName, () => now);
    expect(await repo.getById({ userId: 'unknown' })).toBeNull();
  });

  it('getById エラーは DatabaseError でラップ', async () => {
    const client = makeClient(async () => {
      throw new Error('failure');
    });
    const repo = new DynamoDBProfileRepository(client as never, tableName, () => now);
    await expect(repo.getById({ userId: 'u1' })).rejects.toBeInstanceOf(DatabaseError);
  });

  it('upsert の Put エラーは DatabaseError でラップ', async () => {
    const client = makeClient(async (cmd) => {
      if (cmd instanceof GetCommand) return { Item: undefined };
      throw new Error('put failure');
    });
    const repo = new DynamoDBProfileRepository(client as never, tableName, () => now);
    await expect(repo.upsert({ UserID: 'u1' })).rejects.toBeInstanceOf(DatabaseError);
  });

  it('upsert に Consents を渡すと PutCommand に Consents が含まれる', async () => {
    const sent: unknown[] = [];
    const client = makeClient(async (cmd) => {
      sent.push(cmd);
      if (cmd instanceof GetCommand) return { Item: undefined };
      return {};
    });
    const repo = new DynamoDBProfileRepository(client as never, tableName, () => now);
    const consents = {
      TermsAgreed: { Version: '1.0.0', AgreedAt: now },
      PrivacyAgreed: { Version: '1.0.0', AgreedAt: now },
      AgeVerified: { Value: true, VerifiedAt: now },
    };
    await repo.upsert({ UserID: 'u1' }, { Consents: consents });
    const put = (sent[1] as PutCommand).input;
    expect(put.Item?.Consents).toEqual(consents);
  });

  describe('listAllUserIds', () => {
    it('GSI1 を QueryCommand で IndexName="GSI1" を指定して送信する', async () => {
      const sent: unknown[] = [];
      const client = makeClient(async (cmd) => {
        sent.push(cmd);
        return { Items: [{ GSI1PK: 'PROFILE', GSI1SK: 'user-1' }] };
      });
      const repo = new DynamoDBProfileRepository(client as never, tableName, () => now);

      const result = await repo.listAllUserIds();

      expect(sent[0]).toBeInstanceOf(QueryCommand);
      const query = (sent[0] as QueryCommand).input;
      expect(query.IndexName).toBe('GSI1');
      expect(result).toEqual(['user-1']);
    });

    it('複数ページ（LastEvaluatedKey 連鎖）を結合して UserID 配列を返す', async () => {
      let callCount = 0;
      const client = makeClient(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            Items: [{ GSI1PK: 'PROFILE', GSI1SK: 'user-1' }],
            LastEvaluatedKey: { GSI1PK: 'PROFILE', GSI1SK: 'user-1' },
          };
        }
        return { Items: [{ GSI1PK: 'PROFILE', GSI1SK: 'user-2' }] };
      });
      const repo = new DynamoDBProfileRepository(client as never, tableName, () => now);

      const result = await repo.listAllUserIds();

      expect(callCount).toBe(2);
      expect(result).toEqual(['user-1', 'user-2']);
    });

    it('Items が空のとき空配列を返す', async () => {
      const client = makeClient(async () => ({ Items: [] }));
      const repo = new DynamoDBProfileRepository(client as never, tableName, () => now);
      expect(await repo.listAllUserIds()).toEqual([]);
    });

    it('GSI1SK が文字列でない or 空のアイテムを無視する', async () => {
      const client = makeClient(async () => ({
        Items: [
          { GSI1PK: 'PROFILE', GSI1SK: '' },
          { GSI1PK: 'PROFILE', GSI1SK: 123 },
          { GSI1PK: 'PROFILE', GSI1SK: 'valid-user' },
        ],
      }));
      const repo = new DynamoDBProfileRepository(client as never, tableName, () => now);
      expect(await repo.listAllUserIds()).toEqual(['valid-user']);
    });

    it('エラーは DatabaseError でラップされる', async () => {
      const client = makeClient(async () => {
        throw new Error('QueryCommand 失敗');
      });
      const repo = new DynamoDBProfileRepository(client as never, tableName, () => now);
      await expect(repo.listAllUserIds()).rejects.toBeInstanceOf(DatabaseError);
    });
  });
});
