import { GetCommand, UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBUsageCounter } from '../../../../src/dynamodb/counter/dynamodb-usage-counter';
import { InMemoryUsageCounter } from '../../../../src/dynamodb/counter/in-memory-usage-counter';
import type { UsageCounter } from '../../../../src/dynamodb/counter/usage-counter.interface';
import { InMemorySingleTableStore } from '../../../../src/dynamodb/in-memory/single-table-store';

const conditionalCheckFailed = (): Error => {
  const error = new Error('Conditional check failed');
  error.name = 'ConditionalCheckFailedException';
  return error;
};

const key = { PK: 'COUNT#a', SK: 'PERIOD#1' };
const input = { key, attribute: 'Count', limit: 2, ttlSec: 1000, itemType: 'COUNTER' };

describe('InMemoryUsageCounter', () => {
  let store: InMemorySingleTableStore;
  let counter: UsageCounter;

  beforeEach(() => {
    store = new InMemorySingleTableStore();
    counter = new InMemoryUsageCounter(store);
  });

  it('上限に達するまで加算し、達したら加算しない', async () => {
    expect(await counter.tryIncrement(input)).toBe(true);
    expect(await counter.tryIncrement(input)).toBe(true);
    expect(await counter.tryIncrement(input)).toBe(false);
    expect(await counter.read(key, ['Count'])).toEqual({ Count: 2 });
  });

  it('上限 0 以下では加算せず、アイテムも作らない', async () => {
    expect(await counter.tryIncrement({ ...input, limit: 0 })).toBe(false);
    expect(store.size()).toBe(0);
  });

  it('初回に Type と TTL を設定し、以降は上書きしない', async () => {
    await counter.tryIncrement(input);
    await counter.tryIncrement({ ...input, ttlSec: 9999 });

    expect(store.get(key.PK, key.SK)).toMatchObject({ Type: 'COUNTER', TTL: 1000, Count: 2 });
  });

  it('キーと属性ごとに別々に数える', async () => {
    await counter.tryIncrement(input);
    await counter.tryIncrement({ ...input, attribute: 'Other' });
    await counter.tryIncrement({ ...input, key: { PK: 'COUNT#b', SK: 'PERIOD#1' } });

    expect(await counter.read(key, ['Count', 'Other', 'Missing'])).toEqual({
      Count: 1,
      Other: 1,
      Missing: 0,
    });
  });

  it('同時に呼ばれても上限を超えない', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => counter.tryIncrement({ ...input, limit: 3 }))
    );

    expect(results.filter(Boolean)).toHaveLength(3);
  });

  it('減らしても 0 未満にならず、記録が無ければ何も作らない', async () => {
    await counter.decrement({ key, attribute: 'Count' });
    expect(store.size()).toBe(0);

    await counter.tryIncrement(input);
    await counter.decrement({ key, attribute: 'Count' });
    await counter.decrement({ key, attribute: 'Count' });

    expect(await counter.read(key, ['Count'])).toEqual({ Count: 0 });
  });
});

describe('DynamoDBUsageCounter', () => {
  let send: jest.Mock;
  let counter: DynamoDBUsageCounter;

  beforeEach(() => {
    send = jest.fn();
    counter = new DynamoDBUsageCounter({ send } as unknown as DynamoDBDocumentClient, 'test-table');
  });

  it('条件付きの ADD で 1 回の更新にし、TTL と Type は初回だけ設定する', async () => {
    send.mockResolvedValue({});

    expect(await counter.tryIncrement(input)).toBe(true);

    const command = send.mock.calls[0][0] as UpdateCommand;
    expect(command).toBeInstanceOf(UpdateCommand);
    expect(command.input).toMatchObject({
      TableName: 'test-table',
      Key: key,
      UpdateExpression: 'ADD #cnt :one SET #ttl = if_not_exists(#ttl, :ttl), #type = :type',
      ConditionExpression: 'attribute_not_exists(#cnt) OR #cnt < :limit',
      ExpressionAttributeNames: { '#cnt': 'Count', '#ttl': 'TTL', '#type': 'Type' },
      ExpressionAttributeValues: { ':one': 1, ':ttl': 1000, ':type': 'COUNTER', ':limit': 2 },
    });
  });

  it('上限に達していれば false を返す', async () => {
    send.mockRejectedValue(conditionalCheckFailed());

    expect(await counter.tryIncrement(input)).toBe(false);
  });

  it('上限 0 以下では DynamoDB を呼ばずに false を返す', async () => {
    expect(await counter.tryIncrement({ ...input, limit: 0 })).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('加算の障害は例外として投げる', async () => {
    send.mockRejectedValue(new Error('boom'));

    await expect(counter.tryIncrement(input)).rejects.toThrow();
  });

  it('減らすときは 0 を超えているときだけ 1 減らす', async () => {
    send.mockResolvedValue({});

    await counter.decrement({ key, attribute: 'Count' });

    expect((send.mock.calls[0][0] as UpdateCommand).input).toMatchObject({
      Key: key,
      UpdateExpression: 'ADD #cnt :minusOne',
      ConditionExpression: '#cnt > :zero',
      ExpressionAttributeNames: { '#cnt': 'Count' },
      ExpressionAttributeValues: { ':minusOne': -1, ':zero': 0 },
    });
  });

  it('減らす対象が 0 以下でも成功として扱い、障害は投げる', async () => {
    send.mockRejectedValueOnce(conditionalCheckFailed());
    await expect(counter.decrement({ key, attribute: 'Count' })).resolves.toBeUndefined();

    send.mockRejectedValueOnce(new Error('boom'));
    await expect(counter.decrement({ key, attribute: 'Count' })).rejects.toThrow();
  });

  it('強い整合性で読み、記録が無い属性は 0 にする', async () => {
    send.mockResolvedValueOnce({ Item: { Count: 2 } });
    expect(await counter.read(key, ['Count', 'Other'])).toEqual({ Count: 2, Other: 0 });
    expect((send.mock.calls[0][0] as GetCommand).input).toMatchObject({
      Key: key,
      ConsistentRead: true,
    });

    send.mockResolvedValueOnce({});
    expect(await counter.read(key, ['Count'])).toEqual({ Count: 0 });

    send.mockRejectedValueOnce(new Error('boom'));
    await expect(counter.read(key, ['Count'])).rejects.toThrow();
  });
});
