import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { InMemorySingleTableStore } from '@nagiyu/aws';
import { DynamoDBUsageRepository } from '../../../src/repositories/dynamodb-usage.repository.js';
import { InMemoryUsageRepository } from '../../../src/repositories/in-memory-usage.repository.js';
import type { UsageRepository } from '../../../src/repositories/usage.repository.interface.js';

const conditionalCheckFailed = (): Error => {
  const error = new Error('Conditional check failed');
  error.name = 'ConditionalCheckFailedException';
  return error;
};

describe('InMemoryUsageRepository', () => {
  let repository: UsageRepository;

  beforeEach(() => {
    repository = new InMemoryUsageRepository(new InMemorySingleTableStore());
  });

  const base = { subject: 'USER#u1', month: '202611', ttlSec: 1000 };

  it('上限に達するまで数え、達したら数えない', async () => {
    expect(await repository.tryConsume({ ...base, kind: 'ai', limit: 2 })).toBe(true);
    expect(await repository.tryConsume({ ...base, kind: 'ai', limit: 2 })).toBe(true);
    expect(await repository.tryConsume({ ...base, kind: 'ai', limit: 2 })).toBe(false);
    expect(await repository.getCounts('USER#u1', '202611')).toEqual({ ai: 2, noAi: 0 });
  });

  it('上限 0 では最初の 1 回から数えない', async () => {
    expect(await repository.tryConsume({ ...base, kind: 'ai', limit: 0 })).toBe(false);
    expect(await repository.getCounts('USER#u1', '202611')).toEqual({ ai: 0, noAi: 0 });
  });

  it('AI あり・なしと月と主体は別々に数える', async () => {
    await repository.tryConsume({ ...base, kind: 'ai', limit: 5 });
    await repository.tryConsume({ ...base, kind: 'noAi', limit: 5 });
    await repository.tryConsume({ ...base, kind: 'noAi', limit: 5 });
    await repository.tryConsume({ ...base, month: '202612', kind: 'ai', limit: 5 });
    await repository.tryConsume({ ...base, subject: 'ANON#a', kind: 'ai', limit: 5 });

    expect(await repository.getCounts('USER#u1', '202611')).toEqual({ ai: 1, noAi: 2 });
    expect(await repository.getCounts('USER#u1', '202612')).toEqual({ ai: 1, noAi: 0 });
    expect(await repository.getCounts('ANON#a', '202611')).toEqual({ ai: 1, noAi: 0 });
  });

  it('同時に申し込まれても上限を超えない', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => repository.tryConsume({ ...base, kind: 'noAi', limit: 3 }))
    );

    expect(results.filter(Boolean)).toHaveLength(3);
  });

  it('戻すと 1 減り、0 未満にはならず、記録が無くても何も作らない', async () => {
    await repository.release({ subject: 'USER#none', month: '202611', kind: 'ai' });
    expect(await repository.getCounts('USER#none', '202611')).toEqual({ ai: 0, noAi: 0 });

    await repository.tryConsume({ ...base, kind: 'ai', limit: 5 });
    await repository.release({ subject: 'USER#u1', month: '202611', kind: 'ai' });
    await repository.release({ subject: 'USER#u1', month: '202611', kind: 'ai' });

    expect(await repository.getCounts('USER#u1', '202611')).toEqual({ ai: 0, noAi: 0 });
  });

  it('IP の数を上限まで数える', async () => {
    const input = { day: '20261105', ipHash: 'h1', limit: 2, ttlSec: 1000 };

    expect(await repository.tryConsumeIp(input)).toBe(true);
    expect(await repository.tryConsumeIp(input)).toBe(true);
    expect(await repository.tryConsumeIp(input)).toBe(false);
    expect(await repository.tryConsumeIp({ ...input, ipHash: 'h2' })).toBe(true);
    expect(await repository.tryConsumeIp({ ...input, limit: 0, ipHash: 'h3' })).toBe(false);
  });

  it('その日の塩は最初に作られたものを全員が受け取る', async () => {
    expect(await repository.getOrCreateDailySalt('20261105', 'salt-a', 1000)).toBe('salt-a');
    expect(await repository.getOrCreateDailySalt('20261105', 'salt-b', 1000)).toBe('salt-a');
    expect(await repository.getOrCreateDailySalt('20261106', 'salt-b', 1000)).toBe('salt-b');
  });
});

