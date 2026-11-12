import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DatabaseError, InMemorySingleTableStore } from '@nagiyu/aws';
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

  describe('tryConsumeWithIp', () => {
    const ipInput = { day: '20261105', ipHash: 'h1', limit: 2, ttlSec: 1000 };
    const monthly = { ...base, kind: 'noAi' as const, limit: 5 };
    const ip = async () => ipInput;

    it('ip を渡さなければ月の 1 回だけを数える', async () => {
      expect(await repository.tryConsumeWithIp({ monthly })).toEqual({ ok: true });
      expect(await repository.getCounts('USER#u1', '202611')).toEqual({ ai: 0, noAi: 1 });
    });

    it('月の 1 回と IP の 1 回を順に数え、IP の上限に達したら月の 1 回を戻して断る', async () => {
      const otherUser = (n: number) => ({ ...monthly, subject: `USER#u${n}` });
      expect(await repository.tryConsumeWithIp({ monthly: otherUser(1), ip })).toEqual({
        ok: true,
      });
      expect(await repository.tryConsumeWithIp({ monthly: otherUser(2), ip })).toEqual({
        ok: true,
      });

      expect(await repository.tryConsumeWithIp({ monthly: otherUser(3), ip })).toEqual({
        ok: false,
        denied: 'ip',
      });
      expect(await repository.getCounts('USER#u3', '202611')).toEqual({ ai: 0, noAi: 0 });
      // IP のハッシュが違えば別に数える
      expect(
        await repository.tryConsumeWithIp({
          monthly: otherUser(3),
          ip: async () => ({ ...ipInput, ipHash: 'h2' }),
        })
      ).toEqual({ ok: true });
    });

    it('月の上限で断ったときは IP の入力を作らず、IP も数えない', async () => {
      const makeIp = jest.fn(ip);

      expect(
        await repository.tryConsumeWithIp({ monthly: { ...monthly, limit: 0 }, ip: makeIp })
      ).toEqual({ ok: false, denied: 'monthly' });
      expect(makeIp).not.toHaveBeenCalled();
    });

    it('IP の入力を作る関数が失敗したら、月の 1 回を戻して例外を投げる', async () => {
      await expect(
        repository.tryConsumeWithIp({
          monthly,
          ip: async () => {
            throw new Error('boom');
          },
        })
      ).rejects.toThrow('boom');
      expect(await repository.getCounts('USER#u1', '202611')).toEqual({ ai: 0, noAi: 0 });
    });
  });

  it('その日の塩は最初に作られたものを全員が受け取る', async () => {
    expect(await repository.getOrCreateDailySalt('20261105', 'salt-a', 1000)).toBe('salt-a');
    expect(await repository.getOrCreateDailySalt('20261105', 'salt-b', 1000)).toBe('salt-a');
    expect(await repository.getOrCreateDailySalt('20261106', 'salt-b', 1000)).toBe('salt-b');
  });

  it('同時に塩を作ろうとしても、全員が同じ塩を受け取る', async () => {
    const salts = await Promise.all(
      ['a', 'b', 'c'].map((candidate) => repository.getOrCreateDailySalt('20261105', candidate, 9))
    );

    expect(new Set(salts).size).toBe(1);
  });

  it('保存される塩の Item に Type・TTL・作成更新時刻が入る', async () => {
    const store = new InMemorySingleTableStore();
    await new InMemoryUsageRepository(store).getOrCreateDailySalt('20261105', 'salt-a', 1000);

    expect(store.get('USAGE_SALT#20261105', 'USAGE_SALT#20261105')).toMatchObject({
      Type: 'USAGE_SALT',
      Salt: 'salt-a',
      TTL: 1000,
      CreatedAt: expect.any(Number),
      UpdatedAt: expect.any(Number),
    });
  });

  it('タイムスタンプの無い既存の塩 (旧版が書いた Item) も読める', async () => {
    const store = new InMemorySingleTableStore();
    store.put({
      PK: 'USAGE_SALT#20261105',
      SK: 'USAGE_SALT#20261105',
      Type: 'USAGE_SALT',
      Salt: 'legacy',
      TTL: 1000,
    } as unknown as Parameters<InMemorySingleTableStore['put']>[0]);

    expect(
      await new InMemoryUsageRepository(store).getOrCreateDailySalt('20261105', 'new', 1000)
    ).toBe('legacy');
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
    expect(
      await repository.tryConsumeWithIp({
        monthly: { ...base, kind: 'ai', limit: 0 },
        ip: async () => ({ day: 'd', ipHash: 'h', limit: 20, ttlSec: 1 }),
      })
    ).toEqual({ ok: false, denied: 'monthly' });
    expect(send).not.toHaveBeenCalled();
  });

  it('記録先の障害は例外として投げる', async () => {
    send.mockRejectedValue(new Error('boom'));

    await expect(repository.tryConsume({ ...base, kind: 'ai', limit: 3 })).rejects.toThrow();
    await expect(
      repository.tryConsumeWithIp({ monthly: { ...base, kind: 'ai', limit: 3 } })
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

  it('月の回数のあとに、日と IP のハッシュをキーにして IP を数える', async () => {
    send.mockResolvedValue({});
    const call = () =>
      repository.tryConsumeWithIp({
        monthly: { ...base, kind: 'ai', limit: 3 },
        ip: async () => ({ day: '20261105', ipHash: 'h1', limit: 20, ttlSec: 9 }),
      });

    expect(await call()).toEqual({ ok: true });

    expect((send.mock.calls[0][0] as UpdateCommand).input).toMatchObject({
      Key: { PK: 'USAGE#USER#u1', SK: 'MONTH#202611' },
    });
    expect((send.mock.calls[1][0] as UpdateCommand).input).toMatchObject({
      Key: { PK: 'USAGE_IP#20261105', SK: 'IP#h1' },
      ExpressionAttributeNames: { '#cnt': 'Count' },
    });
  });

  it('IP が断ったら月の回数を戻して denied ip を返す', async () => {
    send
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(conditionalCheckFailed())
      .mockResolvedValueOnce({});

    expect(
      await repository.tryConsumeWithIp({
        monthly: { ...base, kind: 'ai', limit: 3 },
        ip: async () => ({ day: '20261105', ipHash: 'h1', limit: 20, ttlSec: 9 }),
      })
    ).toEqual({ ok: false, denied: 'ip' });

    const rollback = send.mock.calls[2][0] as UpdateCommand;
    expect(rollback.input).toMatchObject({
      Key: { PK: 'USAGE#USER#u1', SK: 'MONTH#202611' },
      ExpressionAttributeValues: { ':minusOne': -1, ':zero': 0 },
    });
  });

  it('戻しが失敗しても握り、onRollbackError に渡す', async () => {
    send
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(conditionalCheckFailed())
      .mockRejectedValueOnce(new Error('release failed'));
    const onRollbackError = jest.fn();

    expect(
      await repository.tryConsumeWithIp({
        monthly: { ...base, kind: 'ai', limit: 3 },
        ip: async () => ({ day: '20261105', ipHash: 'h1', limit: 20, ttlSec: 9 }),
        onRollbackError,
      })
    ).toEqual({ ok: false, denied: 'ip' });
    expect(onRollbackError).toHaveBeenCalledTimes(1);
  });

  it('塩が無ければ、タイムスタンプ付きで条件付きに作る', async () => {
    send.mockResolvedValueOnce({}).mockResolvedValueOnce({});

    expect(await repository.getOrCreateDailySalt('20261105', 'new', 99)).toBe('new');

    expect(send).toHaveBeenCalledTimes(2);
    const firstGet = send.mock.calls[0][0] as GetCommand;
    expect(firstGet).toBeInstanceOf(GetCommand);
    expect(firstGet.input).toMatchObject({
      Key: { PK: 'USAGE_SALT#20261105', SK: 'USAGE_SALT#20261105' },
      ConsistentRead: true,
    });
    const put = send.mock.calls[1][0] as PutCommand;
    expect(put).toBeInstanceOf(PutCommand);
    expect(put.input).toMatchObject({
      TableName: 'test-table',
      Item: {
        PK: 'USAGE_SALT#20261105',
        SK: 'USAGE_SALT#20261105',
        Type: 'USAGE_SALT',
        Salt: 'new',
        TTL: 99,
        CreatedAt: expect.any(Number),
        UpdatedAt: expect.any(Number),
      },
      ConditionExpression: 'attribute_not_exists(#pk)',
    });
  });

  it('塩が既にあれば、強い整合性の Get 1 回だけで返し、書き込まない', async () => {
    send.mockResolvedValueOnce({
      Item: {
        PK: 'USAGE_SALT#20261105',
        SK: 'USAGE_SALT#20261105',
        Salt: 'existing',
        TTL: 99,
        CreatedAt: 1,
        UpdatedAt: 1,
      },
    });

    expect(await repository.getOrCreateDailySalt('20261105', 'new', 99)).toBe('existing');

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBeInstanceOf(GetCommand);
    expect((send.mock.calls[0][0] as GetCommand).input.ConsistentRead).toBe(true);
  });

  it('同時に別のリクエストが塩を作っていたら、強い整合性で読み直してその塩を返す', async () => {
    send
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(conditionalCheckFailed())
      .mockResolvedValueOnce({
        Item: {
          PK: 'USAGE_SALT#20261105',
          SK: 'USAGE_SALT#20261105',
          Salt: 'winner',
          TTL: 99,
          CreatedAt: 1,
          UpdatedAt: 1,
        },
      });

    expect(await repository.getOrCreateDailySalt('20261105', 'loser', 99)).toBe('winner');

    const get = send.mock.calls[2][0] as GetCommand;
    expect(get).toBeInstanceOf(GetCommand);
    expect(get.input).toMatchObject({
      Key: { PK: 'USAGE_SALT#20261105', SK: 'USAGE_SALT#20261105' },
      ConsistentRead: true,
    });
  });

  it('タイムスタンプの無い既存の塩 (旧版が書いた Item) も読める', async () => {
    send
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(conditionalCheckFailed())
      .mockResolvedValueOnce({
        Item: {
          PK: 'USAGE_SALT#20261105',
          SK: 'USAGE_SALT#20261105',
          Type: 'USAGE_SALT',
          Salt: 'legacy',
          TTL: 99,
        },
      });

    expect(await repository.getOrCreateDailySalt('20261105', 'new', 99)).toBe('legacy');
  });

  it('塩の作成が競合したのに読めなければ例外を投げる', async () => {
    send
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(conditionalCheckFailed())
      .mockResolvedValueOnce({});

    await expect(repository.getOrCreateDailySalt('20261105', 'x', 99)).rejects.toThrow();
  });

  it('塩が文字列でない既存の Item は例外として投げる', async () => {
    send
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(conditionalCheckFailed())
      .mockResolvedValueOnce({
        Item: { PK: 'USAGE_SALT#20261105', SK: 'USAGE_SALT#20261105', Salt: 1, TTL: 99 },
      });

    await expect(repository.getOrCreateDailySalt('20261105', 'x', 99)).rejects.toThrow();
  });

  it('塩の障害は DatabaseError として投げる', async () => {
    send.mockRejectedValue(new Error('boom'));

    await expect(repository.getOrCreateDailySalt('20261105', 'x', 99)).rejects.toBeInstanceOf(
      DatabaseError
    );
  });
});
