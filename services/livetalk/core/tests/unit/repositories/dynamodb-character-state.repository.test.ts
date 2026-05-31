import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { DatabaseError } from '@nagiyu/aws';
import { DynamoDBCharacterStateRepository } from '../../../src/repositories/dynamodb-character-state.repository.js';

type SendHandler = (command: unknown) => Promise<unknown>;
const makeClient = (handler: SendHandler) => ({ send: handler });

describe('DynamoDBCharacterStateRepository', () => {
  const tableName = 'nagiyu-livetalk-dev';
  const now = 1_700_000_000_000;

  it('nowMs を省略した場合は Date.now が使われる', async () => {
    const client = makeClient(async (cmd) => {
      if (cmd instanceof GetCommand) return { Item: undefined };
      return {};
    });
    const repo = new DynamoDBCharacterStateRepository(client as never, tableName);
    const before = Date.now();
    const result = await repo.upsert({
      UserID: 'u1',
      CharacterID: 'hiyori',
      LastInteractionAt: Date.now(),
    });
    expect(result.CreatedAt).toBeGreaterThanOrEqual(before);
  });

  it('Error 以外の例外も DatabaseError でラップする', async () => {
    const client = makeClient(async () => {
      throw 'string error';
    });
    const repo = new DynamoDBCharacterStateRepository(client as never, tableName, () => now);
    await expect(repo.getById({ userId: 'u1', characterId: 'hiyori' })).rejects.toBeInstanceOf(
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
    const repo = new DynamoDBCharacterStateRepository(client as never, tableName, () => now);
    const result = await repo.upsert({
      UserID: 'u1',
      CharacterID: 'hiyori',
      LastInteractionAt: now,
    });
    const put = (sent[1] as PutCommand).input;
    expect(put.Item?.PK).toBe('USER#u1');
    expect(put.Item?.SK).toBe('CHAR#hiyori#STATE');
    expect(put.Item?.LastInteractionAt).toBe(now);
    // AffectionLevel は Phase 3f から保持（省略時は 0）
    expect(put.Item?.AffectionLevel).toBe(0);
    // Onboarded など未定義フィールドは書き出さない
    expect(put.Item?.Onboarded).toBeUndefined();
    expect(result.CreatedAt).toBe(now);
  });

  it('既存があれば CreatedAt は既存値を保持し、LastInteractionAt 差分を反映する', async () => {
    const existing = {
      PK: 'USER#u1',
      SK: 'CHAR#hiyori#STATE',
      Type: 'CharacterState',
      UserID: 'u1',
      CharacterID: 'hiyori',
      LastInteractionAt: now - 5000,
      CreatedAt: 1_600_000_000_000,
      UpdatedAt: now - 5000,
    };
    const client = makeClient(async (cmd) => {
      if (cmd instanceof GetCommand) return { Item: existing };
      return {};
    });
    const repo = new DynamoDBCharacterStateRepository(client as never, tableName, () => now);
    const result = await repo.upsert(
      {
        UserID: 'u1',
        CharacterID: 'hiyori',
        LastInteractionAt: now,
      },
      { LastInteractionAt: now }
    );
    expect(result.LastInteractionAt).toBe(now);
    expect(result.CreatedAt).toBe(1_600_000_000_000);
    expect(result.UpdatedAt).toBe(now);
  });

  it('getById は未登録時 null', async () => {
    const client = makeClient(async () => ({ Item: undefined }));
    const repo = new DynamoDBCharacterStateRepository(client as never, tableName, () => now);
    expect(await repo.getById({ userId: 'u1', characterId: 'hiyori' })).toBeNull();
  });

  it('getById エラーは DatabaseError でラップ', async () => {
    const client = makeClient(async () => {
      throw new Error('boom');
    });
    const repo = new DynamoDBCharacterStateRepository(client as never, tableName, () => now);
    await expect(repo.getById({ userId: 'u1', characterId: 'hiyori' })).rejects.toBeInstanceOf(
      DatabaseError
    );
  });

  it('upsert の Put エラーは DatabaseError でラップ', async () => {
    const client = makeClient(async (cmd) => {
      if (cmd instanceof GetCommand) return { Item: undefined };
      throw new Error('put failure');
    });
    const repo = new DynamoDBCharacterStateRepository(client as never, tableName, () => now);
    await expect(
      repo.upsert({ UserID: 'u1', CharacterID: 'hiyori', LastInteractionAt: now })
    ).rejects.toBeInstanceOf(DatabaseError);
  });
});