describe('DynamoDBUsageRepository', () => {
  let send: jest.Mock;
  let repository: DynamoDBUsageRepository;

  beforeEach(() => {
    send = jest.fn();
    repository = new DynamoDBUsageRepository(
      { send } as unknown as DynamoDBDocumentClient,
      'test-table'
    );
  });

  const base = { subject: 'USER#u1', month: '202611', ttlSec: 1000 };

  it('回数は条件付きの ADD で 1 回の更新にする', async () => {
    send.mockResolvedValue({});

    expect(await repository.tryConsume({ ...base, kind: 'ai', limit: 3 })).toBe(true);

    const command = send.mock.calls[0][0] as UpdateCommand;
    expect(command).toBeInstanceOf(UpdateCommand);
    expect(command.input).toMatchObject({
      TableName: 'test-table',
      Key: { PK: 'USAGE#USER#u1', SK: 'MONTH#202611' },
      ConditionExpression: 'attribute_not_exists(#cnt) OR #cnt < :limit',
      ExpressionAttributeNames: { '#cnt': 'AiCount', '#ttl': 'TTL' },
      ExpressionAttributeValues: { ':one': 1, ':ttl': 1000, ':limit': 3 },
    });
    expect(command.input.UpdateExpression).toContain('ADD #cnt :one');
    expect(command.input.UpdateExpression).toContain('if_not_exists(#ttl, :ttl)');
  });

  it('AI なしは別の属性で数える', async () => {
    send.mockResolvedValue({});

    await repository.tryConsume({ ...base, kind: 'noAi', limit: 3 });

    expect((send.mock.calls[0][0] as UpdateCommand).input.ExpressionAttributeNames).toMatchObject({
      '#cnt': 'NoAiCount',
    });
  });

  it('上限に達していれば false を返す', async () => {
    send.mockRejectedValue(conditionalCheckFailed());

    expect(await repository.tryConsume({ ...base, kind: 'ai', limit: 3 })).toBe(false);
  });

  it('上限 0 では DynamoDB を呼ばずに false を返す', async () => {
    expect(await repository.tryConsume({ ...base, kind: 'ai', limit: 0 })).toBe(false);
    expect(await repository.tryConsumeIp({ day: 'd', ipHash: 'h', limit: 0, ttlSec: 1 })).toBe(
      false
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('記録先の障害は例外として投げる', async () => {
    send.mockRejectedValue(new Error('boom'));

    await expect(repository.tryConsume({ ...base, kind: 'ai', limit: 3 })).rejects.toThrow();
    await expect(
      repository.tryConsumeIp({ day: 'd', ipHash: 'h', limit: 3, ttlSec: 1 })
    ).rejects.toThrow();
  });

  it('戻すときは 0 を超えているときだけ 1 減らす', async () => {
    send.mockResolvedValue({});

    await repository.release({ subject: 'USER#u1', month: '202611', kind: 'noAi' });

    const command = send.mock.calls[0][0] as UpdateCommand;
    expect(command.input).toMatchObject({
      Key: { PK: 'USAGE#USER#u1', SK: 'MONTH#202611' },
      UpdateExpression: 'ADD #cnt :minusOne',
      ConditionExpression: '#cnt > :zero',
      ExpressionAttributeNames: { '#cnt': 'NoAiCount' },
      ExpressionAttributeValues: { ':minusOne': -1, ':zero': 0 },
    });
  });

  it('戻す対象が 0 以下でも成功として扱い、障害は投げる', async () => {
    send.mockRejectedValueOnce(conditionalCheckFailed());
    await expect(
      repository.release({ subject: 'USER#u1', month: '202611', kind: 'ai' })
    ).resolves.toBeUndefined();

    send.mockRejectedValueOnce(new Error('boom'));
    await expect(
      repository.release({ subject: 'USER#u1', month: '202611', kind: 'ai' })
    ).rejects.toThrow();
  });

  it('回数を取得する。記録が無ければ 0', async () => {
    send.mockResolvedValueOnce({ Item: { AiCount: 2, NoAiCount: 5 } });
    expect(await repository.getCounts('USER#u1', '202611')).toEqual({ ai: 2, noAi: 5 });
    expect((send.mock.calls[0][0] as GetCommand).input.ConsistentRead).toBe(true);

    send.mockResolvedValueOnce({});
    expect(await repository.getCounts('USER#u1', '202611')).toEqual({ ai: 0, noAi: 0 });

    send.mockRejectedValueOnce(new Error('boom'));
    await expect(repository.getCounts('USER#u1', '202611')).rejects.toThrow();
  });

  it('IP は日と IP のハッシュをキーにして数える', async () => {
    send.mockResolvedValue({});

    expect(
      await repository.tryConsumeIp({ day: '20261105', ipHash: 'h1', limit: 20, ttlSec: 9 })
    ).toBe(true);

    expect((send.mock.calls[0][0] as UpdateCommand).input).toMatchObject({
      Key: { PK: 'USAGE_IP#20261105', SK: 'IP#h1' },
      ExpressionAttributeNames: { '#cnt': 'Count' },
    });

    send.mockRejectedValueOnce(conditionalCheckFailed());
    expect(
      await repository.tryConsumeIp({ day: '20261105', ipHash: 'h1', limit: 20, ttlSec: 9 })
    ).toBe(false);
  });

  it('塩が既にあればそれを返し、書き込まない', async () => {
    send.mockResolvedValueOnce({ Item: { Salt: 'existing' } });

    expect(await repository.getOrCreateDailySalt('20261105', 'new', 99)).toBe('existing');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('塩が無ければ条件付きで作る', async () => {
    send.mockResolvedValueOnce({}).mockResolvedValueOnce({});

    expect(await repository.getOrCreateDailySalt('20261105', 'new', 99)).toBe('new');

    const put = send.mock.calls[1][0] as PutCommand;
    expect(put).toBeInstanceOf(PutCommand);
    expect(put.input).toMatchObject({
      Item: { PK: 'USAGE_SALT#20261105', SK: 'USAGE_SALT#20261105', Salt: 'new', TTL: 99 },
      ConditionExpression: 'attribute_not_exists(PK)',
    });
  });

  it('同時に別のリクエストが塩を作っていたら、その塩を返す', async () => {
    send
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(conditionalCheckFailed())
      .mockResolvedValueOnce({ Item: { Salt: 'winner' } });

    expect(await repository.getOrCreateDailySalt('20261105', 'loser', 99)).toBe('winner');
  });

  it('塩の作成が競合したのに読めなければ例外を投げる', async () => {
    send
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(conditionalCheckFailed())
      .mockResolvedValueOnce({});

    await expect(repository.getOrCreateDailySalt('20261105', 'x', 99)).rejects.toThrow();
  });

  it('塩の障害は例外として投げる', async () => {
    send.mockRejectedValue(new Error('boom'));

    await expect(repository.getOrCreateDailySalt('20261105', 'x', 99)).rejects.toThrow();
  });
});
