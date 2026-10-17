// テスト実行前に DYNAMODB_TABLE_NAME を設定
process.env.DYNAMODB_TABLE_NAME = 'test-table';

import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  createBatchJob,
  getBatchJob,
  updateBatchJob,
  deleteBatchJob,
} from '../../src/db/batch-jobs';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('batch-jobs', () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  it('createBatchJob は PascalCase の属性名で作成する', async () => {
    ddbMock.on(PutCommand).resolves({});

    const result = await createBatchJob({ jobId: 'job-1', userId: 'user-1', status: 'SUBMITTED' });

    expect(result).toMatchObject({ jobId: 'job-1', userId: 'user-1', status: 'SUBMITTED' });
    expect(ddbMock.call(0).args[0].input).toMatchObject({
      TableName: 'test-table',
      Item: { PK: 'USER#user-1', SK: 'BATCH_JOB#job-1', JobID: 'job-1', Status: 'SUBMITTED' },
    });
  });

  it('getBatchJob は存在しなければ null を返す', async () => {
    ddbMock.on(GetCommand).resolves({});

    expect(await getBatchJob('job-1', 'user-1')).toBeNull();
  });

  it('updateBatchJob は更新後のジョブを返す', async () => {
    ddbMock.on(UpdateCommand).resolves({
      Attributes: {
        PK: 'USER#user-1',
        SK: 'BATCH_JOB#job-1',
        Type: 'BATCH_JOB',
        JobID: 'job-1',
        UserID: 'user-1',
        Status: 'RUNNING',
        CreatedAt: 1704067200000,
        UpdatedAt: 1704067201000,
      },
    });

    const result = await updateBatchJob('job-1', 'user-1', { status: 'RUNNING' });

    expect(result.status).toBe('RUNNING');
  });

  describe('deleteBatchJob', () => {
    it('対象がなくても成功し、存在を条件にしない削除を送る', async () => {
      ddbMock.on(DeleteCommand).resolves({});

      await expect(deleteBatchJob('job-1', 'user-1')).resolves.toBeUndefined();

      const input = ddbMock.call(0).args[0].input;
      expect(input).toMatchObject({ Key: { PK: 'USER#user-1', SK: 'BATCH_JOB#job-1' } });
      expect(input).not.toHaveProperty('ConditionExpression');
    });
  });
});
