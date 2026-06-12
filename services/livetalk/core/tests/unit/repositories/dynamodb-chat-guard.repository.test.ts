/**
 * DynamoDBChatGuardRepository のユニットテスト（Issue #3528）。
 *
 * DynamoDB クライアントをモックし、送信コマンドの内容と動作を検証する。
 *
 * テスト観点:
 * - incrementRateLimit: UpdateCommand の内容、加算後の count 返却
 * - incrementRateLimit: DynamoDB エラーを DatabaseError にラップする
 * - acquireLock: 新規取得時の UpdateCommand（条件式付き）
 * - acquireLock: ConditionalCheckFailedException で acquired=false を返す
 * - acquireLock: DynamoDB エラーを DatabaseError にラップする
 * - releaseLock: ownerToken 一致時の DeleteCommand
 * - releaseLock: ConditionalCheckFailedException を握りつぶす
 * - releaseLock: DynamoDB エラー（ConditionalCheck 以外）もフェイルオープンで握りつぶす
 * - computeBucket / computeWindowTtlSec の純粋ロジック
 */

import { DeleteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DatabaseError } from '@nagiyu/aws';
import {
  DynamoDBChatGuardRepository,
  computeBucket,
  computeWindowTtlSec,
} from '../../../src/repositories/dynamodb-chat-guard.repository.js';

type SendHandler = (command: unknown) => Promise<unknown>;
const makeClient = (handler: SendHandler) => ({ send: handler });

const fixedNow = 1_705_312_200_000;
const tableName = 'nagiyu-livetalk-dev';

describe('computeBucket()', () => {
  it('1m: エポック分を返す', () => {
    expect(computeBucket('1m', fixedNow)).toBe(String(Math.floor(fixedNow / 60_000)));
  });

  it('1h: エポック時を返す', () => {
    expect(computeBucket('1h', fixedNow)).toBe(String(Math.floor(fixedNow / 3_600_000)));
  });
});

describe('computeWindowTtlSec()', () => {
  it('1m: 次分開始 + 120s バッファを返す', () => {
    const expected = (Math.floor(fixedNow / 60_000) + 1) * 60 + 120;
    expect(computeWindowTtlSec('1m', fixedNow)).toBe(expected);
  });

  it('1h: 次時間開始 + 7200s バッファを返す', () => {
    const expected = (Math.floor(fixedNow / 3_600_000) + 1) * 3_600 + 7_200;
    expect(computeWindowTtlSec('1h', fixedNow)).toBe(expected);
  });
});

describe('DynamoDBChatGuardRepository - incrementRateLimit()', () => {
  it('UpdateCommand を正しいキーと式で送信する', async () => {
    const sent: unknown[] = [];
    const client = makeClient(async (cmd) => {
      sent.push(cmd);
      return { Attributes: { Count: 1 } };
    });
    const repo = new DynamoDBChatGuardRepository(client as never, tableName, () => fixedNow);
    const result = await repo.incrementRateLimit('u1', '1m', fixedNow);

    expect(sent[0]).toBeInstanceOf(UpdateCommand);
    const input = (sent[0] as UpdateCommand).input;
    expect(input.TableName).toBe(tableName);
    expect(input.Key?.PK).toBe('USER#u1');

    const expectedBucket = computeBucket('1m', fixedNow);
    expect(input.Key?.SK).toBe(`RATELIMIT#1m#${expectedBucket}`);
    expect(input.UpdateExpression).toContain('ADD #cnt :one');
    expect(input.UpdateExpression).toContain('if_not_exists(#ttl, :ttl)');
    expect(input.ReturnValues).toBe('UPDATED_NEW');
    expect(result.count).toBe(1);
    expect(result.window).toBe('1m');
  });

  it('DynamoDB から返された Count を count として返す', async () => {
    const client = makeClient(async () => ({ Attributes: { Count: 5 } }));
    const repo = new DynamoDBChatGuardRepository(client as never, tableName, () => fixedNow);
    const result = await repo.incrementRateLimit('u1', '1h', fixedNow);
    expect(result.count).toBe(5);
    expect(result.window).toBe('1h');
  });

  it('Attributes が空の場合は count=1 を返す', async () => {
    const client = makeClient(async () => ({ Attributes: {} }));
    const repo = new DynamoDBChatGuardRepository(client as never, tableName, () => fixedNow);
    const result = await repo.incrementRateLimit('u1', '1m', fixedNow);
    expect(result.count).toBe(1);
  });

  it('DynamoDB エラーを DatabaseError にラップする', async () => {
    const client = makeClient(async () => {
      throw new Error('DynamoDB 接続エラー');
    });
    const repo = new DynamoDBChatGuardRepository(client as never, tableName, () => fixedNow);
    await expect(repo.incrementRateLimit('u1', '1m', fixedNow)).rejects.toBeInstanceOf(
      DatabaseError
    );
  });

  it('TTL はバッファ込みの値が設定される', async () => {
    const sent: unknown[] = [];
    const client = makeClient(async (cmd) => {
      sent.push(cmd);
      return { Attributes: { Count: 1 } };
    });
    const repo = new DynamoDBChatGuardRepository(client as never, tableName, () => fixedNow);
    await repo.incrementRateLimit('u1', '1m', fixedNow);
    const input = (sent[0] as UpdateCommand).input;
    const expectedTtl = computeWindowTtlSec('1m', fixedNow);
    expect(input.ExpressionAttributeValues?.[':ttl']).toBe(expectedTtl);
  });
});

