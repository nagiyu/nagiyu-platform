/**
 * DynamoDBStudyUsageRepository のユニットテスト。
 *
 * DynamoDB クライアントをモックし、送信コマンドの内容を検証する。
 */

import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DatabaseError } from '@nagiyu/aws';
import { DynamoDBStudyUsageRepository } from '../../../src/repositories/dynamodb-study-usage.repository.js';

// 2026-11-05 12:00 JST
const NOW_MS = Date.parse('2026-11-05T03:00:00Z');
const tableName = 'nagiyu-livetalk-dev';

const makeClient = (send: jest.Mock) => ({ send }) as never;
const input = { userId: 'u1', characterId: 'hiyori', limit: 5, nowMs: NOW_MS };

describe('DynamoDBStudyUsageRepository', () => {
  it('利用者 × 日のアイテムのキャラクター別の属性を、上限付きで加算する', async () => {
    const send = jest.fn().mockResolvedValue({});
    const repo = new DynamoDBStudyUsageRepository(makeClient(send), tableName);

    expect(await repo.tryConsume(input)).toBe(true);

    const command = send.mock.calls[0][0] as UpdateCommand;
    expect(command).toBeInstanceOf(UpdateCommand);
    expect(command.input.TableName).toBe(tableName);
    expect(command.input.Key).toEqual({ PK: 'USER#u1', SK: 'STUDYUSAGE#20261105' });
    expect(command.input.ExpressionAttributeNames).toMatchObject({
      '#cnt': 'Count#hiyori',
      '#ttl': 'TTL',
    });
    expect(command.input.ExpressionAttributeValues).toMatchObject({
      ':limit': 5,
      ':type': 'StudyUsage',
      ':ttl': Date.parse('2026-11-06T15:00:00Z') / 1000,
    });
  });

  it('上限に達していたら false を返す', async () => {
    const send = jest
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('条件不一致'), { name: 'ConditionalCheckFailedException' })
      );
    const repo = new DynamoDBStudyUsageRepository(makeClient(send), tableName);

    expect(await repo.tryConsume(input)).toBe(false);
  });

  it('DynamoDB の障害は DatabaseError として投げる', async () => {
    const send = jest.fn().mockRejectedValue(new Error('障害'));
    const repo = new DynamoDBStudyUsageRepository(makeClient(send), tableName);

    await expect(repo.tryConsume(input)).rejects.toBeInstanceOf(DatabaseError);
  });
});
