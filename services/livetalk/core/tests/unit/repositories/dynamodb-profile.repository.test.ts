import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { DatabaseError } from '@nagiyu/aws';
import { DynamoDBProfileRepository } from '../../../src/repositories/dynamodb-profile.repository.js';

type SendHandler = (command: unknown) => Promise<unknown>;
const makeClient = (handler: SendHandler) => ({ send: handler });

describe('DynamoDBProfileRepository', () => {
  const tableName = 'nagiyu-livetalk-dev';
  const now = 1_700_000_000_000;

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
});
