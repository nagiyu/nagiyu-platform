/**
 * DynamoDBStudyUsageRepository のユニットテスト。
 *
 * DynamoDB クライアントをモックし、送信コマンドの内容を検証する。
 */

import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DatabaseError } from '@nagiyu/aws';
import { STUDY_USAGE_ERROR_MESSAGES } from '../../../src/repositories/study-usage-counting.js';
import { DynamoDBStudyUsageRepository } from '../../../src/repositories/dynamodb-study-usage.repository.js';

const mockReport = jest.fn().mockResolvedValue(null);
jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  createErrorReporter: () => ({ report: (...args: unknown[]) => mockReport(...args) }),
}));

// 2026-11-05 12:00 JST
const NOW_MS = Date.parse('2026-11-05T03:00:00Z');
const tableName = 'nagiyu-livetalk-dev';

const makeClient = (send: jest.Mock) => ({ send }) as never;
const input = { userId: 'u1', characterId: 'hiyori', limit: 5, totalLimit: 20, nowMs: NOW_MS };

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
    // 続けて利用者合計の属性を数える
    const total = send.mock.calls[1][0] as UpdateCommand;
    expect(total.input.ExpressionAttributeNames).toMatchObject({ '#cnt': 'Count#total' });
    expect(total.input.ExpressionAttributeValues).toMatchObject({ ':limit': 20 });
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

  const conditionFailed = () =>
    Object.assign(new Error('条件不一致'), { name: 'ConditionalCheckFailedException' });

  it('キャラクター別が断ったら合計には触れない', async () => {
    const send = jest.fn().mockRejectedValue(conditionFailed());
    const repo = new DynamoDBStudyUsageRepository(makeClient(send), tableName);

    expect(await repo.tryConsume(input)).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('合計だけが断ったら、キャラクター別を戻して false を返す', async () => {
    const send = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(conditionFailed())
      .mockResolvedValueOnce({});
    const repo = new DynamoDBStudyUsageRepository(makeClient(send), tableName);

    expect(await repo.tryConsume(input)).toBe(false);
    const rollback = send.mock.calls[2][0] as UpdateCommand;
    expect(rollback.input.ExpressionAttributeValues).toMatchObject({ ':minusOne': -1 });
    expect(rollback.input.ExpressionAttributeNames).toMatchObject({ '#cnt': 'Count#hiyori' });
  });

  it('戻しに失敗しても false を返し、エラーイベントに報告する (1 回分多く数えたままになる)', async () => {
    const send = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(conditionFailed())
      .mockRejectedValueOnce(new Error('戻し失敗'));
    const repo = new DynamoDBStudyUsageRepository(makeClient(send), tableName);

    expect(await repo.tryConsume(input)).toBe(false);
    expect(mockReport).toHaveBeenCalledWith(
      STUDY_USAGE_ERROR_MESSAGES.ROLLBACK_FAILED,
      expect.any(DatabaseError),
      { context: { attribute: 'Count#hiyori' } }
    );
  });

  it('合計の加算が障害なら、キャラクター別を戻して投げる', async () => {
    const send = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('障害'))
      .mockResolvedValueOnce({});
    const repo = new DynamoDBStudyUsageRepository(makeClient(send), tableName);

    await expect(repo.tryConsume(input)).rejects.toBeInstanceOf(DatabaseError);
    expect(send).toHaveBeenCalledTimes(3);
  });
});
