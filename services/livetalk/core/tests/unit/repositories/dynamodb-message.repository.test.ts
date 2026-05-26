import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { DatabaseError, EntityAlreadyExistsError } from '@nagiyu/aws';
import { DynamoDBMessageRepository } from '../../../src/repositories/dynamodb-message.repository.js';
import { MESSAGE_TTL_SECONDS } from '../../../src/constants.js';
import type { TokenCounter } from '../../../src/lib/token-counter.js';

const fixedCounter: TokenCounter = {
  countTokens: (t) => t.length,
  countTokensForMessage: (t) => t.length,
};

type SendHandler = (command: unknown) => Promise<unknown>;

const makeClient = (handler: SendHandler) => ({ send: handler });

describe('DynamoDBMessageRepository', () => {
  const tableName = 'nagiyu-livetalk-dev';
  const now = 1_700_000_000_000;
  const ulidFactory = () => 'ULID-FIXED';

  it('create は PutCommand を attribute_not_exists(PK) 条件で送り、TTL を 90 日後に設定する', async () => {
    const sent: unknown[] = [];
    const client = makeClient(async (cmd) => {
      sent.push(cmd);
      return {};
    });
    const repo = new DynamoDBMessageRepository(client as never, tableName, ulidFactory, () => now);

    const entity = await repo.create({
      UserID: 'u1',
      CharacterID: 'hiyori',
      Role: 'user',
      Text: 'hello',
    });

    expect(entity.MessageID).toBe('ULID-FIXED');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toBeInstanceOf(PutCommand);
    const input = (sent[0] as PutCommand).input;
    expect(input.TableName).toBe(tableName);
    expect(input.ConditionExpression).toBe('attribute_not_exists(PK)');
    expect(input.Item?.PK).toBe('USER#u1');
    expect(input.Item?.SK).toBe('CHAR#hiyori#MSG#ULID-FIXED');
    expect(input.Item?.Type).toBe('Message');
    expect(input.Item?.TTL).toBe(Math.floor(now / 1000) + MESSAGE_TTL_SECONDS);
  });

  it('create は明示指定された MessageID を尊重する', async () => {
    const client = makeClient(async () => ({}));
    const repo = new DynamoDBMessageRepository(client as never, tableName, ulidFactory, () => now);
    const entity = await repo.create({
      UserID: 'u1',
      CharacterID: 'hiyori',
      Role: 'assistant',
      Text: 'hi',
      MessageID: 'manual-id',
    });
    expect(entity.MessageID).toBe('manual-id');
  });

  it('create は ConditionalCheckFailedException を EntityAlreadyExistsError に変換する', async () => {
    const conditionError = new Error('conditional');
    conditionError.name = 'ConditionalCheckFailedException';
    const client = makeClient(async () => {
      throw conditionError;
    });
    const repo = new DynamoDBMessageRepository(client as never, tableName, ulidFactory, () => now);
    await expect(
      repo.create({ UserID: 'u1', CharacterID: 'hiyori', Role: 'user', Text: 'x' })
    ).rejects.toBeInstanceOf(EntityAlreadyExistsError);
  });

  it('create のその他エラーは DatabaseError でラップ', async () => {
    const client = makeClient(async () => {
      throw new Error('boom');
    });
    const repo = new DynamoDBMessageRepository(client as never, tableName, ulidFactory, () => now);
    await expect(
      repo.create({ UserID: 'u1', CharacterID: 'hiyori', Role: 'user', Text: 'x' })
    ).rejects.toBeInstanceOf(DatabaseError);
  });

  it('getById は GetCommand を送り、見つからなければ null', async () => {
    const sent: unknown[] = [];
    const client = makeClient(async (cmd) => {
      sent.push(cmd);
      return { Item: undefined };
    });
    const repo = new DynamoDBMessageRepository(client as never, tableName, ulidFactory, () => now);
    const result = await repo.getById({
      userId: 'u1',
      characterId: 'hiyori',
      messageId: 'm1',
    });
    expect(result).toBeNull();
    expect(sent[0]).toBeInstanceOf(GetCommand);
    const input = (sent[0] as GetCommand).input;
    expect(input.Key).toEqual({
      PK: 'USER#u1',
      SK: 'CHAR#hiyori#MSG#m1',
    });
  });

  it('getById は Item があれば Entity を返す', async () => {
    const item = {
      PK: 'USER#u1',
      SK: 'CHAR#hiyori#MSG#m1',
      Type: 'Message',
      UserID: 'u1',
      CharacterID: 'hiyori',
      MessageID: 'm1',
      Role: 'user',
      Text: 'hello',
      CreatedAt: now,
      UpdatedAt: now,
    };
    const client = makeClient(async () => ({ Item: item }));
    const repo = new DynamoDBMessageRepository(client as never, tableName, ulidFactory, () => now);
    const result = await repo.getById({
      userId: 'u1',
      characterId: 'hiyori',
      messageId: 'm1',
    });
    expect(result?.Text).toBe('hello');
  });

  describe('getRecentByTokenBudget', () => {
    const baseItem = (id: string, text: string) => ({
      PK: 'USER#u1',
      SK: `CHAR#hiyori#MSG#${id}`,
      Type: 'Message',
      UserID: 'u1',
      CharacterID: 'hiyori',
      MessageID: id,
      Role: 'user',
      Text: text,
      CreatedAt: now,
      UpdatedAt: now,
    });

    it('ScanIndexForward=false で QueryCommand を投げ、結果を昇順に並べ替える', async () => {
      const sent: unknown[] = [];
      const client = makeClient(async (cmd) => {
        sent.push(cmd);
        // 新しい順（降順）に返す
        return {
          Items: [baseItem('m3', 'cc'), baseItem('m2', 'bb'), baseItem('m1', 'aa')],
        };
      });
      const repo = new DynamoDBMessageRepository(
        client as never,
        tableName,
        ulidFactory,
        () => now
      );

      const result = await repo.getRecentByTokenBudget({
        userId: 'u1',
        characterId: 'hiyori',
        tokenCounter: fixedCounter,
        tokenLimit: 100,
      });

      expect(sent[0]).toBeInstanceOf(QueryCommand);
      const input = (sent[0] as QueryCommand).input;
      expect(input.ScanIndexForward).toBe(false);
      expect(input.KeyConditionExpression).toContain('begins_with');
      expect(input.ExpressionAttributeValues?.[':pk']).toBe('USER#u1');
      expect(input.ExpressionAttributeValues?.[':prefix']).toBe('CHAR#hiyori#MSG#');

      // 返却順は昇順
      expect(result.messages.map((m) => m.MessageID)).toEqual(['m1', 'm2', 'm3']);
      expect(result.totalTokens).toBe(6);
      expect(result.truncated).toBe(false);
    });

    it('LastEvaluatedKey がある間はページング継続する', async () => {
      let call = 0;
      const client = makeClient(async () => {
        call++;
        if (call === 1) {
          return {
            Items: [baseItem('m2', 'b')],
            LastEvaluatedKey: { PK: 'x', SK: 'y' },
          };
        }
        return { Items: [baseItem('m1', 'a')] };
      });
      const repo = new DynamoDBMessageRepository(
        client as never,
        tableName,
        ulidFactory,
        () => now
      );
      const result = await repo.getRecentByTokenBudget({
        userId: 'u1',
        characterId: 'hiyori',
        tokenCounter: fixedCounter,
        tokenLimit: 100,
      });
      expect(call).toBe(2);
      expect(result.messages.map((m) => m.MessageID)).toEqual(['m1', 'm2']);
      expect(result.truncated).toBe(false);
    });

    it('トークン上限超過で打ち切り、truncated=true', async () => {
      const client = makeClient(async () => ({
        Items: [
          baseItem('m4', 'd'), // 1
          baseItem('m3', 'cc'), // 2 → これ以上はカット
          baseItem('m2', 'bbb'),
          baseItem('m1', 'aaaa'),
        ],
      }));
      const repo = new DynamoDBMessageRepository(
        client as never,
        tableName,
        ulidFactory,
        () => now
      );
      const result = await repo.getRecentByTokenBudget({
        userId: 'u1',
        characterId: 'hiyori',
        tokenCounter: fixedCounter,
        tokenLimit: 3,
      });
      // d(1) + cc(2) = 3 で次の bbb(3) は超過
      expect(result.messages.map((m) => m.MessageID)).toEqual(['m3', 'm4']);
      expect(result.totalTokens).toBe(3);
      expect(result.truncated).toBe(true);
    });

    it('壊れた item はログ警告でスキップして処理を続行する', async () => {
      const broken = { ...baseItem('m1', 'ok'), Role: 'invalid' };
      const client = makeClient(async () => ({
        Items: [baseItem('m2', 'ok'), broken],
      }));
      const repo = new DynamoDBMessageRepository(
        client as never,
        tableName,
        ulidFactory,
        () => now
      );
      const result = await repo.getRecentByTokenBudget({
        userId: 'u1',
        characterId: 'hiyori',
        tokenCounter: fixedCounter,
        tokenLimit: 100,
      });
      expect(result.messages.map((m) => m.MessageID)).toEqual(['m2']);
    });

    it('DynamoDB エラーは DatabaseError でラップ', async () => {
      const client = makeClient(async () => {
        throw new Error('throttling');
      });
      const repo = new DynamoDBMessageRepository(
        client as never,
        tableName,
        ulidFactory,
        () => now
      );
      await expect(
        repo.getRecentByTokenBudget({
          userId: 'u1',
          characterId: 'hiyori',
          tokenCounter: fixedCounter,
        })
      ).rejects.toBeInstanceOf(DatabaseError);
    });
  });
});
