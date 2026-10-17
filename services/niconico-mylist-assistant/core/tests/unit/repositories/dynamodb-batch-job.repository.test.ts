/**
 * DynamoDB BatchJob Repository のテスト
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { DynamoDBBatchJobRepository } from '../../../src/repositories/dynamodb-batch-job.repository.js';
import { EntityAlreadyExistsError, EntityNotFoundError, DatabaseError } from '@nagiyu/aws';
import { parseUpdateExpression } from '../../helpers/update-expression.js';
import type { CreateBatchJobInput } from '../../../src/entities/batch-job.entity.js';

const ddbMock = mockClient(DynamoDBDocumentClient);

const CREATED_AT = 1704067200000;

const sampleItem = {
  PK: 'USER#user-1',
  SK: 'BATCH_JOB#job-1',
  Type: 'BATCH_JOB',
  JobID: 'job-1',
  UserID: 'user-1',
  Status: 'SUBMITTED',
  CreatedAt: CREATED_AT,
  UpdatedAt: CREATED_AT,
  TTL: Math.floor(CREATED_AT / 1000) + 7 * 24 * 60 * 60,
};

function conditionalCheckFailed(): Error {
  const error = new Error('ConditionalCheckFailedException');
  error.name = 'ConditionalCheckFailedException';
  return error;
}

describe('DynamoDBBatchJobRepository', () => {
  let repository: DynamoDBBatchJobRepository;
  const tableName = 'test-table';

  beforeEach(() => {
    ddbMock.reset();
    repository = new DynamoDBBatchJobRepository(
      ddbMock as unknown as DynamoDBDocumentClient,
      tableName
    );
  });

  describe('getById', () => {
    it('存在するバッチジョブを取得できる', async () => {
      ddbMock.on(GetCommand).resolves({ Item: sampleItem });

      const result = await repository.getById('job-1', 'user-1');

      expect(result).toEqual({
        jobId: 'job-1',
        userId: 'user-1',
        status: 'SUBMITTED',
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      });
      expect(ddbMock.commandCalls(GetCommand)[0].args[0].input).toMatchObject({
        TableName: tableName,
        Key: { PK: 'USER#user-1', SK: 'BATCH_JOB#job-1' },
      });
    });

    it('旧属性名 (camelCase) のアイテムも取得できる', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          PK: 'USER#user-1',
          SK: 'BATCH_JOB#job-1',
          Type: 'BATCH_JOB',
          jobId: 'job-1',
          userId: 'user-1',
          status: 'WAITING_FOR_2FA',
          twoFactorAuthCode: '123456',
          pushSubscription: {
            endpoint: 'https://push.example.com/abc',
            keys: { p256dh: 'p', auth: 'a' },
          },
          CreatedAt: CREATED_AT,
          UpdatedAt: CREATED_AT,
        },
      });

      const result = await repository.getById('job-1', 'user-1');

      expect(result).toEqual({
        jobId: 'job-1',
        userId: 'user-1',
        status: 'WAITING_FOR_2FA',
        twoFactorAuthCode: '123456',
        pushSubscription: {
          endpoint: 'https://push.example.com/abc',
          keys: { p256dh: 'p', auth: 'a' },
        },
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
      });
    });

    it('存在しないバッチジョブは null を返す', async () => {
      ddbMock.on(GetCommand).resolves({});

      expect(await repository.getById('job-1', 'user-1')).toBeNull();
    });

    it('DynamoDB エラーの場合は DatabaseError をスローする', async () => {
      ddbMock.on(GetCommand).rejects(new Error('DynamoDB error'));

      await expect(repository.getById('job-1', 'user-1')).rejects.toThrow(DatabaseError);
    });
  });

  describe('create', () => {
    const input: CreateBatchJobInput = {
      jobId: 'job-1',
      userId: 'user-1',
      status: 'SUBMITTED',
      pushSubscription: {
        endpoint: 'https://push.example.com/abc',
        keys: { p256dh: 'p', auth: 'a' },
      },
    };

    it('バッチジョブを PascalCase の属性名と TTL 付きで作成できる', async () => {
      ddbMock.on(PutCommand).resolves({});

      const result = await repository.create(input);

      expect(result).toMatchObject(input);
      expect(result.createdAt).toBeGreaterThan(0);
      expect(result.updatedAt).toBeGreaterThanOrEqual(result.createdAt);

      const putInput = ddbMock.commandCalls(PutCommand)[0].args[0].input;
      expect(putInput.TableName).toBe(tableName);
      expect(putInput.Item).toMatchObject({
        PK: 'USER#user-1',
        SK: 'BATCH_JOB#job-1',
        Type: 'BATCH_JOB',
        JobID: 'job-1',
        UserID: 'user-1',
        Status: 'SUBMITTED',
        PushSubscription: input.pushSubscription,
        CreatedAt: result.createdAt,
        TTL: Math.floor(result.createdAt / 1000) + 7 * 24 * 60 * 60,
      });
      expect(putInput.Item).not.toHaveProperty('jobId');
      expect(putInput.Item).not.toHaveProperty('pushSubscription');
    });

    it('既存の場合は存在しないことを条件にし、EntityAlreadyExistsError をスローする', async () => {
      ddbMock.on(PutCommand).rejects(conditionalCheckFailed());

      await expect(repository.create(input)).rejects.toThrow(EntityAlreadyExistsError);
      expect(ddbMock.commandCalls(PutCommand)[0].args[0].input.ConditionExpression).toContain(
        'attribute_not_exists'
      );
    });

    it('DynamoDB エラーの場合は DatabaseError をスローする', async () => {
      ddbMock.on(PutCommand).rejects(new Error('DynamoDB error'));

      await expect(repository.create(input)).rejects.toThrow(DatabaseError);
    });
  });

  describe('update', () => {
    it('指定した項目だけを保存用の属性名で更新し、TTL は書き換えない', async () => {
      ddbMock.on(UpdateCommand).resolves({
        Attributes: { ...sampleItem, Status: 'SUCCEEDED', CompletedAt: CREATED_AT + 1000 },
      });

      const result = await repository.update('job-1', 'user-1', {
        status: 'SUCCEEDED',
        result: { registeredCount: 1, failedCount: 0, totalCount: 1 },
        completedAt: CREATED_AT + 1000,
      });

      expect(result.status).toBe('SUCCEEDED');
      expect(result.completedAt).toBe(CREATED_AT + 1000);

      const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
      expect(input.Key).toEqual({ PK: 'USER#user-1', SK: 'BATCH_JOB#job-1' });
      const parsed = parseUpdateExpression(input);
      expect(parsed.set).toEqual({
        Status: 'SUCCEEDED',
        Result: { registeredCount: 1, failedCount: 0, totalCount: 1 },
        CompletedAt: CREATED_AT + 1000,
        UpdatedAt: expect.any(Number),
      });
      expect(parsed.set).not.toHaveProperty('TTL');
      // 旧名は更新した項目の分だけ同時に消す
      expect(parsed.remove).toEqual(expect.arrayContaining(['status', 'result']));
    });

    it('twoFactorAuthCode を null にすると属性を削除する', async () => {
      ddbMock.on(UpdateCommand).resolves({ Attributes: sampleItem });

      await repository.update('job-1', 'user-1', { twoFactorAuthCode: null });

      const parsed = parseUpdateExpression(ddbMock.commandCalls(UpdateCommand)[0].args[0].input);
      expect(parsed.remove).toEqual(
        expect.arrayContaining(['TwoFactorAuthCode', 'twoFactorAuthCode'])
      );
    });

    it('存在しないバッチジョブを更新すると EntityNotFoundError をスローする', async () => {
      ddbMock.on(UpdateCommand).rejects(conditionalCheckFailed());

      await expect(repository.update('job-1', 'user-1', { status: 'RUNNING' })).rejects.toThrow(
        EntityNotFoundError
      );
    });

    it('DynamoDB エラーの場合は DatabaseError をスローする', async () => {
      ddbMock.on(UpdateCommand).rejects(new Error('DynamoDB error'));

      await expect(repository.update('job-1', 'user-1', { status: 'RUNNING' })).rejects.toThrow(
        DatabaseError
      );
    });
  });

  describe('delete', () => {
    it('存在を条件にバッチジョブを削除できる', async () => {
      ddbMock.on(DeleteCommand).resolves({});

      await expect(repository.delete('job-1', 'user-1')).resolves.toBeUndefined();

      const input = ddbMock.commandCalls(DeleteCommand)[0].args[0].input;
      expect(input.Key).toEqual({ PK: 'USER#user-1', SK: 'BATCH_JOB#job-1' });
      expect(input.ConditionExpression).toContain('attribute_exists');
    });

    it('存在しないバッチジョブを削除すると EntityNotFoundError をスローする', async () => {
      ddbMock.on(DeleteCommand).rejects(conditionalCheckFailed());

      await expect(repository.delete('job-1', 'user-1')).rejects.toThrow(EntityNotFoundError);
    });

    it('DynamoDB エラーの場合は DatabaseError をスローする', async () => {
      ddbMock.on(DeleteCommand).rejects(new Error('DynamoDB error'));

      await expect(repository.delete('job-1', 'user-1')).rejects.toThrow(DatabaseError);
    });
  });

  describe('deleteIfExists', () => {
    it('対象がなくても成功し、存在を条件にしない', async () => {
      ddbMock.on(DeleteCommand).resolves({});

      await expect(repository.deleteIfExists('job-1', 'user-1')).resolves.toBeUndefined();

      const input = ddbMock.commandCalls(DeleteCommand)[0].args[0].input;
      expect(input.Key).toEqual({ PK: 'USER#user-1', SK: 'BATCH_JOB#job-1' });
      expect(input).not.toHaveProperty('ConditionExpression');
    });
  });
});