describe('DynamoDBChatGuardRepository - acquireLock()', () => {
  it('UpdateCommand を条件式付きで送信する', async () => {
    const sent: unknown[] = [];
    const client = makeClient(async (cmd) => {
      sent.push(cmd);
      return {};
    });
    const repo = new DynamoDBChatGuardRepository(client as never, tableName, () => fixedNow);
    const result = await repo.acquireLock('u1', 'token-abc', 120_000, fixedNow);

    expect(sent[0]).toBeInstanceOf(UpdateCommand);
    const input = (sent[0] as UpdateCommand).input;
    expect(input.TableName).toBe(tableName);
    expect(input.Key?.PK).toBe('USER#u1');
    expect(input.Key?.SK).toBe('CHATLOCK');
    expect(input.ConditionExpression).toContain('attribute_not_exists(SK)');
    expect(input.ConditionExpression).toContain('ExpiresAt < :now');
    expect(input.ExpressionAttributeValues?.[':token']).toBe('token-abc');
    expect(input.ExpressionAttributeValues?.[':expiresAt']).toBe(fixedNow + 120_000);
    expect(input.ExpressionAttributeValues?.[':now']).toBe(fixedNow);
    expect(result.acquired).toBe(true);
    expect(result.ownerToken).toBe('token-abc');
  });

  it('ConditionalCheckFailedException で acquired=false を返す', async () => {
    const client = makeClient(async () => {
      const err = Object.assign(new Error('ConditionalCheckFailed'), {
        name: 'ConditionalCheckFailedException',
      });
      throw err;
    });
    const repo = new DynamoDBChatGuardRepository(client as never, tableName, () => fixedNow);
    const result = await repo.acquireLock('u1', 'token-abc', 120_000, fixedNow);
    expect(result.acquired).toBe(false);
    expect(result.ownerToken).toBeUndefined();
  });

  it('DynamoDB エラー（ConditionalCheck 以外）を DatabaseError にラップする', async () => {
    const client = makeClient(async () => {
      throw new Error('プロビジョニングエラー');
    });
    const repo = new DynamoDBChatGuardRepository(client as never, tableName, () => fixedNow);
    await expect(repo.acquireLock('u1', 'token-abc', 120_000, fixedNow)).rejects.toBeInstanceOf(
      DatabaseError
    );
  });

  it('TTL は ExpiresAt / 1000 + バッファ', async () => {
    const sent: unknown[] = [];
    const client = makeClient(async (cmd) => {
      sent.push(cmd);
      return {};
    });
    const repo = new DynamoDBChatGuardRepository(client as never, tableName, () => fixedNow);
    await repo.acquireLock('u1', 'token-abc', 120_000, fixedNow);
    const input = (sent[0] as UpdateCommand).input;
    const expectedTtl = Math.floor((fixedNow + 120_000) / 1000) + 300;
    expect(input.ExpressionAttributeValues?.[':ttl']).toBe(expectedTtl);
  });
});

describe('DynamoDBChatGuardRepository - releaseLock()', () => {
  it('ownerToken 一致時に DeleteCommand を送信する', async () => {
    const sent: unknown[] = [];
    const client = makeClient(async (cmd) => {
      sent.push(cmd);
      return {};
    });
    const repo = new DynamoDBChatGuardRepository(client as never, tableName, () => fixedNow);
    await repo.releaseLock('u1', 'token-abc');

    expect(sent[0]).toBeInstanceOf(DeleteCommand);
    const input = (sent[0] as DeleteCommand).input;
    expect(input.TableName).toBe(tableName);
    expect(input.Key?.PK).toBe('USER#u1');
    expect(input.Key?.SK).toBe('CHATLOCK');
    expect(input.ConditionExpression).toBe('OwnerToken = :token');
    expect(input.ExpressionAttributeValues?.[':token']).toBe('token-abc');
  });

  it('ConditionalCheckFailedException（ownerToken 不一致）は握りつぶす', async () => {
    const client = makeClient(async () => {
      const err = Object.assign(new Error('ConditionalCheckFailed'), {
        name: 'ConditionalCheckFailedException',
      });
      throw err;
    });
    const repo = new DynamoDBChatGuardRepository(client as never, tableName, () => fixedNow);
    // エラーにならず正常終了すること
    await expect(repo.releaseLock('u1', 'token-abc')).resolves.toBeUndefined();
  });

  it('DynamoDB エラー（ConditionalCheck 以外）はフェイルオープンで握りつぶす', async () => {
    const client = makeClient(async () => {
      throw new Error('削除エラー');
    });
    const repo = new DynamoDBChatGuardRepository(client as never, tableName, () => fixedNow);
    // フェイルオープン: エラーを throw せず正常終了する
    await expect(repo.releaseLock('u1', 'token-abc')).resolves.toBeUndefined();
  });
});
