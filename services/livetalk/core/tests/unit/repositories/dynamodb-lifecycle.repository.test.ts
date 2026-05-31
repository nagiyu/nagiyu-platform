import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { DatabaseError } from '@nagiyu/aws';
import { DynamoDBLifecycleRepository } from '../../../src/repositories/dynamodb-lifecycle.repository.js';

type SendHandler = (command: unknown) => Promise<unknown>;
const makeClient = (handler: SendHandler) => ({ send: handler });

describe('DynamoDBLifecycleRepository', () => {
  const tableName = 'nagiyu-livetalk-dev';
  const now = 1_700_000_000_000;

  it('nowMs を省略した場合は Date.now が使われる', async () => {
    const client = makeClient(async (cmd) => {
      if (cmd instanceof GetCommand) return { Item: undefined };
      return {};
    });
    const repo = new DynamoDBLifecycleRepository(client as never, tableName);
    const before = Date.now();
    const result = await repo.upsert({
      UserID: 'u1',
      CharacterID: 'hiyori',
      Bedtime: '01:30',
      WakeUpTime: '09:30',
    });
    expect(result.CreatedAt).toBeGreaterThanOrEqual(before);
  });

  it('get は未登録時 null を返す', async () => {
    const client = makeClient(async () => ({ Item: undefined }));
    const repo = new DynamoDBLifecycleRepository(client as never, tableName, () => now);
    expect(await repo.get({ userId: 'u1', characterId: 'hiyori' })).toBeNull();
  });

  it('get のエラーは DatabaseError でラップする', async () => {
    const client = makeClient(async () => {
      throw new Error('boom');
    });
    const repo = new DynamoDBLifecycleRepository(client as never, tableName, () => now);
    await expect(repo.get({ userId: 'u1', characterId: 'hiyori' })).rejects.toBeInstanceOf(
      DatabaseError
    );
  });

  it('get の Error 以外の例外も DatabaseError でラップする', async () => {
    const client = makeClient(async () => {
      throw 'string error';
    });
    const repo = new DynamoDBLifecycleRepository(client as never, tableName, () => now);
    await expect(repo.get({ userId: 'u1', characterId: 'hiyori' })).rejects.toBeInstanceOf(
      DatabaseError
    );
  });

  it('upsert 初回は CreatedAt=now で PutCommand を送る', async () => {
    const sent: unknown[] = [];
    const client = makeClient(async (cmd) => {
      sent.push(cmd);
      if (cmd instanceof GetCommand) return { Item: undefined };
      return {};
    });
    const repo = new DynamoDBLifecycleRepository(client as never, tableName, () => now);
    const result = await repo.upsert({
      UserID: 'u1',
      CharacterID: 'hiyori',
      Bedtime: '01:30',
      WakeUpTime: '09:30',
    });
    const put = (sent[1] as PutCommand).input;
    expect(put.Item?.PK).toBe('USER#u1');
    expect(put.Item?.SK).toBe('CHAR#hiyori#LIFECYCLE');
    expect(put.Item?.Bedtime).toBe('01:30');
    expect(put.Item?.WakeUpTime).toBe('09:30');
    expect(result.CreatedAt).toBe(now);
  });

  it('既存があれば CreatedAt は既存値を保持する', async () => {
    const existing = {
      PK: 'USER#u1',
      SK: 'CHAR#hiyori#LIFECYCLE',
      Type: 'Lifecycle',
      UserID: 'u1',
      CharacterID: 'hiyori',
      Bedtime: '01:30',
      WakeUpTime: '09:30',
      CreatedAt: 1_600_000_000_000,
      UpdatedAt: now - 5000,
    };
    const client = makeClient(async (cmd) => {
      if (cmd instanceof GetCommand) return { Item: existing };
      return {};
    });
    const repo = new DynamoDBLifecycleRepository(client as never, tableName, () => now);
    const result = await repo.upsert(
      { UserID: 'u1', CharacterID: 'hiyori', Bedtime: '02:00', WakeUpTime: '10:00' },
      { Bedtime: '02:00', WakeUpTime: '10:00' }
    );
    expect(result.CreatedAt).toBe(1_600_000_000_000);
    expect(result.UpdatedAt).toBe(now);
    expect(result.Bedtime).toBe('02:00');
  });

  it('upsert の Put エラーは DatabaseError でラップする', async () => {
    const client = makeClient(async (cmd) => {
      if (cmd instanceof GetCommand) return { Item: undefined };
      throw new Error('put failure');
    });
    const repo = new DynamoDBLifecycleRepository(client as never, tableName, () => now);
    await expect(
      repo.upsert({ UserID: 'u1', CharacterID: 'hiyori', Bedtime: '01:30', WakeUpTime: '09:30' })
    ).rejects.toBeInstanceOf(DatabaseError);
  });
});
