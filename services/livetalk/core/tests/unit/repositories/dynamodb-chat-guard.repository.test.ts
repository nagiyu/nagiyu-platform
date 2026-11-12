/**
 * DynamoDBChatGuardRepository のユニットテスト（Issue #3528）。
 *
 * DynamoDB クライアントをモックし、送信コマンドの内容と動作を検証する。
 *
 * テスト観点:
 * - tryConsumeRateLimit: UpdateCommand の内容、窓ごとの断り、1 分の戻し、戻し失敗の報告
 * - tryConsumeRateLimit: DynamoDB エラーを DatabaseError にラップする
 * - acquireLock: 新規取得時の UpdateCommand（条件式付き）
 * - acquireLock: ConditionalCheckFailedException で acquired=false を返す
 * - acquireLock: DynamoDB エラーを DatabaseError にラップする
 * - releaseLock: ownerToken 一致時の DeleteCommand
 * - releaseLock: ConditionalCheckFailedException を握りつぶす
 * - releaseLock: DynamoDB エラー（ConditionalCheck 以外）もフェイルオープンで握りつぶす
 */

import { DeleteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DatabaseError } from '@nagiyu/aws';
import { CHAT_RATE_LIMIT_ERROR_MESSAGES } from '../../../src/repositories/chat-guard-counting.js';
import { DynamoDBChatGuardRepository } from '../../../src/repositories/dynamodb-chat-guard.repository.js';

const mockReport = jest.fn().mockResolvedValue(null);
jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  createErrorReporter: () => ({ report: (...args: unknown[]) => mockReport(...args) }),
}));

type SendHandler = (command: unknown) => Promise<unknown>;
const makeClient = (handler: SendHandler) => ({ send: handler });

const fixedNow = 1_705_312_200_000;
const tableName = 'nagiyu-livetalk-dev';
const limits = { perMinute: 10, perHour: 100 };
const minuteBucket = String(Math.floor(fixedNow / 60_000));
const hourBucket = String(Math.floor(fixedNow / 3_600_000));

const conditionFailed = () =>
  Object.assign(new Error('条件不一致'), { name: 'ConditionalCheckFailedException' });

describe('DynamoDBChatGuardRepository - tryConsumeRateLimit()', () => {
  beforeEach(() => {
    mockReport.mockClear();
  });

  it('1 分 → 1 時間の順に、正しいキー・属性・TTL・上限で UpdateCommand を送信する', async () => {
    const send = jest.fn().mockResolvedValue({});
    const repo = new DynamoDBChatGuardRepository({ send } as never, tableName, () => fixedNow);

    expect(await repo.tryConsumeRateLimit('u1', fixedNow, limits)).toEqual({ allowed: true });

    expect(send).toHaveBeenCalledTimes(2);
    const minute = (send.mock.calls[0][0] as UpdateCommand).input;
    expect(send.mock.calls[0][0]).toBeInstanceOf(UpdateCommand);
    expect(minute.TableName).toBe(tableName);
    expect(minute.Key).toEqual({ PK: 'USER#u1', SK: `RATELIMIT#1m#${minuteBucket}` });
    expect(minute.ExpressionAttributeNames).toEqual({
      '#cnt': 'Count',
      '#ttl': 'TTL',
      '#type': 'Type',
    });
    expect(minute.ExpressionAttributeValues).toMatchObject({
      ':limit': 10,
      ':type': 'ChatRateLimit',
      ':ttl': (Math.floor(fixedNow / 60_000) + 1) * 60 + 120,
    });

    const hour = (send.mock.calls[1][0] as UpdateCommand).input;
    expect(hour.Key).toEqual({ PK: 'USER#u1', SK: `RATELIMIT#1h#${hourBucket}` });
    expect(hour.ExpressionAttributeValues).toMatchObject({
      ':limit': 100,
      ':ttl': (Math.floor(fixedNow / 3_600_000) + 1) * 3_600 + 7_200,
    });
  });

  it('1 分の窓で断られたら 1 時間には触れない', async () => {
    const send = jest.fn().mockRejectedValue(conditionFailed());
    const repo = new DynamoDBChatGuardRepository({ send } as never, tableName, () => fixedNow);

    expect(await repo.tryConsumeRateLimit('u1', fixedNow, limits)).toEqual({
      allowed: false,
      window: '1m',
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('1 時間の窓で断られたら 1 分を戻す', async () => {
    const send = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(conditionFailed())
      .mockResolvedValueOnce({});
    const repo = new DynamoDBChatGuardRepository({ send } as never, tableName, () => fixedNow);

    expect(await repo.tryConsumeRateLimit('u1', fixedNow, limits)).toEqual({
      allowed: false,
      window: '1h',
    });
    const rollback = (send.mock.calls[2][0] as UpdateCommand).input;
    expect(rollback.Key).toEqual({ PK: 'USER#u1', SK: `RATELIMIT#1m#${minuteBucket}` });
    expect(rollback.ExpressionAttributeValues).toMatchObject({ ':minusOne': -1 });
  });

  it('戻しに失敗しても断り、エラーイベントに warning で報告する', async () => {
    const send = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(conditionFailed())
      .mockRejectedValueOnce(new Error('戻し失敗'));
    const repo = new DynamoDBChatGuardRepository({ send } as never, tableName, () => fixedNow);

    expect(await repo.tryConsumeRateLimit('u1', fixedNow, limits)).toEqual({
      allowed: false,
      window: '1h',
    });
    expect(mockReport).toHaveBeenCalledWith(
      CHAT_RATE_LIMIT_ERROR_MESSAGES.ROLLBACK_FAILED,
      expect.any(DatabaseError),
      { context: { sk: `RATELIMIT#1m#${minuteBucket}` }, severity: 'warning' }
    );
  });

  it('DynamoDB の障害は DatabaseError として投げる', async () => {
    const send = jest.fn().mockRejectedValue(new Error('DynamoDB 接続エラー'));
    const repo = new DynamoDBChatGuardRepository({ send } as never, tableName, () => fixedNow);

    await expect(repo.tryConsumeRateLimit('u1', fixedNow, limits)).rejects.toBeInstanceOf(
      DatabaseError
    );
  });

  it('1 時間の加算が障害なら、1 分を戻して DatabaseError を投げる', async () => {
    const send = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('DynamoDB 接続エラー'))
      .mockResolvedValueOnce({});
    const repo = new DynamoDBChatGuardRepository({ send } as never, tableName, () => fixedNow);

    await expect(repo.tryConsumeRateLimit('u1', fixedNow, limits)).rejects.toBeInstanceOf(
      DatabaseError
    );
    const rollback = (send.mock.calls[2][0] as UpdateCommand).input;
    expect(rollback.Key).toEqual({ PK: 'USER#u1', SK: `RATELIMIT#1m#${minuteBucket}` });
    expect(rollback.ExpressionAttributeValues).toMatchObject({ ':minusOne': -1 });
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
